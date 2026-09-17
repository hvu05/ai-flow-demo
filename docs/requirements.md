# Yêu cầu demo AI Flow — 5 agent thật, chạy bằng Docker

## Mục tiêu đã chốt

Thu nhỏ phạm vi để sớm nhìn thấy demo: nhiều agent Codex CLI thật nhận việc và bàn giao bằng file. Người dùng chọn 3 agent ban đầu, sau đó bổ sung agent tạo API contract, agent FE đơn giản và yêu cầu đóng gói ứng dụng điều phối bằng Docker để dễ chạy.

## Luồng cố định

```text
Nhập ý tưởng
  → Requirements Agent
  → Docs Reviewer Agent
  → API Contract Agent
  → Planner Agent
  → Người dùng duyệt bộ tài liệu
  → Frontend Agent
  → Xem FE đơn giản và lịch sử bàn giao
```

Mỗi agent là một phiên Codex CLI mới, role/prompt/context/run ID riêng. Backend chuyển bước theo quy tắc, không dùng một AI đóng nhiều vai trong cùng conversation.

| Agent | Đầu vào | Đầu ra |
|---|---|---|
| Requirements | Ý tưởng người dùng | requirements.md: phạm vi nhỏ và tiêu chí nghiệm thu |
| Docs Reviewer | File requirements và manifest producer | review.md cùng PASS/CHANGES_REQUESTED và findings |
| API Contract | Requirements và review PASS | OpenAPI JSON + API notes; schema request/response/error và dữ liệu ví dụ |
| Planner | Requirements, review và contract | plan.md: các task FE nhỏ, mapping tiêu chí và endpoints |
| Frontend | Bundle đã được người dùng duyệt | FE Next.js đơn giản dùng mock theo contract, README chạy và kết quả build |

Giữ bước duyệt tài liệu trước code đã chốt: đặt gate sau Planner để người dùng duyệt cả requirements, contract và plan bằng một nút. Chưa cần màn hình approval/versioning nhiều cấp.

## FE được tạo

FE đầu ra là project nhỏ, ưu tiên một trang hoặc một luồng chính. Dùng Next.js theo stack đã thống nhất trước đây; không triển khai NestJS/PostgreSQL của ứng dụng đầu ra trong demo.

- API contract là hợp đồng thiết kế, chưa có backend thực thi.
- FE dùng fixture/mock khớp contract; ghi rõ dùng mock trên UI/README, không tuyên bố API thật đã hoạt động.
- Agent FE nhận trực tiếp contract và plan; không tự sửa contract. Nếu không làm được theo contract, trả blocked và giải thích.
- Dùng khung Next.js tối thiểu có thể build/export static để demo, không dựng hệ thống scaffold đa stack.
- Bàn giao code, hướng dẫn chạy, kết quả build. AI Flow cho xem file và tải source; không bắt buộc nhúng preview hoặc triển khai website trong mốc này.

## UI demo duy nhất

Ô nhập ý tưởng, nút bắt đầu/dừng, flow 5 node + gate duyệt. Node thể hiện trạng thái, thời gian, run ID; click để xem nhiệm vụ, input/output và log gần nhất. Đường bàn giao ghi nguồn/đích và artifact refs/version/hash.

Cho xem Markdown/contract/plan trước khi duyệt, rồi theo dõi FE agent và mở/tải kết quả. Polling snapshot/log là đủ; chưa làm SSE replay hay workflow editor. Reload vẫn đọc được trạng thái đã lưu.

## Chạy bằng Docker

AI Flow gồm React/Vite UI, NestJS backend và JSON repository T01–T03. Docker Compose là cách chạy chính; không cần cài Node.js trên host để dùng demo. Người dùng cần Docker và xác thực Codex theo hướng dẫn.

- Image chứa runtime/toolchain và Codex CLI đã kiểm chứng; ghi rõ version.
- Dữ liệu, workspace/code FE và log lưu bằng volume/bind mount, không mất khi recreate container.
- Credential Codex cung cấp qua cấu hình/mount runtime phù hợp cơ chế CLI; không copy vào image/Git, không đưa vào log/UI. Kiểm chứng CLI bên trong container, không chỉ trên host.
- Agent làm trong workspace tách riêng; backend chỉ cho phép bàn giao/output theo đường dẫn hợp lệ.
- Chưa cần Docker-in-Docker hoặc Docker socket để tạo thêm container test. Build FE có thể chạy trong workspace bằng toolchain của runner; không deploy.

## Hành vi khi gặp lỗi

Review CHANGES_REQUESTED, needs_input, CLI lỗi, timeout hoặc output sai: dừng đúng node và hiển thị nguyên nhân; không tự chạy bước tiếp. Người dùng có thể sửa ý tưởng và tạo lượt mới. Chưa làm hội thoại nhiều vòng/auto-fix/retry.

Một lượt active; start/approve trùng không sinh agent trùng. Timeout/cancel dừng tiến trình con. Restart backend giữ lịch sử, nhận diện run gián đoạn, không tự resume agent; người dùng có thể bắt đầu lượt mới. Lượt đang chờ duyệt cần đọc lại được.

## Điều kiện đạt demo

- Một kịch bản thật đi qua đủ 5 phiên độc lập trong Docker, có người dùng duyệt trước FE.
- Các file yêu cầu/review/contract/plan/FE và producer-consumer references xem được trên UI.
- FE sử dụng mock khớp contract, build được; source và hướng dẫn chạy truy cập được.
- Output thiếu, approval sai phiên bản hoặc CLI failure đều không vượt gate.
- Compose recreate giữ project/run/artifact/code; không cần GitHub, DB hoặc backend ứng dụng đầu ra.
- Fake adapter chỉ dùng test và ghi nhãn; nghiệm thu không được thay 5 agent thật bằng mô phỏng.

## Ngoài phạm vi

Backend Developer/Tester Agent, PostgreSQL, GitHub/PR, worktree/merge, song song FE/BE, generic DAG, vòng sửa tự động, live-site deploy, embedded preview server, nhiều người dùng/model, editor kéo thả.

## Backlog hiện hành

Giữ T01–T03 DONE. Làm T25–T29 trong [backlog](backlog.md). T04–T24 là phạm vi rộng được hoãn, không phải dependency bắt buộc của demo. [Phạm vi đầy đủ](requirements-full.md) được lưu để tham khảo.
