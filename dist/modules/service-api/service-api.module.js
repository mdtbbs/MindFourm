"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceApiModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const user_entity_1 = require("../../entities/user.entity");
const posts_module_1 = require("../posts/posts.module");
const replies_module_1 = require("../replies/replies.module");
const service_api_controller_1 = require("./service-api.controller");
let ServiceApiModule = class ServiceApiModule {
};
exports.ServiceApiModule = ServiceApiModule;
exports.ServiceApiModule = ServiceApiModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([user_entity_1.User]),
            posts_module_1.PostsModule,
            replies_module_1.RepliesModule,
        ],
        controllers: [service_api_controller_1.ServiceApiController],
    })
], ServiceApiModule);
//# sourceMappingURL=service-api.module.js.map