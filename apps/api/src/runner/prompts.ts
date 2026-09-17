import type { DemoRole } from '@ai-flow/contracts';
export const requiredFiles: Record<DemoRole, string[]> = {
  requirements: ['requirements.md'], docs_reviewer: ['review.md'],
  api_contract: ['openapi.json', 'api-notes.md'], planner: ['plan.md'],
  frontend: ['app/page.tsx', 'app/globals.css', 'mocks.json', 'README.md'],
};
export const roleInstructions: Record<DemoRole, string> = {
  requirements: 'Write concise requirements.md in Vietnamese. Keep one-page demo scope. Define AC01 etc, user flows, in/out scope. Use reasonable documented assumptions for minor ambiguities. Only block for essential ambiguity.',
  docs_reviewer: 'Review requirements provided by the previous independent agent. Write review.md, check clarity, scope and testability. reviewVerdict must be PASS or CHANGES_REQUESTED. Do not rewrite requirements or expand scope. PASS for a feasible small mocked frontend.',
  api_contract: 'Create OpenAPI 3.0.3 JSON in openapi.json: info, paths, schemas, requests, responses, errors, examples. Only local #/ references. No servers/network dependencies. Include at least one endpoint and concrete response examples. api-notes.md explains how FE uses mocked API data. There is no real backend.',
  planner: 'Read all supplied requirements, review and OpenAPI. Write plan.md with small frontend tasks, dependencies, acceptance IDs and exact endpoints/schema mapping. FE is a single-page Next.js app using mock data. No backend, database, deployment or extra dependencies.',
  frontend: `Produce only app/page.tsx, app/globals.css, mocks.json, README.md. A fixed Next.js static-export scaffold is supplied by the orchestrator; do not output package.json or config. app/page.tsx must begin with "use client"; default export Page, use React hooks and import mocks from "../mocks.json". Only import from react or ../mocks.json. No remote fonts/images, network calls, dynamic imports, eval, server actions or backend. All UI data is mocked and clearly labeled "Dữ liệu mock". mocks.json shape: {"responses":[{"method":"GET","path":"/endpoint","status":200,"body":<example matching the supplied OpenAPI response schema>}]}. Use these responses in the UI, not a separate hardcoded dataset. Implement the approved one-page behavior with in-memory updates. README explains mock limitations and npm ci / npm run dev / npm run build. Include an explicit visible "Dữ liệu mock" banner; layout will also mark mock mode. Keep TypeScript strict-compatible.`,
};
