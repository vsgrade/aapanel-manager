import {z} from 'zod';

const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => {
    try {return ['http:', 'https:'].includes(new URL(u).protocol);} catch {return false;}
  }, 'Must be an http(s) URL');

const optionalTag = z
  .string()
  .trim()
  .max(50)
  .optional()
  .transform((v) => (v === '' || v == null ? undefined : v));

const apiSk = z.string().trim().min(16, 'api_sk looks too short').max(200);

// Form boolean: "true"/"on"/"1"/true → true; explicit "false"/"off"/"0"/"" → false;
// absent (undefined) → true (self-signed panels are the norm, so insecure TLS defaults on).
const insecureTLS = z.preprocess(
  (v) => (v === undefined ? true : v === true || v === 'true' || v === 'on' || v === '1'),
  z.boolean(),
);

export const serverCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  baseUrl: httpUrl,
  apiSk,
  tag: optionalTag,
  insecureTLS,
});

export const serverUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  baseUrl: httpUrl,
  apiSk: apiSk.optional().or(z.literal('').transform(() => undefined)), // blank = keep existing
  tag: optionalTag,
  insecureTLS,
});

export const testConnectionSchema = z.object({
  id: z.string().min(1).optional(),
  baseUrl: httpUrl,
  apiSk: apiSk.optional().or(z.literal('').transform(() => undefined)),
  insecureTLS,
});

// List params come from the URL: must NEVER throw. Each field tolerates arrays
// (duplicated params → take first) and falls back to a safe default on bad input.
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);

export const serverListParamsSchema = z.object({
  page: z.preprocess(first, z.coerce.number().int().min(1).catch(1)),
  pageSize: z.preprocess(
    first,
    z.coerce.number().int().catch(25).transform((n) => Math.min(100, Math.max(5, n))),
  ),
  q: z.preprocess(first, z.string().trim().max(100).optional().catch(undefined)),
  status: z.preprocess(first, z.enum(['all', 'online', 'offline', 'unknown']).catch('all')),
  tag: z.preprocess(first, z.string().trim().max(50).optional().catch(undefined)),
  sort: z.preprocess(first, z.enum(['name', 'tag', 'createdAt', 'lastCheckedAt', 'cpu', 'mem']).catch('name')),
  dir: z.preprocess(first, z.enum(['asc', 'desc']).catch('asc')),
});

export type ServerCreateInput = z.infer<typeof serverCreateSchema>;
export type ServerUpdateInput = z.infer<typeof serverUpdateSchema>;
export type ServerListParams = z.infer<typeof serverListParamsSchema>;
