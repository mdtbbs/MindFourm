"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeCursor = encodeCursor;
exports.decodeCursor = decodeCursor;
function encodeCursor(...values) {
    const raw = values.map((v) => (v instanceof Date ? v.getTime() : String(v))).join(':');
    return Buffer.from(raw).toString('base64url');
}
function decodeCursor(cursor) {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    return raw.split(':');
}
//# sourceMappingURL=cursor.util.js.map