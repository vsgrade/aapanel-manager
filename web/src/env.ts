import {z} from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  APP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex chars (32 bytes)'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(16),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, unknown> = process.env): Env {
  return EnvSchema.parse(source);
}

// NOTE: eager `env` export is intentionally omitted — calling parseEnv() at
// module load time throws in test/CI environments that lack the required vars.
// Call parseEnv() explicitly at app startup (e.g., in instrumentation.ts).
