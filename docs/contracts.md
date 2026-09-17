# Contracts v1

`@ai-flow/contracts` cung cấp Zod runtime schemas và TypeScript types. API, persistence và context builder phải dùng cùng package. Dữ liệu unknown phải parse trước khi dùng.

## Entity

Project, Workflow, Task, AgentRun, Artifact, Approval, Finding, WorkflowEvent có schemaVersion=1, id, revision không âm và createdAt/updatedAt UTC (Z). Các entity con có projectId. ID là 1–80 ký tự chữ/số, underscore hoặc hyphen; không dùng ID như đường dẫn tự do.

- Task: role, dependencies, criteria, allowed paths, input artifact refs và bundle.
- Run: task/role/attempt/workspace, optional sessionId/previousRunId, execution status, exitCode và validation riêng.
- Artifact: producerRunId, kind, version, project-relative path, SHA-256 và media type. File nội dung được lưu riêng metadata JSON.
- Approval: decision, exact bundle ID/version/SHA-256 và thời điểm quyết định.
- Finding: owner, severity, location, evidence refs, criteria và optional testedCommit.
- Event v1: task_status, run_status, artifact_created cùng sequence. T10 mở rộng bằng schema version phù hợp.

## Trạng thái và handoff

Run `succeeded` chỉ có nghĩa tiến trình thành công; task `completed` phải qua validation T08. Handoff outcome có completed/needs_input/blocked/failed/cancelled/interrupted, khác execution status.

Handoff là discriminated union theo role. Requirements/Planner trả document refs; Reviewer trả verdict và bundle; code roles trả commit/branch/paths/contract; Tester trả tested SHA, verdict và kết quả từng acceptance ID. Completed bắt buộc result đúng vai trò; needs_input cần câu hỏi. Report PASS không được chứa criterion FAIL/BLOCKED.

Fixtures JSON nằm tại packages/contracts/fixtures. Chúng là dữ liệu minh họa, không phải bằng chứng đã chạy agent thật. Artifact hash/commit trong fixture là placeholder hợp lệ về định dạng.

## Version và validation

Tất cả object strict: field lạ bị từ chối. Schema version chưa hỗ trợ bị báo lỗi, không xóa dữ liệu, không tự downgrade. Khi thay đổi không tương thích: thêm schema version mới, migration rõ ràng với backup trước khi bật writer mới. Không sửa ngầm JSON cũ.

ZodError.issues giữ path/code/message; caller chuyển thành lỗi nghiệp vụ mà không log toàn bộ payload. Schema chỉ kiểm tra cấu trúc: existence/ownership/hash/commit thật, DAG cycles, references giữa entity và transition guards thuộc repository/T07/T08. T03 kiểm tra project ownership và revision; không thay workflow engine.

Nguồn tham khảo: [Zod API](https://zod.dev/api), [NestJS providers](https://docs.nestjs.com/fundamentals/custom-providers).
