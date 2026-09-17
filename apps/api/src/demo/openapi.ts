import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv } from 'ajv';
import { z } from 'zod';
export async function validateContract(text: string) {
  const value: unknown = JSON.parse(text);
  function check(node: unknown) {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (key === '$ref' && (typeof child !== 'string' || !child.startsWith('#/'))) throw new Error('Contract chỉ được tham chiếu schema nội bộ.');
      check(child);
    }
  }
  check(value);
  const object = z.object({ openapi: z.literal('3.0.3'), paths: z.record(z.string(), z.unknown()) }).parse(value);
  if (!Object.keys(object.paths).length) throw new Error('Contract phải có endpoint.');
  // Parser resolves local references only; model-provided URLs never reach the network.
  await SwaggerParser.validate(value as Parameters<typeof SwaggerParser.validate>[0], { resolve: { external: false }, dereference: { circular: false } });
  return value;
}
export async function validateMocks(contractText: string, mocksText: string) {
  const contract = await validateContract(contractText) as { paths: Record<string, Record<string, { responses: Record<string, { content?: Record<string, { schema?: object }> }> }>> };
  const mocks = z.strictObject({ responses: z.array(z.strictObject({ method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']), path: z.string(), status: z.number().int().min(100).max(599), body: z.unknown() })).min(1) }).parse(JSON.parse(mocksText));
  const ajv = new Ajv({ strict: false, validateFormats: false });
  const seen = new Set<string>();
  for (const mock of mocks.responses) {
    const key = `${mock.method} ${mock.path} ${mock.status}`;
    if (seen.has(key)) throw new Error('Mock response trùng.'); seen.add(key);
    const response = contract.paths[mock.path]?.[mock.method.toLowerCase()]?.responses[String(mock.status)];
    const schema = response?.content?.['application/json']?.schema;
    if (!schema || !ajv.compile(schema)(mock.body)) throw new Error(`Mock không khớp contract: ${key}`);
  }
}
