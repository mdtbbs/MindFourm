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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const index_1 = require("../../entities/index");
let SettingsService = class SettingsService {
    constructor(settingRepository) {
        this.settingRepository = settingRepository;
        this.settingsCache = new Map();
    }
    async onModuleInit() {
        await this.loadSettings();
    }
    async seedDefaults() {
        const defaults = [
            { key: 'site_name', value: 'MindFourm', category: 'general', description: 'Site name' },
            { key: 'site_description', value: 'Mindustry community forum', category: 'general', description: 'Site description' },
            { key: 'site_url', value: 'http://localhost:3000', category: 'general', description: 'Site URL' },
            { key: 'admin_email', value: 'admin@example.com', category: 'general', description: 'Admin email' },
            { key: 'maintenance_mode', value: 'false', category: 'general', description: 'Maintenance mode toggle' },
            { key: 'posts_per_page', value: '20', category: 'posts', description: 'Posts per page' },
            { key: 'max_post_length', value: '10000', category: 'posts', description: 'Maximum post length' },
            { key: 'allow_attachments', value: 'true', category: 'posts', description: 'Allow file attachments' },
            { key: 'require_approval', value: 'false', category: 'moderation', description: 'Require post approval' },
            { key: 'auto_approve_trusted', value: 'true', category: 'moderation', description: 'Auto-approve trusted users' },
            { key: 'cleanup_log_retention_days', value: '90', category: 'cleanup', description: 'Days to retain operation logs' },
            { key: 'cleanup_session_retention_days', value: '30', category: 'cleanup', description: 'Days to retain expired sessions' },
            { key: 'cleanup_soft_delete_retention_days', value: '30', category: 'cleanup', description: 'Days to retain soft-deleted items' },
            { key: 'smtp_host', value: '', category: 'email', description: 'SMTP server host' },
            { key: 'smtp_port', value: '587', category: 'email', description: 'SMTP server port' },
            { key: 'smtp_user', value: '', category: 'email', description: 'SMTP username' },
            { key: 'smtp_password', value: '', category: 'email', description: 'SMTP password' },
            { key: 'smtp_from', value: 'noreply@mindforum.com', category: 'email', description: 'Email sender address' },
            { key: 'smtp_secure', value: 'true', category: 'email', description: 'Use TLS/SSL' },
        ];
        for (const setting of defaults) {
            await this.settingRepository.query('INSERT IGNORE INTO settings (key, value, category, description) VALUES (?, ?, ?, ?)', [setting.key, setting.value, setting.category, setting.description]);
        }
        await this.loadSettings();
    }
    async getAll() {
        const result = {};
        for (const [, setting] of this.settingsCache) {
            result[setting.key] = setting.value;
        }
        return result;
    }
    async getByCategory(category) {
        const result = {};
        for (const [, setting] of this.settingsCache) {
            if (setting.category === category) {
                result[setting.key] = setting.value;
            }
        }
        return result;
    }
    async get(key) {
        const setting = this.settingsCache.get(key);
        return setting ? setting.value : null;
    }
    async getNumber(key) {
        const value = await this.get(key);
        return value ? parseFloat(value) : null;
    }
    async setBatch(category, keyValuePairs) {
        for (const [key, value] of Object.entries(keyValuePairs)) {
            await this.settingRepository.query('INSERT INTO settings (key, value, category, updated_at) VALUES (?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE value = ?, updated_at = NOW()', [key, value, category, value]);
        }
        await this.loadSettings();
    }
    async loadSettings() {
        const settings = await this.settingRepository.find();
        this.settingsCache.clear();
        for (const setting of settings) {
            this.settingsCache.set(setting.key, setting);
        }
    }
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(index_1.Setting)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], SettingsService);
//# sourceMappingURL=settings.service.js.map