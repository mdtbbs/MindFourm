"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var EmailService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const common_1 = require("@nestjs/common");
const nodemailer = __importStar(require("nodemailer"));
const settings_service_1 = require("../settings/settings.service");
const template_service_1 = require("./template.service");
let EmailService = EmailService_1 = class EmailService {
    constructor(settingsService, templateService) {
        this.settingsService = settingsService;
        this.templateService = templateService;
        this.logger = new common_1.Logger(EmailService_1.name);
        this.transporter = null;
    }
    async onModuleInit() {
        try {
            await this.initTransporter();
        }
        catch (error) {
            this.logger.warn(`Email transporter not initialized: ${error.message}`);
        }
    }
    async initTransporter() {
        try {
            const config = await this.settingsService.getByCategory('email');
            if (!config.smtp_host || !config.smtp_user) {
                this.logger.warn('SMTP not configured. Email sending is disabled.');
                return;
            }
            this.transporter = nodemailer.createTransport({
                host: config.smtp_host,
                port: parseInt(config.smtp_port || '587', 10),
                secure: config.smtp_secure === 'true',
                auth: {
                    user: config.smtp_user,
                    pass: config.smtp_password,
                },
            });
            await this.transporter.verify();
            this.logger.log('Email transporter initialized successfully');
        }
        catch (error) {
            this.logger.error(`Failed to initialize email transporter: ${error.message}`);
            this.transporter = null;
        }
    }
    async sendMail(options) {
        if (!this.transporter) {
            await this.initTransporter();
        }
        if (!this.transporter) {
            this.logger.warn('Email not sent: SMTP not configured');
            return;
        }
        try {
            const from = await this.settingsService.get('smtp_from');
            await this.transporter.sendMail({
                from: from || 'noreply@mindforum.com',
                to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
                subject: options.subject,
                html: options.html,
                text: options.text,
            });
            this.logger.log(`Email sent to ${options.to}`);
        }
        catch (error) {
            this.logger.error(`Failed to send email: ${error.message}`);
            throw error;
        }
    }
    async sendTemplateEmail(to, subject, template, variables, text) {
        const html = this.templateService.render(template, variables);
        await this.sendMail({
            to,
            subject,
            html,
            text,
        });
    }
    async isConfigured() {
        if (!this.transporter) {
            await this.initTransporter();
        }
        return this.transporter !== null;
    }
};
exports.EmailService = EmailService;
exports.EmailService = EmailService = EmailService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [settings_service_1.SettingsService,
        template_service_1.TemplateService])
], EmailService);
//# sourceMappingURL=email.service.js.map