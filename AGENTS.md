# Quy tắc làm việc trong AI Flow

Áp dụng cho toàn bộ project. Đọc `docs/requirements.md`, `docs/backlog.md`, `docs/backlog/README.md` và ticket liên quan trước khi triển khai.

## Bắt buộc cập nhật ticket ngay khi hoàn thành

- Khi bắt đầu ticket, đặt `Trạng thái: IN_PROGRESS` trong `docs/backlog/Txx.md`.
- Check `[x]` từng tiêu chí nghiệm thu ngay khi đã thực hiện và kiểm chứng đạt. Tiêu chí chưa đạt hoặc chưa kiểm chứng phải giữ `[ ]`.
- Chỉ khi toàn bộ tiêu chí và tích hợp phụ thuộc đã hoàn tất mới đặt `Trạng thái: DONE`, đồng thời check `[x]` ticket tương ứng trong mục `Checklist tiến độ` của `docs/backlog.md`.
- Thực hiện cập nhật trong cùng lượt làm việc, trước khi chuyển ticket hoặc báo hoàn thành cho người dùng; không để dồn cuối dự án.
- Ghi trong ticket những file đã thay đổi, kiểm chứng đã chạy và kết quả thực tế. Không đánh dấu xong chỉ vì đã viết code hoặc chỉ chạy test giả lập khi ticket yêu cầu kiểm chứng thật.
- Nếu mở lại ticket vì thiếu sót, bỏ check hoàn tất trong backlog tổng và các tiêu chí bị ảnh hưởng; cập nhật trạng thái và lý do.

## Có concern thì hỏi người dùng ngay

- Khi phát hiện điểm chưa rõ, mâu thuẫn, rủi ro, blocker hoặc quyết định cần người dùng xác nhận, phải hỏi người dùng ngay; không tự đoán hoặc âm thầm đổi yêu cầu.
- Câu hỏi phải nêu ticket liên quan, vấn đề cụ thể, ảnh hưởng, và phương án đề xuất nếu có.
- Dừng phần công việc phụ thuộc câu trả lời cho tới khi người dùng trả lời; có thể tiếp tục phần độc lập đã rõ yêu cầu.
- Ghi concern/câu hỏi vào ticket. Nếu ticket không thể tiếp tục, đặt `Trạng thái: BLOCKED` và giữ checkbox hoàn tất chưa check.
- Sau khi được trả lời, ghi quyết định vào ticket, cập nhật tài liệu liên quan rồi tiếp tục. Không coi im lặng là đồng ý và không hỏi lại quyết định đã được chốt nếu không có thông tin mới.
