"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
exports.initializeDatabase = initializeDatabase;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const config_1 = require("@nestjs/config");
const entities_1 = require("../entities");
const redis_module_1 = require("./redis.module");
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    type: 'mysql',
                    host: config.get('mysql.host'),
                    port: config.get('mysql.port'),
                    username: config.get('mysql.user'),
                    password: config.get('mysql.password'),
                    database: config.get('mysql.database'),
                    entities: entities_1.entities,
                    synchronize: config.get('app.env') === 'development',
                    logging: config.get('app.env') === 'development',
                    timezone: '+08:00',
                }),
            }),
            redis_module_1.RedisModule,
        ],
        exports: [typeorm_1.TypeOrmModule, redis_module_1.RedisModule],
    })
], DatabaseModule);
async function initializeDatabase() {
    console.log('Database initialized with existing schema');
}
//# sourceMappingURL=database.module.js.map