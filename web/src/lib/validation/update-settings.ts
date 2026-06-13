import {z} from 'zod';
import {DEPLOYMENT_MODES} from '@/lib/version/types';

/** A GitHub owner/repo segment, or empty (feature simply stays "not configured"). */
const ghSegment = z
  .string()
  .trim()
  .max(100)
  .regex(/^[A-Za-z0-9._-]*$/, 'Letters, digits, dot, dash, underscore only')
  .optional()
  .transform((v) => v ?? '');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

export const updateSettingsSchema = z.object({
  deploymentMode: z.enum(DEPLOYMENT_MODES),
  githubOwner: ghSegment,
  githubRepo: ghSegment,
  // Blank keeps the stored token; a value replaces it.
  githubToken: z
    .string()
    .max(255)
    .optional()
    .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined)),
  aapanelServerId: optionalText(64),
  aapanelProject: optionalText(64),
  startScript: optionalText(64),
  serviceName: optionalText(64),
});

export type UpdateSettingsFormInput = z.infer<typeof updateSettingsSchema>;
