import * as Handlebars from 'handlebars';

export function validateHandlebarsTemplate(template: string): void {
  Handlebars.precompile(template);
}

export function escapeMarkdownText(value: string): string {
  return value.replace(/([\\`*_[\]{}()#+\-.!>|])/g, '\\$1');
}
