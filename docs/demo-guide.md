# Tự chạy demo AI Flow

Ứng dụng điều phối đã có Docker Compose. Bạn tự đăng nhập Codex, chạy 5 agent thật và duyệt tài liệu. Các kiểm tra tự động hiện dùng fixture; chưa có lượt model thật được nghiệm thu. Xem [báo cáo kiểm chứng](verification-demo.md).

## 1. Khởi động

Bật Docker Desktop, rồi chạy:

```sh
cd ~/Documents/ai-flow
docker compose up --build -d
docker compose ps
```

Mở **http://localhost:8090**. UI vẫn mở được khi chưa đăng nhập Codex; nút bắt đầu sẽ bị khóa. Không cần Node.js trên máy để chạy ứng dụng điều phối. Lần build đầu cần mạng và có thể mất vài phút.

## 2. Đăng nhập Codex trong container

```sh
docker compose exec app codex login --device-auth
```

Mở địa chỉ và nhập mã CLI hiển thị, đăng nhập bằng tài khoản của bạn. Nếu tài khoản chưa bật device-code login, làm theo hướng dẫn của CLI và [tài liệu xác thực Codex](https://developers.openai.com/codex/auth). Không gửi mã hoặc credential cho AI.

```sh
docker compose exec app codex login status
docker compose exec app codex --version
```

CLI đã đóng gói: **0.154.0**. Trên UI bấm **Kiểm tra lại**, chờ **Sẵn sàng nhận việc**. Đăng nhập Codex trên máy host không tự đăng nhập container. Auth được giữ trong volume riêng, không nằm trong image/source.

## 3. Quan sát bốn lần bàn giao đầu

Nhập ý tưởng nhỏ, ví dụ:

> Tạo app ghi chú cá nhân một trang: xem danh sách ghi chú, thêm ghi chú, sửa nội dung và xóa ghi chú. Dữ liệu mock trong bộ nhớ, không cần đăng nhập, database hay backend thật. Có nhãn Dữ liệu mock trên giao diện.

Bấm **Bắt đầu lượt mới**. Quan sát:

1. **Yêu cầu** sinh `requirements.md`.
2. **Review** nhận file đó, sinh `review.md` với PASS hoặc CHANGES_REQUESTED.
3. **API contract** nhận tài liệu trước, sinh `openapi.json` và `api-notes.md`.
4. **Kế hoạch** đọc contract, sinh `plan.md`.

Bấm node để xem đầu ra hoặc Nhật ký. Bấm mũi tên giữa hai node để xem file đã nhận, version/hash và producer. `prompt.txt` cho biết nhiệm vụ và context riêng của phiên. Mỗi node dùng một tiến trình `codex exec` mới, không resume phiên trước. Backend ghi file từ output JSON đã kiểm tra rồi cấp nội dung/ref cho agent tiếp theo; các agent không dùng chung conversation.

Trong lúc chạy, có thể reload trang. Link `?run=...` mở lại đúng lượt. Một thời điểm chỉ chạy hoặc chờ duyệt một lượt.

## 4. Bạn duyệt trước khi FE chạy

Khi thấy **Chờ bạn duyệt**, đọc requirements, review, contract và plan. Frontend vẫn phải ở trạng thái chờ, chưa có run. Nếu đồng ý, bấm **Duyệt và tạo FE**. Approval gắn với hash bộ tài liệu này.

Nếu chưa đồng ý, bấm **Dừng lượt chạy**, sửa ý tưởng rồi tạo lượt mới. Demo chưa có vòng sửa tài liệu hoặc retry tự động. Review yêu cầu sửa, timeout hoặc đầu ra sai cũng dừng để bạn xem nguyên nhân.

## 5. Lấy và chạy FE

Agent thứ năm tạo `app/page.tsx`, `app/globals.css`, `mocks.json`, `README.md`. Backend kiểm tra mock theo OpenAPI và chạy `next build --webpack` trong khung Next.js cố định. Chỉ khi build thành công mới hiện **Tải source FE**.

Tải ZIP, giải nén vào thư mục riêng. Đọc README và `BUILD-REPORT.txt`. Nếu có Node.js 24:

```sh
npm ci
npm run dev
```

Hoặc mở terminal tại thư mục FE vừa giải nén và chạy bằng Docker:

```sh
docker run --rm -it -p 127.0.0.1:3000:3000 \
  -v "$PWD:/app" -v /app/node_modules -w /app \
  node:24.18.0-bookworm-slim sh -c 'npm ci && npm run dev'
```

Mở **http://localhost:3000** và thử các hành vi đã duyệt. FE dùng mock và state trong bộ nhớ; không có API/backend thật. UI điều phối không nhúng hoặc tự chạy website này.

## 6. Kiểm tra lưu dữ liệu

Sau khi hoàn tất hoặc đang chờ duyệt:

```sh
docker compose up -d --force-recreate
```

Mở lại link lượt chạy; tài liệu/source phải còn. Nếu recreate trong lúc agent đang chạy, lượt sẽ bị gián đoạn, không tự tiếp tục. Hãy tạo lượt mới.

| Volume | Trong container | Nội dung |
|---|---|---|
| `ai-flow_ai-flow-data` | `/app/data` | JSON theo project, artifact, log |
| `ai-flow_ai-flow-workspaces` | `/app/workspaces` | Context/schema/output từng run, source FE/build |
| `ai-flow_ai-flow-auth` | `/home/node/.codex` | Xác thực Codex |

Dừng app bằng `docker compose down`; volume vẫn giữ. **Không dùng `down -v` nếu muốn giữ dữ liệu và đăng nhập.** Chỉ chạy một backend trên các volume này.

## Khi gặp lỗi

- Docker không kết nối: bật Desktop, xem `docker context ls`; trên máy này đã kiểm tra bằng context `desktop-linux`.
- Chưa đăng nhập: chạy bước 2, rồi Kiểm tra lại.
- Cổng 8090 đã dùng: tạo `.env` với `AI_FLOW_PORT=8091`, chạy lại Compose và mở cổng mới.
- CLI/model lỗi: kiểm tra `docker compose exec app codex login status` và kết nối mạng. Có thể đặt `CODEX_MODEL` trong `.env` nếu tài khoản yêu cầu model cụ thể. Không tự đặt model ngoài quyền tài khoản.
- Timeout: mặc định mỗi agent 600000 ms; đổi `AGENT_TIMEOUT_MS` trong `.env` (tối đa 3600000), recreate rồi tạo lượt mới.
- Review cần sửa/output sai/build FE thất bại: đọc node và source đã lưu, điều chỉnh ý tưởng và chạy lượt mới. Không có auto-fix trong demo.
- Backend lỗi: `docker compose logs --tail=100 app`. Log UI chỉ gồm sự kiện đã lọc, không đưa nguyên stderr chứa thông tin nhạy cảm lên trang.

## Bằng chứng để hoàn tất T26–T29

Sau một lượt thành công, ghi lại project ID/link lượt, 5 run IDs và session IDs trong Nhật ký, ảnh flow trước/sau duyệt, file bàn giao, hash bundle, BUILD-REPORT và kết quả thử FE. Xác nhận reload/recreate vẫn đọc và tải được source. Không đưa credential vào report. Các mục live trong backlog chỉ được check sau khi có bằng chứng này.
