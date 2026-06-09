"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseUtil = void 0;
class ResponseUtil {
    static success(res, data, status = 200) {
        res.status(status).json({ success: true, data });
    }
    static created(res, data) {
        res.status(201).json({ success: true, data });
    }
    static paginated(res, data, pagination) {
        res.status(200).json({
            success: true,
            data,
            pagination,
        });
    }
    static cursor(res, data, cursor) {
        res.status(200).json({
            success: true,
            data,
            ...cursor,
        });
    }
    static error(res, message, status = 400, code, details) {
        const body = { success: false, message };
        if (code)
            body.code = code;
        if (details)
            body.details = details;
        res.status(status).json(body);
    }
    static unauthorized(res, message = '未登录') {
        this.error(res, message, 401);
    }
    static forbidden(res, message = '权限不足') {
        this.error(res, message, 403);
    }
    static notFound(res, message = '资源不存在') {
        this.error(res, message, 404);
    }
    static serverError(res, message = '服务器内部错误') {
        this.error(res, message, 500);
    }
}
exports.ResponseUtil = ResponseUtil;
//# sourceMappingURL=response.util.js.map