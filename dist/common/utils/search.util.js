"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeLike = escapeLike;
function escapeLike(input) {
    return input.replace(/([%_\\])/g, '\\$1');
}
//# sourceMappingURL=search.util.js.map