# JSON storage — T03

## Cách sử dụng

`StorageModule` export injection token `PROJECT_REPOSITORY` với interface `ProjectRepository`. Provider khởi tạo repository và phục hồi journal trước khi NestJS bắt đầu nhận request. Chưa có API CRUD public (T10/T11).

```ts
import { Inject, Injectable } from '@nestjs/common';
import { PROJECT_REPOSITORY, type ProjectRepository } from './storage/project-repository.js';

@Injectable()
export class ExampleService {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly repository: ProjectRepository) {}
  listProjects() { return this.repository.listProjects(); }
}
```

Các phương thức:

- `initialize()`: tạo thư mục và roll-forward journal còn dang dở; lỗi recovery làm startup thất bại rõ ràng.
- `transaction(projectId, mutations)`: tạo/cập nhật/xóa nhiều entity trong cùng project. `put` nhận `value`, `expectedRevision: null` cho tạo mới, hoặc revision hiện tại cho update. `delete` dùng revision hiện tại. Không nhận file path tự do.
- `get(projectId, kind, id)`: trả entity hoặc null; workflow là singleton theo project nhưng vẫn kiểm tra đúng ID.
- `list(projectId, kind)` và `listProjects()`: đọc qua schema, không bỏ qua file hỏng.
- `deleteProject(projectId, expectedRevision)`: logical delete bằng rename toàn bộ thư mục vào `DATA_ROOT/.trash/<id>-<uuid>`, giữ dữ liệu để phục hồi. Không xóa Git workspace hoặc remote. Chưa expose thao tác này trên HTTP/UI.

Entity mới phải revision 0. Khi cập nhật, caller cấp value có revision tăng đúng 1, giữ createdAt và updatedAt không đi lùi. Nếu hai caller cùng đọc revision 0, chỉ một update có thể thành công; caller còn lại nhận REVISION_CONFLICT và phải tải lại.

## Layout

```text
DATA_ROOT/
  projects/<project-id>/
    project.json
    workflow.json
    tasks/<id>.json
    runs/<id>.json
    approvals/<id>.json
    artifacts/<id>.json
    findings/<id>.json
    events/<id>.json
    logs/
    .journal.json          # chỉ tồn tại khi transaction pending
  .trash/                  # project đã logical delete
```

`artifacts/*.json` chỉ là metadata. T08 phải lưu nội dung Markdown/ảnh ở vùng khác (ví dụ `content/`) và tham chiếu bằng Artifact.path; không đặt blobs vào các thư mục collection JSON. Repository T03 chưa quản lý ghi nội dung artifact/log.

DATA_ROOT được resolve tương đối từ repository root; mặc định ./data. Git bỏ qua data/, workspaces/, logs/, .env và build artifacts. Nếu cấu hình DATA_ROOT ra nơi khác thì người vận hành chịu trách nhiệm backup và Git ignore vị trí đó.

## Tính nhất quán và phục hồi

1. Khóa queue theo đường dẫn project; các instance trong cùng tiến trình dùng chung khóa.
2. Validate tất cả mutations, ownership, schema và revision trước khi viết.
3. Ghi journal chứa before/after qua temp file cùng directory, fsync file, rename, fsync directory.
4. Đọc lại journal; kiểm tra mọi target đang bằng before hoặc after rồi roll-forward từng entity.
5. Xóa journal và fsync directory khi mọi operation xong.

Reader cũng lấy khóa và phục hồi journal trước khi đọc. Crash sau journal hoặc giữa entity writes được roll-forward idempotently. Nếu transaction trả lỗi sau khi journal đã durable, kết quả commit có thể đã xảy ra: caller phải đọc lại trạng thái, không retry mù với cùng revision. Các file temp còn lại sau crash không được xem là dữ liệu đã commit.

JSON hỏng, schema chưa hỗ trợ, ownership sai hoặc target khác journal gây lỗi có code, giữ nguyên file/journal để điều tra. Không reset thành JSON rỗng và không ghi đè dữ liệu đã thay đổi ngoài journal.

## Giới hạn hỗ trợ

- MVP chỉ một backend process/writer trên local Linux filesystem. Không có distributed lock, không chạy hai API process dùng chung DATA_ROOT; mutex chỉ bảo vệ trong một process. Đây là giới hạn đã nêu trong T03, không phải cơ chế hỗ trợ multi-replica.
- Dùng repository API cho mọi đọc/ghi runtime; không sửa JSON trực tiếp khi backend đang chạy. NFS/network filesystems và power-loss guarantees khác local filesystem chưa được kiểm chứng.
- Validate ID và mọi thành phần path; từ chối traversal, symlink và hard-linked entity file. Không coi đây là sandbox chống tiến trình có cùng quyền OS cố ý đổi thư mục giữa các system call.
- List nhiều project không phải snapshot transaction toàn hệ thống. Transaction chỉ giới hạn trong một project; references/DAG/approval gate thuộc các ticket sau.

## Backup, restore và xử lý lỗi

1. Dừng backend để không có writer. Sao chép toàn bộ DATA_ROOT, bao gồm dotfiles/journal, và Git workspaces tương ứng; không chỉ sao chép project.json.
2. Restore vào thư mục local được quyền ghi; giữ file ownership. Cấu hình DATA_ROOT trỏ đúng nơi rồi khởi động một backend.
3. Startup phục hồi journal. Nếu CORRUPT_DATA/RECOVERY_BLOCKED: giữ nguyên bản gốc, làm một bản sao trước khi điều tra. Không xóa journal để ép hệ thống chạy.
4. Khôi phục bản backup nhất quán hoặc đối soát before/after với dữ liệu thật trên bản sao; chỉ dùng lại khi schema/revision hợp lệ. Schema migration phải là bước riêng có backup, chưa có migration tự động ở v1.

## Kiểm chứng

`npm test` kiểm tra concurrent task/run writes, stale updates, JSON/schema hỏng, ownership, traversal/symlink, update/delete, atomic read và journal divergence. Hai test khởi chạy writer process thật, SIGKILL ngay sau journal hoặc entity đầu tiên rồi tạo repository mới để kiểm tra recovery. Các fixture không chạy Codex hoặc gọi GitHub.
