import {z} from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex chars (32 bytes)'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(16),
  // Run the background poller inside the web process. Set to "false" only when
  // running a dedicated worker process instead. Anything other than
  // false/0/no/off counts as enabled. (z.coerce.boolean is intentionally NOT
  // used — it maps the string "false" to true.)
  ENABLE_POLLER: z
    .string()
    .default('true')
    .transform((v) => !['false', '0', 'no', 'off'].includes(v.trim().toLowerCase())),
  // Filesystem root for self-update releases (aaPanel/systemd modes). Layout:
  //   <root>/releases/<version>/   unpacked release bundles
  //   <root>/current               symlink → the active release (aaPanel cwd)
  //   <root>/backups/              pre-update DB dumps
  //   <root>/tmp/                  download scratch space
  // Optional: when unset, self-update staging is disabled (the panel still
  // shows versions and the manual upgrade command).
  APP_RELEASE_ROOT: z
    .string()
    .trim()
    .min(1)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, unknown> = process.env): Env {
  return EnvSchema.parse(source);
}

// NOTE: eager `env` export is intentionally omitted — calling parseEnv() at
// module load time throws in test/CI environments that lack the required vars.
// Call parseEnv() explicitly at app startup (e.g., in instrumentation.ts).
