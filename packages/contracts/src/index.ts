import { z } from 'zod';
export const HealthSchema = z.strictObject({ status: z.literal('ok'), service: z.literal('ai-flow-api') });
export type Health = z.infer<typeof HealthSchema>;
export * from './primitives.js';
export * from './entities.js';
export * from './handoff.js';
export * from './demo.js';
