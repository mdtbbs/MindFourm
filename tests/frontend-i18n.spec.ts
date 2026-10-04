import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import { translate } from '../frontend/src/i18n';

const locales: Array<'en' | 'ru' | 'ja' | 'zh-CN'> = ['en', 'ru', 'ja', 'zh-CN'];
const sharedUiKeys = [
  'navigation.siteNavigation',
  'navigation.profile',
  'navigation.admin',
  'navigation.logout',
  'navigation.register',
  'navigation.login',
  'replyEditor.loading',
  'resourceComments.fullDiscussion',
];

describe('frontend translation catalogs', () => {
  it.each(locales)('%s resolves shared navigation and loading labels', (locale) => {
    for (const key of sharedUiKeys) expect(translate(locale, key)).not.toBe(key);
  });

  it('uses Chinese copy for the MDTBBS account menu', () => {
    expect(translate('zh-CN', 'navigation.profile')).toBe('个人主页');
    expect(translate('zh-CN', 'navigation.admin')).toBe('管理后台');
    expect(translate('zh-CN', 'navigation.logout')).toBe('退出登录');
    expect(translate('zh-CN', 'navigation.login')).toBe('登录');
    expect(translate('zh-CN', 'navigation.register')).toBe('注册');
  });

  it('resolves every literal translation key used by the frontend in Simplified Chinese', () => {
    const sourceRoot = path.resolve(__dirname, '../frontend/src');
    const files: string[] = [];
    const collectFiles = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) collectFiles(file);
        else if (/\.(ts|tsx)$/.test(file)) files.push(file);
      }
    };
    collectFiles(sourceRoot);

    const keys = new Set<string>();
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      const namespace = source.match(/const\s+t\s*=\s*\(key[^)]*\)\s*=>\s*translate\(locale,\s*`([^$`]+)\$\{key\}`/)?.[1];
      const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          const name = ts.isIdentifier(node.expression)
            ? node.expression.text
            : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
          const argument = node.arguments[0];
          if ((name === 't' || name === 'translate') && argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))) {
            let key = argument.text;
            if (name === 't' && namespace && !key.startsWith(namespace)) key = `${namespace}${key}`;
            keys.add(key);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(parsed);
    }

    const missing = [...keys].filter((key) => translate('zh-CN', key) === key);
    expect(keys.size).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('translates every shared resource kind in navigation and filters', () => {
    const kinds = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/common/resource-kinds.json'), 'utf8')) as Array<{ value: string }>;
    expect(kinds.length).toBeGreaterThan(0);
    for (const { value: kind } of kinds) {
      expect(translate('zh-CN', `resources.kinds.${kind}`)).not.toBe(`resources.kinds.${kind}`);
      expect(translate('zh-CN', `resourceList.resourceKind.${kind}`)).not.toBe(`resourceList.resourceKind.${kind}`);
    }
  });
});
