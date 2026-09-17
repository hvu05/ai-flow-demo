# AI Flow

Demo điều phối **5 agent Codex CLI độc lập**: Requirements → Reviewer → API Contract → Planner → **bạn duyệt tài liệu** → Frontend. Mỗi nhiệm vụ chạy một phiên mới và bàn giao bằng file/ref/hash. Backend NestJS điều phối và lưu JSON; React/Vite hiển thị flow, tài liệu, log và source FE.

## Chạy bằng Docker

```sh
cd ~/Documents/ai-flow
docker compose up --build -d
docker compose exec app codex login --device-auth
```

Mở **http://localhost:8090**, bấm **Kiểm tra lại**, nhập ý tưởng và bắt đầu. [Hướng dẫn demo từng bước](docs/demo-guide.md) giải thích cách theo dõi bàn giao, duyệt tài liệu, tải/chạy FE và xử lý lỗi.

FE sinh ra dùng Next.js và mock theo OpenAPI, được backend build trước khi cho tải ZIP. Chưa có backend ứng dụng, Tester Agent, GitHub PR hay auto-fix. Shipyard chỉ dùng tham khảo.

## Trạng thái kiểm chứng

Code demo đã triển khai; [báo cáo](docs/verification-demo.md) phân biệt test fixture, build/container thật và lượt Codex thật còn chờ bạn tự chạy. Không coi test giả lập là nghiệm thu 5 agent thật. [Backlog](docs/backlog.md) ghi các tiêu chí còn mở.

## Phát triển local

Node.js 24 (>=24.15), npm 11, Codex CLI nếu chạy agent ngoài container:

```sh
npm ci
npm ci --prefix templates/frontend
cp .env.example .env
npm run dev
```

UI http://127.0.0.1:5173; API http://127.0.0.1:4100. `VITE_API_ORIGIN` là cấu hình build-time; `WEB_ORIGIN` là origin CORS. Docker phục vụ UI/API cùng origin. Có thể đặt `CODEX_MODEL` và `AGENT_TIMEOUT_MS` qua `.env`.

```sh
npm run check
npm run test:browser
```

Browser tests cần Google Chrome theo `playwright.config.ts`. Test pipeline dùng adapter fixture, test runner dùng tiến trình fixture; không gọi model hay tự duyệt demo thật.

## Cấu trúc

- `apps/api/src/runner`: Codex exec, context, output validator.
- `apps/api/src/demo`: pipeline, approval, artifacts, OpenAPI/mock validator, FE builder.
- `apps/api/src/storage`: JSON repository, journal và recovery; một backend writer.
- `apps/web`: UI flow/handoff.
- `packages/contracts`: shared schemas/types.
- `templates/frontend`: khung Next.js cố định, có lockfile.
- `docs/backlog`: ticket, tiêu chí và bằng chứng kiểm chứng.

[Xem yêu cầu demo](docs/requirements.md), [contracts](docs/contracts.md), [storage](docs/storage.md). T04–T24 của phạm vi đầy đủ đang hoãn.
