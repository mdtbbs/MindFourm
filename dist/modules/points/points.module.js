"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PointsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const point_log_entity_1 = require("../../entities/point-log.entity");
const point_rule_entity_1 = require("../../entities/point-rule.entity");
const user_entity_1 = require("../../entities/user.entity");
const points_service_1 = require("./points.service");
const points_controller_1 = require("./points.controller");
let PointsModule = class PointsModule {
};
exports.PointsModule = PointsModule;
exports.PointsModule = PointsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([point_log_entity_1.PointLog, point_rule_entity_1.PointRule, user_entity_1.User])],
        controllers: [points_controller_1.PointsController],
        providers: [points_service_1.PointsService],
        exports: [points_service_1.PointsService],
    })
], PointsModule);
//# sourceMappingURL=points.module.js.map