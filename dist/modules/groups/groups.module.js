"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GroupsModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const group_entity_1 = require("../../entities/group.entity");
const group_member_entity_1 = require("../../entities/group-member.entity");
const user_entity_1 = require("../../entities/user.entity");
const groups_service_1 = require("./groups.service");
const groups_controller_1 = require("./groups.controller");
let GroupsModule = class GroupsModule {
};
exports.GroupsModule = GroupsModule;
exports.GroupsModule = GroupsModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([group_entity_1.Group, group_member_entity_1.GroupMember, user_entity_1.User])],
        controllers: [groups_controller_1.GroupsController],
        providers: [groups_service_1.GroupsService],
        exports: [groups_service_1.GroupsService],
    })
], GroupsModule);
//# sourceMappingURL=groups.module.js.map