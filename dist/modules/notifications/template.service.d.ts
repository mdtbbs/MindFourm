import { OnModuleInit } from '@nestjs/common';
import * as Handlebars from 'handlebars';
export declare class TemplateService implements OnModuleInit {
    private readonly logger;
    onModuleInit(): void;
    private registerBuiltinHelpers;
    render(template: string, variables: Record<string, any>): string;
    registerHelper(name: string, helper: Handlebars.HelperDelegate): void;
    registerPartial(name: string, partial: string): void;
}
