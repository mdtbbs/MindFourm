import { TemplateService } from './template.service';

describe('TemplateService', () => {
  const service = new TemplateService();

  beforeAll(() => service.onModuleInit());

  it('renders variables and conditionals', () => {
    expect(service.render('{{#if action_url}}{{username}}{{/if}}', {
      username: 'Alice',
      action_url: 'https://example.com',
    })).toBe('Alice');
  });

  it('escapes HTML in ordinary variables', () => {
    expect(service.render('{{username}}', { username: '<script>alert(1)</script>' }))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('fails closed for malformed templates instead of returning raw source', () => {
    expect(() => service.render('{{#if broken}}raw', {})).toThrow();
    expect(() => service.validate('{{#if broken}}raw')).toThrow();
  });
});
