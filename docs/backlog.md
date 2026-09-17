# Backlog — demo 5 agent thật trong Docker

Mục tiêu hiện tại: [Requirements → Reviewer → API Contract → Planner → duyệt → FE đơn giản](requirements.md). Tái sử dụng T01–T03, làm tiếp T25–T29. Docker là yêu cầu của demo.

## Checklist hiện hành

- [x] [T01 — Monorepo UI/backend](backlog/T01.md)
- [x] [T02 — Shared contracts](backlog/T02.md)
- [x] [T03 — JSON repository](backlog/T03.md)
- [x] [T25 — Docker Compose và Codex preflight cho demo](backlog/T25.md)
- [ ] [T26 — Runner một phiên Codex và artifact bàn giao](backlog/T26.md)
- [ ] [T27 — Pipeline cố định 5 agent và gate duyệt](backlog/T27.md)
- [ ] [T28 — UI demo 5 agent và xem đầu ra bàn giao](backlog/T28.md)
- [ ] [T29 — Nghiệm thu Docker demo 5 agent thật](backlog/T29.md)

Chỉ check `[x]` khi đủ tiêu chí và kiểm chứng thật theo [AGENTS.md](../AGENTS.md). T25 DONE. T26–T29 đã triển khai và đang IN_PROGRESS, còn nghiệm thu Codex thật do người dùng tự chạy; xem báo cáo kiểm chứng và từng ticket. Giữ T01–T03 DONE; không viết lại nền tảng.

## Thứ tự triển khai

1. T25: chạy UI/API và Codex preflight trong Docker, giữ dữ liệu qua volume.
2. T26: chạy một phiên thật và lưu/kiểm tra đầu ra.
3. T27: nối 5 agent bằng file và gate duyệt; FE mock nhỏ build được.
4. T28: UI thấy flow/handoff và đọc/tải kết quả.
5. T29: demo thật trong Docker với người dùng duyệt tài liệu; lưu bằng chứng.

## Backlog sản phẩm đầy đủ — DEFERRED

T04–T24 được hoãn dưới phạm vi cũ; chưa hoàn tất. Một số phần tối thiểu được rút vào T25–T29, không đồng nghĩa các ticket cũ đã DONE. Bảng này chỉ tham khảo, không phải dependency graph hiện hành. Xem [phạm vi đầy đủ](requirements-full.md).

| ID | Ticket | Điều kiện hoàn thành | Phụ thuộc |
|---|---|---|---|
| [T01](backlog/T01.md) | Khởi tạo monorepo UI + backend | React/Vite, NestJS, types dùng chung, dev/build/lint, health endpoint | — |
| [T02](backlog/T02.md) | Schema và hợp đồng bàn giao | Schema versioned cho Project, Workflow, Task, AgentRun, Artifact, Approval, Finding; validation đầu ra | [T01](backlog/T01.md) |
| [T03](backlog/T03.md) | Lưu JSON theo project | CRUD, ghi nguyên tử, khóa cập nhật, phát hiện file hỏng, restart không mất dữ liệu | [T02](backlog/T02.md) |
| [T04](backlog/T04.md) | Docker Compose | Build/chạy UI và backend; volume cho dữ liệu/workspace/log; env và hướng dẫn chạy | T01,T03 |
| [T05](backlog/T05.md) | Preflight Codex/GitHub | Kiểm tra CLI, xác thực, Git/GitHub và quyền workspace trong container; lỗi rõ ràng; bảo vệ credential | [T04](backlog/T04.md) |
| [T06](backlog/T06.md) | Codex CLI runner | Phiên riêng theo task, cwd/context/output, log/exit code/thời gian, timeout và hủy tiến trình | T02,T05 |
| [T07](backlog/T07.md) | Workflow engine | Phụ thuộc task, chờ trả lời/duyệt, FE/BE song song, chỉ chuyển bước khi đầu ra hợp lệ | T03,T06 |
| [T08](backlog/T08.md) | Context và handoff validator | Cấp đúng phiên bản tài liệu/task/commit; liên kết artifact; từ chối đầu ra không hợp lệ | T02,T06 |
| [T09](backlog/T09.md) | Retry, dừng, phục hồi | Run mới cho retry, lịch sử và giới hạn vòng sửa, chống chạy trùng, nhận diện run gián đoạn | T07,T08 |
| [T10](backlog/T10.md) | API và SSE | API project/task/run/approval; stream trạng thái/log; reload/reconnect giữ lịch sử | T03,T07 |
| [T11](backlog/T11.md) | UI quản lý project | Tạo/danh sách/mở project; repo tùy chọn; kiểm tra đường dẫn và ngăn ghi đè | [T10](backlog/T10.md) |
| [T12](backlog/T12.md) | Requirements Agent và hỏi đáp | Câu hỏi có cấu trúc, UI trả lời, tiếp tục bằng run mới; PRD/phạm vi/tiêu chí có ID | T08,T10,T11 |
| [T13](backlog/T13.md) | Technical Planner | Thiết kế, data model, contract, task FE/BE có phụ thuộc và liên kết tiêu chí nghiệm thu | [T12](backlog/T12.md) |
| [T14](backlog/T14.md) | Docs Reviewer và sửa docs | Review độc lập, findings/verdict, trả đúng agent, giới hạn vòng và blocked | T09,T13 |
| [T15](backlog/T15.md) | UI duyệt docs và version | Xem docs/findings, nhận xét/duyệt; approval đúng version; thay đổi phạm vi/contract phải duyệt lại | T10,T14 |
| [T16](backlog/T16.md) | Scaffold và Git workspace | Template Next.js/NestJS/PostgreSQL, build/test/Compose, baseline và worktree FE/BE | [T15](backlog/T15.md) |
| [T17](backlog/T17.md) | Frontend Agent | Nhận task/contract đã duyệt, code/test trong worktree FE, bàn giao commit và ghi chú | T08,T16 |
| [T18](backlog/T18.md) | Backend Agent | API/schema/migration/test trong worktree BE, đúng contract, bàn giao commit và kết quả | T08,T16 |
| [T19](backlog/T19.md) | Tích hợp FE/BE | Tích hợp branch, build/contract checks; task xử lý conflict, không bỏ thay đổi âm thầm | T17,T18 |
| [T20](backlog/T20.md) | Tester và môi trường test | Container readiness/log/cleanup; API/browser tests; PASS/FAIL/BLOCKED theo tiêu chí và bằng chứng | [T19](backlog/T19.md) |
| [T21](backlog/T21.md) | Vòng sửa lỗi | Phân findings FE/BE/thiết kế, run sửa mới, tích hợp/retest, giới hạn vòng, chặn hoàn tất khi còn lỗi | T09,T20 |
| [T22](backlog/T22.md) | Tạo PR GitHub | Kiểm tra repo/base và repo trống; push branch, PR đủ docs/test/hướng dẫn; idempotent; không merge | [T21](backlog/T21.md) |
| [T23](backlog/T23.md) | Dashboard flow | Task song song, log/artifact/thời gian/blocked/retry/PR; dừng và tiếp tục theo trạng thái | T10,T15,T21,T22 |
| [T24](backlog/T24.md) | E2E hệ thống và tài liệu vận hành | Project mẫu đến PR; kiểm tra từ chối docs, agent lỗi, test fail, restart, retry PR; setup/backup/troubleshooting | T01–T23 |
