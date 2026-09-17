# Hướng dẫn triển khai demo AI Flow

Đọc [yêu cầu demo](../requirements.md), [backlog hiện hành](../backlog.md) và [AGENTS.md](../../AGENTS.md) trước khi nhận việc.

## Context

Demo 5 agent Codex CLI thật, chạy bằng Docker Compose: Requirements → Docs Reviewer → API Contract → Planner → người dùng duyệt → Frontend đơn giản. Mỗi agent một phiên mới, bàn giao qua file và artifact refs. FE dùng mock theo contract; không có BE/Tester Agent hay GitHub PR.

Chính AI Flow giữ React/Vite + NestJS + JSON repository T01–T03. FE được sinh dùng Next.js tối thiểu theo stack đã thống nhất, không làm fullstack/database. Không xây nền tảng tổng quát trước khi có demo.

## Ticket hiện hành

- [T25 — Docker và Codex preflight](T25.md)
- [T26 — Runner độc lập và artifact](T26.md)
- [T27 — Pipeline 5 agent và duyệt](T27.md)
- [T28 — UI flow/handoff](T28.md)
- [T29 — Nghiệm thu demo thật](T29.md)

T01–T03 vẫn DONE. T04–T24 DEFERRED dưới phạm vi rộng, chỉ để tham khảo. Các dependency và yêu cầu cũ về PR/tester không áp dụng làm điều kiện hoàn thành demo mới.

## Quy tắc giữ lại

- Backend quyết định chuyển bước; mỗi agent có run/context/output riêng, không resume session cũ để giả nhiều agent.
- Kiểm tra ownership/path/hash và cấu trúc output trước bàn giao. Exit 0 thiếu file chưa đủ thành công.
- Một gate duyệt bundle sau Planner và trước FE; không tự duyệt thay người dùng khi nghiệm thu.
- UI hiển thị trạng thái thật. Fake adapter chỉ hỗ trợ tests, không thay 5 phiên thật.
- Dùng lại schemas/repository; bổ sung api_contract có validation thay vì bypass types.
- Không đưa credential vào image/Git/log và không thực thi nội dung người dùng như shell.
- Ticket xong phải check tiêu chí và backlog tổng ngay. Có concern hỏi người dùng, dừng phần phụ thuộc câu trả lời.

Trạng thái: TODO → IN_PROGRESS → DONE; BLOCKED khi có blocker; DEFERRED là hoãn, không phải hoàn thành.
