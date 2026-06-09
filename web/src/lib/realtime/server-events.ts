import 'server-only';
import {EventEmitter} from 'node:events';
import {Client} from 'pg';
import {SERVER_EVENTS_CHANNEL, parseServerEvent, type ServerEvent} from './channel';
import {log} from '@/log';

type Globals = typeof globalThis & {__serverEvents?: ServerEventsHub};

class ServerEventsHub {
  private emitter = new EventEmitter();
  private client?: Client;
  private connecting = false;

  constructor() {
    this.emitter.setMaxListeners(0); // many concurrent SSE subscribers
  }

  private async ensureClient(): Promise<void> {
    if (this.client || this.connecting) return;
    this.connecting = true;
    try {
      const client = new Client({connectionString: process.env.DATABASE_URL});
      client.on('notification', (msg) => {
        if (!msg.payload) return;
        const evt = parseServerEvent(msg.payload);
        if (evt) this.emitter.emit('event', evt);
      });
      client.on('error', (err) => {
        log.error({err}, 'server-events LISTEN client error; will reconnect on next subscribe');
        this.client = undefined;
      });
      client.on('end', () => {
        this.client = undefined;
      });
      await client.connect();
      await client.query(`LISTEN ${SERVER_EVENTS_CHANNEL}`);
      this.client = client;
      log.info('server-events: LISTEN established');
    } catch (err) {
      log.error({err}, 'server-events: failed to establish LISTEN');
    } finally {
      this.connecting = false;
    }
  }

  subscribe(cb: (evt: ServerEvent) => void): () => void {
    void this.ensureClient(); // lazy connect; retried on the next subscribe if it failed
    this.emitter.on('event', cb);
    return () => this.emitter.off('event', cb);
  }
}

function getHub(): ServerEventsHub {
  const g = globalThis as Globals;
  g.__serverEvents ??= new ServerEventsHub();
  return g.__serverEvents;
}

/** Subscribe to live server status events; returns an unsubscribe fn. */
export function subscribeToServerEvents(cb: (evt: ServerEvent) => void): () => void {
  return getHub().subscribe(cb);
}
