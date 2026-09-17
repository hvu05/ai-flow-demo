import { ArgumentsHost, Catch, HttpException, type ExceptionFilter } from '@nestjs/common';
import { ZodError } from 'zod';
import type { Response } from 'express';
import { StorageError } from '../storage/storage-error.js';
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) return response.status(error.getStatus()).json({ message: error.message });
    if (error instanceof ZodError) return response.status(400).json({ message: 'Dữ liệu không hợp lệ.', issues: error.issues.map(({ path, message }) => ({ path, message })) });
    if (error instanceof StorageError) return response.status(error.code === 'REVISION_CONFLICT' ? 409 : error.code === 'INVALID_PATH' || error.code === 'INVALID_DATA' ? 400 : 503).json({ message: `Lưu trữ chưa sẵn sàng: ${error.code}. Không sửa/xóa file dữ liệu khi app đang chạy.` });
    response.status(500).json({ message: 'Không thực hiện được thao tác. Kiểm tra log backend.' });
  }
}
