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
var TemplateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateService = void 0;
const common_1 = require("@nestjs/common");
const Handlebars = __importStar(require("handlebars"));
let TemplateService = TemplateService_1 = class TemplateService {
    constructor() {
        this.logger = new common_1.Logger(TemplateService_1.name);
    }
    onModuleInit() {
        this.registerBuiltinHelpers();
    }
    registerBuiltinHelpers() {
        Handlebars.registerHelper('eq', (a, b) => {
            return a === b;
        });
        Handlebars.registerHelper('ne', (a, b) => {
            return a !== b;
        });
        Handlebars.registerHelper('formatDate', (date, format) => {
            const d = typeof date === 'string' ? new Date(date) : date;
            if (format === 'short') {
                return d.toLocaleDateString('zh-CN');
            }
            return d.toLocaleString('zh-CN');
        });
        Handlebars.registerHelper('truncate', (str, length) => {
            if (!str)
                return '';
            if (str.length <= length)
                return str;
            return str.substring(0, length) + '...';
        });
    }
    render(template, variables) {
        try {
            const compiledTemplate = Handlebars.compile(template);
            return compiledTemplate(variables);
        }
        catch (error) {
            this.logger.error(`Failed to render template: ${error.message}`, error.stack);
            return template;
        }
    }
    registerHelper(name, helper) {
        Handlebars.registerHelper(name, helper);
    }
    registerPartial(name, partial) {
        Handlebars.registerPartial(name, partial);
    }
};
exports.TemplateService = TemplateService;
exports.TemplateService = TemplateService = TemplateService_1 = __decorate([
    (0, common_1.Injectable)()
], TemplateService);
//# sourceMappingURL=template.service.js.map