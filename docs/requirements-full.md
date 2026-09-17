# Phạm vi sản phẩm đầy đủ — lưu để tham khảo

Phạm vi này được hoãn sau demo. Xem [yêu cầu hiện hành](requirements.md) trước khi triển khai.

## Trải nghiệm

1. Người dùng tạo project với tên, mô tả ý tưởng và thư mục code; repo GitHub có thể bổ sung trước khi tạo PR.
2. Requirements Agent đặt câu hỏi; người dùng trả lời trên UI.
3. Requirements và Technical Planner tạo PRD, tiêu chí nghiệm thu, thiết kế dữ liệu, API contract và task FE/BE.
4. Docs Reviewer chạy phiên độc lập, trả findings và kết luận; tài liệu chưa đạt được chuyển lại để sửa.
5. Người dùng xem bộ tài liệu, yêu cầu sửa hoặc duyệt phiên bản cụ thể.
6. Hệ thống dựng khung project và giao FE/BE triển khai trong worktree riêng.
7. Tích hợp code, chạy tester, giao lỗi lại cho agent phụ trách và kiểm thử lại.
8. Khi kiểm tra đạt, tạo một PR kèm tài liệu, kết quả test và hướng dẫn chạy.

## Màn hình

- Danh sách project và trạng thái.
- Khởi tạo project.
- Hỏi đáp làm rõ yêu cầu.
- Duyệt tài liệu và xem nhận xét review.
- Theo dõi flow, task, run, log, artifact, findings và PR.

## Vai trò

| Vai trò | Đầu ra |
|---|---|
| Requirements | PRD, phạm vi, tiêu chí nghiệm thu có ID |
| Technical Planner | Thiết kế kỹ thuật, API contract, kế hoạch task |
| Docs Reviewer | Findings và quyết định đạt/chưa đạt |
| Frontend Developer | Commit FE, test, ghi chú bàn giao |
| Backend Developer | Commit BE, migration, test, ghi chú bàn giao |
| Tester | Kết quả theo tiêu chí nghiệm thu, bằng chứng, lỗi |

Dựng khung và tích hợp là các task được backend điều phối; cách thực thi cụ thể sẽ được chốt khi thiết kế engine.

## Nguyên tắc

- Backend giữ logic chuyển bước, không giao toàn bộ quy trình cho một AI nhớ context.
- Mỗi task/lần sửa tạo một phiên Codex CLI mới với context cần thiết.
- Artifact, approval, task và run có ID, phiên bản, lịch sử rõ ràng.
- Agent thoát thành công chưa đủ: backend kiểm tra đầu ra trước khi chuyển bước.
- Approval gắn với phiên bản tài liệu. Thay đổi phạm vi hoặc contract đáng kể phải duyệt lại.
- FE/BE nhận cùng phiên bản contract đã duyệt.
- Retry giữ lịch sử và có giới hạn; hết giới hạn chuyển blocked để người dùng quyết định.
- Sau restart, nhận diện run gián đoạn và cho phép tiếp tục mà không tự tạo task/PR trùng.
- JSON được ghi nguyên tử, khóa cập nhật và kiểm tra schema.
- Không nhúng credential vào image hoặc log.

## Lưu trữ dự kiến

```text
data/projects/<project-id>/
  project.json
  workflow.json
  tasks/
  runs/
  approvals/
  artifacts/
  logs/
```

Workspace code và worktree được lưu bền vững riêng.

## Hạ tầng

Ứng dụng điều phối: React/Vite + NestJS + file JSON, chạy bằng Docker Compose.
Project được tạo: Next.js + NestJS + PostgreSQL.
Backend cần chạy Codex CLI, Git và quản lý môi trường kiểm thử container. Cơ chế xác thực CLI, truy cập Docker và ánh xạ đường dẫn workspace cần được kiểm chứng ở mốc đầu tiên.

## Ngoài phạm vi MVP

Nhiều người dùng, nhiều project chạy đồng thời, editor workflow kéo thả, nhiều nhà cung cấp model, tự merge và tự deploy.
