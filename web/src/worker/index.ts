import {parseEnv} from '@/env';
import {prisma} from '@/lib/db/prisma';
import {refreshServerStatus} from '@/lib/servers/status';
import {runPollCycle} from './poll-cycle';
import {log} from '@/log';

async function main(): Promise<void> {
  const env = parseEnv();
  log.info({interval: env.POLL_INTERVAL_MS, concurrency: env.WORKER_CONCURRENCY}, 'worker: starting');

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const servers = await prisma.server.findMany({select: {id: true}});
      const res = await runPollCycle(
        servers.map((s) => s.id),
        env.WORKER_CONCURRENCY,
        async (id) => {
          const r = await refreshServerStatus(id);
          return {ok: r.ok, online: r.online};
        },
      );
      log.info(res, 'worker: cycle complete');
    } catch (err) {
      log.error({err}, 'worker: cycle failed');
    } finally {
      if (!stopped) timer = setTimeout(() => void tick(), env.POLL_INTERVAL_MS);
    }
  };

  const shutdown = async (sig: string): Promise<void> => {
    log.info({sig}, 'worker: shutting down');
    stopped = true;
    if (timer) clearTimeout(timer);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await tick();
}

void main();
