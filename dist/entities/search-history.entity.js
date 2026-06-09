"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchHistory = void 0;
const typeorm_1 = require("typeorm");
const user_entity_1 = require("./user.entity");
let SearchHistory = class SearchHistory {
};
exports.SearchHistory = SearchHistory;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], SearchHistory.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ nullable: true }),
    __metadata("design:type", Number)
], SearchHistory.prototype, "user_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 255 }),
    __metadata("design:type", String)
], SearchHistory.prototype, "query", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 20, default: 'global' }),
    __metadata("design:type", String)
], SearchHistory.prototype, "search_type", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'int', default: 0 }),
    __metadata("design:type", Number)
], SearchHistory.prototype, "results_count", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], SearchHistory.prototype, "created_at", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => user_entity_1.User, { eager: false, nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: 'user_id' }),
    __metadata("design:type", user_entity_1.User)
], SearchHistory.prototype, "user", void 0);
exports.SearchHistory = SearchHistory = __decorate([
    (0, typeorm_1.Entity)('search_history'),
    (0, typeorm_1.Index)(['user_id', 'created_at']),
    (0, typeorm_1.Index)(['query'])
], SearchHistory);
//# sourceMappingURL=search-history.entity.js.map