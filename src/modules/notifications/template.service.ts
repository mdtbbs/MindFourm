import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Handlebars from 'handlebars';

/**
 * Template service for rendering email templates
 * Uses Handlebars engine to support conditionals and helpers
 */
@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);

  onModuleInit(): void {
    // Register built-in Handlebars helpers
    this.registerBuiltinHelpers();
  }

  /**
   * Register built-in Handlebars helpers
   */
  private registerBuiltinHelpers(): void {
    // Equality helper for comparisons
    Handlebars.registerHelper('eq', (a: any, b: any) => {
      return a === b;
    });

    // Not equal helper
    Handlebars.registerHelper('ne', (a: any, b: any) => {
      return a !== b;
    });

    // Format date helper
    Handlebars.registerHelper('formatDate', (date: Date | string, format?: string) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      if (format === 'short') {
        return d.toLocaleDateString('zh-CN');
      }
      return d.toLocaleString('zh-CN');
    });

    // Truncate helper
    Handlebars.registerHelper('truncate', (str: string, length: number) => {
      if (!str) return '';
      if (str.length <= length) return str;
      return str.substring(0, length) + '...';
    });
  }

  /**
   * Render a template string with variables
   * @param template - The template string with Handlebars syntax
   * @param variables - Variables to substitute in the template
   * @returns Rendered HTML string
   */
  render(template: string, variables: Record<string, any>): string {
    try {
      // Compile template with Handlebars
      const compiledTemplate = Handlebars.compile(template);

      // Render with variables
      return compiledTemplate(variables);
    } catch (error) {
      this.logger.error(`Failed to render template: ${(error as Error).message}`, (error as Error).stack);

      // Fallback: if Handlebars compilation fails, return template as-is
      // This handles cases where template might be plain HTML
      return template;
    }
  }

  /**
   * Register a custom Handlebars helper
   * @param name - Helper name
   * @param helper - Helper function
   */
  registerHelper(name: string, helper: Handlebars.HelperDelegate): void {
    Handlebars.registerHelper(name, helper);
  }

  /**
   * Register a partial template
   * @param name - Partial name
   * @param partial - Partial template string
   */
  registerPartial(name: string, partial: string): void {
    Handlebars.registerPartial(name, partial);
  }
}