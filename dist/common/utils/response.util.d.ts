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
export declare class ResponseUtil {
    static success(res: Response, data: unknown, status?: number): void;
    static created(res: Response, data: unknown): void;
    static paginated(res: Response, data: unknown[], pagination: PaginationMeta): void;
    static cursor(res: Response, data: unknown[], cursor: CursorMeta): void;
    static error(res: Response, message: string, status?: number, code?: string | null, details?: unknown): void;
    static unauthorized(res: Response, message?: string): void;
    static forbidden(res: Response, message?: string): void;
    static notFound(res: Response, message?: string): void;
    static serverError(res: Response, message?: string): void;
}
