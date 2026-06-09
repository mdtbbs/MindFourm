import { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CursorMeta {
  nextCursor: string | null;
  hasMore: boolean;
}

export class ResponseUtil {
  static success(res: Response, data: unknown, status = 200): void {
    res.status(status).json({ success: true, data });
  }

  static created(res: Response, data: unknown): void {
    res.status(201).json({ success: true, data });
  }

  static paginated(res: Response, data: unknown[], pagination: PaginationMeta): void {
    res.status(200).json({
      success: true,
      data,
      pagination,
    });
  }

  static cursor(res: Response, data: unknown[], cursor: CursorMeta): void {
    res.status(200).json({
      success: true,
      data,
      ...cursor,
    });
  }

  static error(res: Response, message: string, status = 400, code?: string | null, details?: unknown): void {
    const body: Record<string, unknown> = { success: false, message };
    if (code) body.code = code;
    if (details) body.details = details;
    res.status(status).json(body);
  }

  static unauthorized(res: Response, message = '未登录'): void {
    this.error(res, message, 401);
  }

  static forbidden(res: Response, message = '权限不足'): void {
    this.error(res, message, 403);
  }

  static notFound(res: Response, message = '资源不存在'): void {
    this.error(res, message, 404);
  }

  static serverError(res: Response, message = '服务器内部错误'): void {
    this.error(res, message, 500);
  }
}
