"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const all_exceptions_filter_1 = require("./common/filters/all-exceptions.filter");
const response_interceptor_1 = require("./common/interceptors/response.interceptor");
const database_module_1 = require("./database/database.module");
const points_service_1 = require("./modules/points/points.service");
const plugin_manager_service_1 = require("./modules/plugins/plugin-manager.service");
const levels_service_1 = require("./modules/levels/levels.service");
const badges_service_1 = require("./modules/badges/badges.service");
const typeorm_1 = require("typeorm");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['error', 'warn', 'log'],
    });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalInterceptors(new response_interceptor_1.ResponseInterceptor());
    app.useGlobalFilters(new all_exceptions_filter_1.AllExceptionsFilter());
    app.enableCors({
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
    });
    await (0, database_module_1.initializeDatabase)(app.get(typeorm_1.DataSource));
    const pointsService = app.get(points_service_1.PointsService);
    await pointsService.initializeDefaultRules();
    const levelsService = app.get(levels_service_1.LevelsService);
    await levelsService.initializeDefaultLevels();
    const badgesService = app.get(badges_service_1.BadgesService);
    await badgesService.initializeDefaultBadges();
    const pluginManager = app.get(plugin_manager_service_1.PluginManagerService);
    await pluginManager.loadPlugins();
    const port = process.env.PORT || 4000;
    await app.listen(port);
    console.log(`MindFourm NestJS running on http://localhost:${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map