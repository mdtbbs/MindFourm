"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LevelsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const level_entity_1 = require("../../entities/level.entity");
const user_entity_1 = require("../../entities/user.entity");
const levels_service_1 = require("./levels.service");
const levels_controller_1 = require("./levels.controller");
let LevelsModule = class LevelsModule {
};
exports.LevelsModule = LevelsModule;
exports.LevelsModule = LevelsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([level_entity_1.Level, user_entity_1.User])],
        controllers: [levels_controller_1.LevelsController],
        providers: [levels_service_1.LevelsService],
        exports: [levels_service_1.LevelsService],
    })
], LevelsModule);
//# sourceMappingURL=levels.module.js.map