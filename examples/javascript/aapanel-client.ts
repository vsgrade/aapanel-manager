/**
 * Типизированная обёртка над API aaPanel: управление Node.js-проектами
 * и мониторинг сервера. Поддерживает две схемы авторизации:
 *
 *   - "apiKey"  — постоянный ключ api_sk (РЕКОМЕНДУЕТСЯ для приложений).
 *                 URL на корне, подпись request_time + request_token.
 *   - "session" — временная сессия браузера (apsess + x-http-token + cookie).
 *                 Удобна для разведки, но токен протухает.
 *
 * ⚠️ ТОЛЬКО ДЛЯ СЕРВЕРА. Ключ api_sk даёт полный доступ к серверу — никогда
 *    не используй этот файл в браузерном коде. В Next.js — только в route
 *    handlers / server actions. Секреты — из переменных окружения.
 *
 * Требования: Node.js 18+ (глобальный fetch, node:crypto). Документация:
 *   ../../docs/ru/authentication.md · ../../docs/ru/nodejs-projects.md
 */

import { createHash } from "node:crypto";

// ────────────────────────────── Типы ──────────────────────────────

/** Авторизация постоянным ключом api_sk (рекомендуется). */
export interface ApiKeyAuth {
  mode: "apiKey";
  /** Ключ из «Настройки → API». */
  apiSk: string;
}

/** Авторизация сессией браузера (временная). */
export interface SessionAuth {
  mode: "session";
  /** Токен apsess_... из адресной строки. */
  sessionToken: string;
  /** Заголовок x-http-token из запросов панели. */
  httpToken: string;
  /** Session-cookie браузера (целиком, в формате name=value). */
  cookie: string;
}

export type AaPanelAuth = ApiKeyAuth | SessionAuth;

export interface AaPanelClientConfig {
  /**
   * Базовый адрес панели без слэша в конце, напр. https://192.168.0.10:8888.
   * Для apiKey — БЕЗ защитного входа и без apsess (корень).
   */
  baseUrl: string;
  auth: AaPanelAuth;
  /** Отключить проверку самоподписанного SSL (только доверенная сеть/тесты). */
  insecureTLS?: boolean;
  /** Таймаут запроса в мс (по умолчанию 15000). */
  timeoutMs?: number;
}

export type BatchOperationType = "start" | "stop" | "restart";

export interface ProjectListParams {
  p?: number;
  limit?: number;
  search?: string;
  re_order?: string;
}

/**
 * Точная форма ответа зависит от версии aaPanel. Уточняй типы под свою
 * панель, понаблюдав ответы (DevTools), и заменяй `unknown` на конкретику.
 */
export type AaPanelResponse = unknown;

/** Ошибка обращения к API aaPanel. */
export class AaPanelError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "AaPanelError";
  }
}

// ──────────────────────────── Клиент ────────────────────────────

export class AaPanelClient {
  private readonly baseUrl: string;
  private readonly auth: AaPanelAuth;
  private readonly insecureTLS: boolean;
  private readonly timeoutMs: number;

  constructor(config: AaPanelClientConfig) {
    if (!config.baseUrl) throw new Error("AaPanelClient: baseUrl is required");
    if (!config.auth) throw new Error("AaPanelClient: auth is required");
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.auth = config.auth;
    this.insecureTLS = config.insecureTLS ?? false;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  // ── Node.js-проекты ──

  /** Список проектов + статусы + CPU/RAM (главный метод для дашборда). */
  listProjects(params: ProjectListParams = {}): Promise<AaPanelResponse> {
    return this.requestNode("get_project_list", {
      p: params.p ?? 1,
      limit: params.limit ?? 10,
      search: params.search ?? "",
      re_order: params.re_order ?? "",
    });
  }

  /** Информация об одном проекте. */
  getProjectInfo(projectName: string): Promise<AaPanelResponse> {
    return this.requestNode("get_project_info", { project_name: projectName });
  }

  /** Команды запуска из package.json. */
  getRunList(projectCwd: string): Promise<AaPanelResponse> {
    return this.requestNode("get_run_list", { project_cwd: projectCwd });
  }

  /** Доступные версии Node.js. */
  getNodeVersions(): Promise<AaPanelResponse> {
    return this.requestNode("get_nodejs_version", null);
  }

  /** Старт / стоп / рестарт одного или нескольких проектов по имени. */
  batchOperation(
    projectNames: string | string[],
    type: BatchOperationType,
  ): Promise<AaPanelResponse> {
    const names = Array.isArray(projectNames) ? projectNames : [projectNames];
    // ВНИМАНИЕ: формат особый — поля напрямую, имена — JSON-массивом.
    return this.request("v2/project/nodejs/batch_operation_project", {
      project_names: JSON.stringify(names),
      operation_type: type,
    });
  }

  startProject(name: string): Promise<AaPanelResponse> {
    return this.batchOperation(name, "start");
  }
  stopProject(name: string): Promise<AaPanelResponse> {
    return this.batchOperation(name, "stop");
  }
  restartProject(name: string): Promise<AaPanelResponse> {
    return this.batchOperation(name, "restart");
  }

  // ── Мониторинг сервера ──

  /** CPU/RAM/ядра/ОС/версия/аптайм сервера. */
  getSystemTotal(): Promise<AaPanelResponse> {
    return this.request("system?action=GetSystemTotal", {});
  }

  /** Использование дисков. */
  getDiskInfo(): Promise<AaPanelResponse> {
    return this.request("system?action=GetDiskInfo", {});
  }

  // ── Внутреннее ──

  /** Обёртка над Node.js-методами: параметры идут в поле data=<json>. */
  private requestNode(
    method: string,
    data: Record<string, unknown> | null,
  ): Promise<AaPanelResponse> {
    return this.request(`v2/project/nodejs/${method}`, {
      data: data === null ? "" : JSON.stringify(data),
    });
  }

  /**
   * Базовый POST. `endpointPath` — путь после baseUrl (может включать ?action).
   * `fields` — поля тела (form-urlencoded). Авторизация добавляется здесь.
   */
  private async request(
    endpointPath: string,
    fields: Record<string, string>,
  ): Promise<AaPanelResponse> {
    const params = new URLSearchParams(fields);
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    let url: string;
    if (this.auth.mode === "apiKey") {
      const requestTime = Math.floor(Date.now() / 1000);
      params.set("request_time", String(requestTime));
      params.set("request_token", signToken(requestTime, this.auth.apiSk));
      url = `${this.baseUrl}/${endpointPath}`;
    } else {
      headers["x-http-token"] = this.auth.httpToken;
      headers["Cookie"] = this.auth.cookie;
      url = `${this.baseUrl}/${this.auth.sessionToken}/${endpointPath}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const init: RequestInit = {
        method: "POST",
        headers,
        body: params,
        signal: controller.signal,
      };
      if (this.insecureTLS) {
        // fetch в Node (undici) принимает dispatcher; в типах RequestInit его нет.
        (init as Record<string, unknown>).dispatcher = await getInsecureDispatcher();
      }

      const response = await fetch(url, init);
      const text = await response.text();
      if (!response.ok) {
        throw new AaPanelError(
          `aaPanel ${endpointPath} failed: HTTP ${response.status}`,
          response.status,
          text,
        );
      }
      try {
        return JSON.parse(text) as AaPanelResponse;
      } catch {
        return text; // на случай не-JSON ответа
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─────────────────────────── Вспомогательное ───────────────────────────

/** request_token = md5( request_time + md5(api_sk) ). */
function signToken(requestTime: number, apiSk: string): string {
  const skMd5 = createHash("md5").update(apiSk).digest("hex");
  return createHash("md5").update(`${requestTime}${skMd5}`).digest("hex");
}

let cachedDispatcher: unknown;
/** Лениво создаёт undici Agent с отключённой проверкой TLS. */
async function getInsecureDispatcher(): Promise<unknown> {
  if (!cachedDispatcher) {
    const { Agent } = await import("undici");
    cachedDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  }
  return cachedDispatcher;
}

/*
 * Пример (server-side):
 *
 *   import { AaPanelClient } from "./aapanel-client";
 *
 *   // Рекомендуется — постоянный ключ:
 *   const client = new AaPanelClient({
 *     baseUrl: process.env.AAPANEL_BASE_URL!,   // https://<server>:<port>  (корень!)
 *     auth: { mode: "apiKey", apiSk: process.env.AAPANEL_API_SK! },
 *     insecureTLS: true,                         // самоподписанный сертификат
 *   });
 *
 *   const projects = await client.listProjects({ limit: 20 });
 *   const sys = await client.getSystemTotal();
 *   await client.startProject("myapp");
 */
