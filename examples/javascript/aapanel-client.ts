/**
 * Минимальная типизированная обёртка над API aaPanel для управления
 * Node.js-проектами (эндпоинты /v2/project/nodejs/...).
 *
 * ⚠️ ТОЛЬКО ДЛЯ СЕРВЕРА. Сессионный токен — секрет. Никогда не импортируй
 *    и не используй этот файл в клиентском (браузерном) коде: токен утечёт,
 *    плюс помешают CORS и whitelist панели по IP. В Next.js — только в
 *    route handlers / server actions / API routes.
 *
 * Требования: Node.js 18+ (глобальный fetch). Документация методов:
 *   ../../docs/ru/nodejs-projects.md  ·  ../../docs/en/nodejs-projects.md
 */

// ────────────────────────────── Типы ──────────────────────────────

export interface AaPanelClientConfig {
  /** Базовый адрес панели без слэша в конце, напр. https://192.168.0.10:41192 */
  baseUrl: string;
  /** Сессионный токен из адресной строки браузера (apsess_...). Временный. */
  sessionToken: string;
  /**
   * Отключить проверку SSL-сертификата (панель обычно с самоподписанным).
   * ⚠️ Только для доверенной сети / локальных тестов. В production лучше
   * добавить CA панели, а не отключать проверку.
   */
  insecureTLS?: boolean;
  /** Таймаут запроса в мс (по умолчанию 15000). */
  timeoutMs?: number;
}

export type BatchOperationType = "start" | "stop" | "reload";

export interface ProjectListParams {
  /** Номер страницы, с 1. По умолчанию 1. */
  p?: number;
  /** Количество на странице. По умолчанию 10. */
  limit?: number;
  /** Поиск по имени проекта. */
  search?: string;
  /** Порядок сортировки. */
  re_order?: string;
}

export interface ModifyProjectParams {
  project_cwd: string;
  project_name: string;
  /** Команда из package.json: "start", "dev" и т.д. (см. getRunList). */
  project_script: string;
  port: string;
  /** Пользователь ОС, напр. "www" или "root". */
  run_user: string;
  /** Версия Node.js, напр. "v24.13.0" (см. getNodeVersions). */
  nodejs_version: string;
  /** Примечание к проекту. */
  project_ps: string;
  /** Автозапуск с системой: 1 — да, 0 — нет. */
  is_power_on: 0 | 1;
}

/**
 * Точная форма ответа зависит от версии aaPanel. Уточни типы под свою
 * панель, понаблюдав ответы в DevTools, и замени `unknown` на конкретику.
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

export class AaPanelNodeClient {
  private readonly baseUrl: string;
  private readonly sessionToken: string;
  private readonly insecureTLS: boolean;
  private readonly timeoutMs: number;

  constructor(config: AaPanelClientConfig) {
    if (!config.baseUrl) throw new Error("AaPanelNodeClient: baseUrl is required");
    if (!config.sessionToken) throw new Error("AaPanelNodeClient: sessionToken is required");

    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.sessionToken = config.sessionToken;
    this.insecureTLS = config.insecureTLS ?? false;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  // ── Методы API ──

  /** 1. Список проектов. */
  listProjects(params: ProjectListParams = {}): Promise<AaPanelResponse> {
    return this.request("get_project_list", {
      p: params.p ?? 1,
      limit: params.limit ?? 10,
      search: params.search ?? "",
      re_order: params.re_order ?? "",
    });
  }

  /** 2. Информация о проекте. */
  getProjectInfo(projectName: string): Promise<AaPanelResponse> {
    return this.request("get_project_info", { project_name: projectName });
  }

  /** 3. Команды запуска из package.json (start, dev, ...). */
  getRunList(projectCwd: string): Promise<AaPanelResponse> {
    return this.request("get_run_list", { project_cwd: projectCwd });
  }

  /** 4. Доступные версии Node.js. */
  getNodeVersions(): Promise<AaPanelResponse> {
    return this.request("get_nodejs_version", {});
  }

  /** 5. Старт / стоп / рестарт одного или нескольких проектов. */
  batchOperation(
    projectNames: string | string[],
    type: BatchOperationType,
  ): Promise<AaPanelResponse> {
    const ids = Array.isArray(projectNames) ? projectNames.join(",") : projectNames;
    return this.request("batch_operation_project", { ids, type });
  }

  /** 5a. Запустить проект. */
  startProject(projectName: string): Promise<AaPanelResponse> {
    return this.batchOperation(projectName, "start");
  }

  /** 5b. Остановить проект. */
  stopProject(projectName: string): Promise<AaPanelResponse> {
    return this.batchOperation(projectName, "stop");
  }

  /** 5c. Перезапустить проект. */
  restartProject(projectName: string): Promise<AaPanelResponse> {
    return this.batchOperation(projectName, "reload");
  }

  /** 6. Изменить настройки проекта. */
  modifyProject(params: ModifyProjectParams): Promise<AaPanelResponse> {
    return this.request("modify_project", params);
  }

  // ── Внутреннее ──

  /** Выполняет POST к эндпоинту nodejs с телом data=<urlencoded JSON>. */
  private async request(
    endpoint: string,
    data: Record<string, unknown>,
  ): Promise<AaPanelResponse> {
    const url = `${this.baseUrl}/${this.sessionToken}/v2/project/nodejs/${endpoint}`;
    const body = new URLSearchParams({ data: JSON.stringify(data) });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const init: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
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
          `aaPanel ${endpoint} failed: HTTP ${response.status}`,
          response.status,
          text,
        );
      }

      // Панель обычно отвечает JSON; на всякий случай отдаём текст как fallback.
      try {
        return JSON.parse(text) as AaPanelResponse;
      } catch {
        return text;
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

// ─────────────── Вспомогательное: dispatcher без проверки TLS ───────────────

let cachedDispatcher: unknown;

/** Лениво создаёт undici Agent с отключённой проверкой сертификата. */
async function getInsecureDispatcher(): Promise<unknown> {
  if (!cachedDispatcher) {
    const { Agent } = await import("undici");
    cachedDispatcher = new Agent({ connect: { rejectUnauthorized: false } });
  }
  return cachedDispatcher;
}

/*
 * Пример использования (server-side):
 *
 *   import { AaPanelNodeClient } from "./aapanel-client";
 *
 *   const client = new AaPanelNodeClient({
 *     baseUrl: process.env.AAPANEL_BASE_URL!,         // https://<server>:<port>
 *     sessionToken: process.env.AAPANEL_SESSION_TOKEN!, // apsess_...
 *     insecureTLS: true,                               // самоподписанный сертификат
 *   });
 *
 *   const projects = await client.listProjects({ limit: 20 });
 *   await client.startProject("crmtest2");
 */
