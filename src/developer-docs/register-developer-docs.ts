import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { API_V1_BASE_PATH, API_V1_VERSION } from '../openapi/api-version';
import { parseMarkdown } from '../common/utils/markdown.util';
import { getAllV1ErrorCodes } from '../common/contracts/v1-error-codes';

type CodeLanguage = 'curl' | 'javascript' | 'typescript' | 'java' | 'kotlin';

interface DocPage {
  title: string;
  description: string;
  body: string;
  toc?: Array<{ href: string; label: string; level?: number }>;
}

const PUBLIC_SITE = 'https://mdtbbs.cn';
const PUBLIC_API_ORIGIN = `${PUBLIC_SITE}/api`;

const NAV_GROUPS = [
  {
    label: '开始接入',
    items: [
      { href: '/api/v1/docs/quick-start', label: '快速开始' },
      { href: '/api/v1/docs/conventions', label: '通用约定' },
      { href: '/api/v1/docs/oauth', label: '第三方客户端授权' },
      { href: '/api/v1/docs/authentication', label: '身份认证' },
      { href: '/api/v1/docs/public-client', label: '客户端接入' },
      { href: '/api/v1/debugger', label: '在线调试' },
    ],
  },
  {
    label: '接口指南',
    items: [
      { href: '/api/v1/docs/first-party', label: '论坛 API' },
      { href: '/api/v1/docs/game-content', label: '游戏内容 API' },
      { href: '/api/v1/docs/resources', label: '资源中心 API' },
      { href: '/api/v1/docs/multiplayer', label: '多人联机 API' },
      { href: '/api/v1/docs/cloud-saves', label: '云存档 API' },
      { href: '/api/v1/docs/errors', label: '错误代码' },
    ],
  },
  {
    label: '参考资料',
    items: [
      { href: '/api/v1/docs/rich-content', label: '富文本格式' },
      { href: '/api/v1/reference', label: 'API 参考' },
      { href: '/api/v1/docs/changelog', label: 'API 更新记录' },
      { href: '/api/v1/docs/lifecycle', label: 'API 生命周期' },
    ],
  },
];

const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;
const MARKDOWN_GUIDES: Record<string, string> = {
  'first-party': 'first-party-v1.md',
  'public-client': 'public-client-v1.md',
  'rich-content': 'rich-content-schema-v2.md',
  authentication: 'authentication.md',
  'game-content': 'game-content-v1.md',
  resources: 'resources-v1-contract.md',
  multiplayer: 'multiplayer-v1.md',
  'cloud-saves': 'cloud-saves-v1.md',
};

const MARKDOWN_GUIDE_SLUGS: Record<string, string> = Object.fromEntries(
  Object.entries(MARKDOWN_GUIDES).map(([slug, file]) => [file, slug]),
);
const API_TAG_LABELS: Record<string, string> = {
  'v1-threads': '讨论与回复',
  'v1-thread-writes': '讨论与回复写入',
  'v1-resources': '资源中心',
  'v1-resource-uploads': '资源投稿',
  'v1-game-content': '游戏内容 / 地图与蓝图',
  'v1-search': '站内搜索',
  'v1-messages': '私信',
  'v1-notifications': '通知',
  'v1-users': '用户资料',
  'v1-auth': '移动端认证',
  'v1-bookmarks': '收藏',
  'v1-discover': '发现页',
  'v1-portal': '首页聚合',
  'v1-home': '首页数据',
  'v1-capabilities': '客户端能力',
  'v1-client': '客户端配置',
  'v1-feedback': '用户反馈',
  'v1-reports': '内容举报',
  'v1-uploads': '图片上传',
  'v1-lanlink': 'LanLink',
  'v1-presence': '在线状态',
  'v1-developer-feed': '开发动态',
  'v1-categories': '论坛分类',
  'v1-notices': '公告',
  'v1-game-versions': '游戏版本',
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderMarkdownGuide(slug: string): DocPage | undefined {
  const fileName = MARKDOWN_GUIDES[slug];
  if (!fileName) return undefined;
  const candidates = [join(process.cwd(), 'docs', 'api', fileName), join(__dirname, '..', '..', 'docs', 'api', fileName)];
  let markdown: string | undefined;
  for (const candidate of candidates) {
    try {
      markdown = readFileSync(candidate, 'utf8');
      break;
    } catch {
      // The next candidate supports both source and compiled launch directories.
    }
  }
  if (markdown === undefined) return undefined;
  const rewritten = markdown.replace(/\]\((?:\.\/)?([A-Za-z0-9_.-]+\.md)(#[^)\s]*)?\)/g, (match, file, anchor = '') => {
    const target = MARKDOWN_GUIDE_SLUGS[file];
    return target ? '](/api/v1/docs/' + target + anchor + ')' : match;
  });
  const headings: Array<{ level: number; id: string; label: string }> = [];
  const seenIds = new Map<string, number>();
  let inCodeFence = false;
  for (const line of rewritten.split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;
    const match = line.match(/^\s{0,3}(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const label = match[2]
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/[\*_~]/g, '')
      .trim();
    const baseId = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || `section-${headings.length + 1}`;
    const count = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, count);
    headings.push({ level: match[1].length, id: count === 1 ? baseId : `${baseId}-${count}`, label });
  }
  let headingIndex = 0;
  const parsedBody = parseMarkdown(rewritten).replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (html, level: string, inner: string) => {
    const heading = headings[headingIndex++];
    return heading ? `<h${level} id="${heading.id}">${inner}</h${level}>` : html;
  });
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || slug;
  const toc = headings
    .filter((heading) => heading.level === 2)
    .map((heading) => ({ href: `#${encodeURI(heading.id)}`, label: heading.label, level: heading.level }));
  return {
    title,
    description: title + ' · MDTBBS API 文档',
    body: '<div class="markdown-body">' + parsedBody + '</div>',
    toc,
  };
}

function inlineCode(value: string): string {
  return `<code>${escapeHtml(value)}</code>`;
}

function codeBlock(value: string, language = ''): string {
  return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(value)}</code></pre>`;
}

function section(title: string, body: string, id?: string): string {
  return `<section${id ? ` id="${escapeHtml(id)}"` : ''}><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function callout(kind: 'info' | 'warning', title: string, body: string): string {
  return `<div class="callout ${kind}"><strong>${escapeHtml(title)}</strong><p>${body}</p></div>`;
}

function table(headers: string[], rows: string[][]): string {
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function commonShell(params: {
  title: string;
  description: string;
  body: string;
  forumVersion: string;
  activePath?: string;
  toc?: Array<{ href: string; label: string; level?: number }>;
  script?: string;
}): string {
  const nonce = randomBytes(16).toString('base64');
  const nav = NAV_GROUPS.map((group) => {
    const items = group.items.map((item) => {
      const active = params.activePath === item.href ? ' aria-current="page"' : '';
      return `<a href="${item.href}"${active}>${escapeHtml(item.label)}</a>`;
    }).join('');
    return `<div class="sidebar-group"><div class="sidebar-group-title">${escapeHtml(group.label)}</div>${items}</div>`;
  }).join('');

  const toc = params.toc?.length
    ? `<aside class="toc"><div class="toc-title">本页目录</div>${params.toc.map((item) => `<a class="${'level' in item && item.level === 3 ? 'toc-subitem' : ''}" href="${item.href}">${escapeHtml(item.label)}</a>`).join('')}</aside>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="description" content="${escapeHtml(params.description)}">
  <title>${escapeHtml(params.title)} · MDTBBS API</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --bg: #ffffff;
      --surface: #f7f8fa;
      --surface-2: #eef1f4;
      --text: #202124;
      --muted: #667085;
      --border: #e4e7ec;
      --accent: #2563eb;
      --accent-soft: #eff6ff;
      --code: #111827;
      --code-text: #e5e7eb;
      --get: #067647;
      --post: #175cd3;
      --put: #b54708;
      --patch: #7a5af8;
      --delete: #b42318;
      --max: 1320px;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #101214;
        --surface: #171a1d;
        --surface-2: #202428;
        --text: #f2f4f7;
        --muted: #98a2b3;
        --border: #2c3238;
        --accent: #84adff;
        --accent-soft: #172554;
        --code: #090b0d;
        --code-text: #e5e7eb;
      }
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      line-height: 1.7;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      display: flex;
      align-items: center;
      gap: 22px;
      height: 60px;
      padding: 0 24px;
      border-bottom: 1px solid var(--border);
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      backdrop-filter: blur(14px);
    }
    .brand { display: flex; align-items: center; gap: 10px; color: var(--text); font-weight: 720; letter-spacing: -0.02em; }
    .brand-mark { width: 27px; height: 27px; border-radius: 2px; display: grid; place-items: center; background: var(--text); color: var(--bg); font-size: 12px; font-weight: 800; }
    .top-links { margin-left: auto; display: flex; gap: 16px; align-items: center; font-size: 14px; }
    .version-pill { padding: 4px 9px; border: 1px solid var(--border); border-radius: 2px; color: var(--muted); }
    .layout {
      width: min(100%, var(--max));
      margin: 0 auto;
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr) 180px;
      gap: 32px;
      padding: 32px 24px 72px;
    }
    .layout:not(.has-toc) { grid-template-columns: 220px minmax(0, 1fr); }
    .sidebar { position: sticky; top: 86px; align-self: start; display: flex; flex-direction: column; gap: 17px; }
    .sidebar-title { margin: 0 0 10px 10px; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .04em; }
    .sidebar-group { display: flex; flex-direction: column; gap: 2px; }
    .sidebar-group-title { padding: 0 10px 5px; color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .06em; }
    .sidebar a { padding: 7px 10px; border-radius: 7px; border-left: 2px solid transparent; color: var(--muted); font-size: 14px; }
    .sidebar a[aria-current="page"] { background: var(--accent-soft); color: var(--accent); border-left-color: var(--accent); font-weight: 650; }
    .content { min-width: 0; max-width: 820px; }
    .eyebrow { color: var(--accent); font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    h1 { margin: 8px 0 14px; font-size: clamp(32px, 4vw, 44px); line-height: 1.16; letter-spacing: -0.035em; }
    .lead { margin: 0 0 28px; max-width: 760px; color: var(--muted); font-size: 18px; }
    h2 { margin: 38px 0 14px; padding-top: 17px; border-top: 1px solid var(--border); font-size: 23px; line-height: 1.35; letter-spacing: -0.02em; scroll-margin-top: 84px; }
    h3 { margin: 27px 0 9px; font-size: 17px; line-height: 1.4; scroll-margin-top: 84px; }
    h4 { margin: 20px 0 8px; font-size: 15px; }
    p { max-width: 78ch; margin: 10px 0 16px; }
    ul, ol { max-width: 78ch; padding-left: 24px; }
    li { padding-left: 2px; }
    li + li { margin-top: 5px; }
    code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: .92em; }
    :not(pre) > code { padding: 2px 5px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); overflow-wrap: anywhere; }
    pre { overflow: auto; margin: 15px 0 23px; padding: 17px 19px; border: 1px solid var(--border); border-radius: 9px; background: var(--code); color: var(--code-text); line-height: 1.6; }
    pre code { font-size: 13px; }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 24px 0; }
    .card { display: block; min-height: 112px; padding: 17px 18px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); color: var(--text); }
    .card:hover { background: var(--surface); text-decoration: none; }
    .card strong { display: block; margin-bottom: 5px; }
    .card span { display: block; color: var(--muted); font-size: 14px; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 26px 0; }
    .stat { padding: 14px 16px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
    .stat span { display: block; color: var(--muted); font-size: 12px; }
    .stat strong { display: block; margin-top: 4px; overflow-wrap: anywhere; font-size: 15px; }
    .callout { margin: 20px 0; padding: 14px 16px; border: 1px solid color-mix(in srgb, var(--accent) 25%, var(--border)); border-left: 3px solid var(--accent); border-radius: 8px; background: var(--accent-soft); }
    .callout.warning { border-left-color: #f79009; background: color-mix(in srgb, #f79009 10%, var(--bg)); }
    .callout p { margin: 5px 0 0; color: var(--muted); }
    .table-wrap { overflow: auto; margin: 14px 0 24px; border: 1px solid var(--border); border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; min-width: 560px; font-size: 14px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { background: var(--surface); color: var(--muted); font-size: 12px; font-weight: 650; }
    tbody tr:hover { background: color-mix(in srgb, var(--surface) 65%, transparent); }
    tr:last-child td { border-bottom: 0; }
    .toc { position: sticky; top: 86px; align-self: start; border-left: 1px solid var(--border); padding: 2px 0 2px 15px; display: flex; flex-direction: column; gap: 7px; font-size: 12px; }
    .toc-title { margin-bottom: 4px; color: var(--muted); font-weight: 650; }
    .toc a { color: var(--muted); line-height: 1.45; }
    .toc .toc-subitem { padding-left: 10px; }
    .endpoint { margin: 10px 0; padding: 18px 18px 20px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); }
    .endpoint-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .method { min-width: 62px; padding: 3px 8px; border-radius: 2px; color: white; text-align: center; font-size: 12px; font-weight: 800; }
    .method.get { background: var(--get); } .method.post { background: var(--post); } .method.put { background: var(--put); }
    .method.patch { background: var(--patch); } .method.delete { background: var(--delete); }
    .endpoint-path { overflow-wrap: anywhere; font-family: "SFMono-Regular", Consolas, monospace; font-weight: 650; }
    .endpoint-summary { margin: 9px 0 0; color: var(--muted); }
    .use-case { margin: 12px 0 0; padding: 10px 12px; border-left: 2px solid var(--border); background: var(--surface); color: var(--muted); font-size: 14px; }
    .use-case strong { color: var(--text); }
    .schema-gap { margin: 12px 0; padding: 10px 12px; border-left: 2px solid #f79009; background: color-mix(in srgb, #f79009 8%, var(--bg)); color: var(--muted); font-size: 14px; }
    .meta-line { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .badge { padding: 3px 7px; border: 1px solid var(--border); border-radius: 2px; color: var(--muted); font-size: 12px; }
    .code-example { margin-top: 16px; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }
    .code-tabs { display: flex; gap: 2px; overflow-x: auto; padding: 8px; background: var(--surface); }
    .code-tabs button { appearance: none; border: 0; border-radius: 2px; padding: 6px 9px; background: transparent; color: var(--muted); cursor: pointer; font: inherit; font-size: 12px; }
    .code-tabs button[aria-selected="true"] { background: var(--bg); color: var(--text); box-shadow: inset 0 0 0 1px var(--border); }
    .code-example pre { display: none; margin: 0; border-radius: 0; }
    .code-example pre[data-active="true"] { display: block; }
    .reference-filter { width: 100%; margin: 10px 0 22px; padding: 12px 13px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); font: inherit; }
    .debug-link { display: inline-block; padding: 8px 11px; border: 1px solid var(--border); border-radius: 7px; font-weight: 650; }
    .debug-panel { display: grid; gap: 14px; margin: 18px 0; padding: 18px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); }
    .debug-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .debug-field { display: grid; gap: 6px; min-width: 0; }
    .debug-field label { font-size: 13px; font-weight: 650; }
    .debug-field input, .debug-field select, .debug-field textarea { width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font: inherit; }
    .debug-field textarea { min-height: 180px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 13px; }
    .debug-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
    .debug-actions button { padding: 9px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); cursor: pointer; font: inherit; }
    .debug-actions button.primary { border-color: var(--accent); background: var(--accent); color: white; }
    .debug-output { overflow-wrap: anywhere; }
    .debug-output pre { max-height: 460px; }
    .debug-error { color: #d92d20; }
    .footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
    .markdown-body { min-width: 0; }
    .markdown-body > h1 + p { max-width: 74ch; margin: 0 0 28px; color: var(--muted); font-size: 17px; line-height: 1.75; }
    .markdown-body table { display: block; max-width: 100%; overflow-x: auto; }
    .markdown-body img { max-width: 100%; height: auto; }
    .markdown-body blockquote { margin: 18px 0; padding: 4px 16px; border-left: 3px solid var(--border); color: var(--muted); }
    .markdown-body hr { margin: 30px 0; border: 0; border-top: 1px solid var(--border); }
    @media (max-width: 1100px) {
      .layout { grid-template-columns: 205px minmax(0, 1fr); }
      .toc { display: none; }
    }
    @media (max-width: 760px) {
      .topbar { padding: 0 16px; }
      .top-links .hide-mobile, .version-pill { display: none; }
      .layout { display: block; padding: 22px 16px 54px; }
      .sidebar { position: static; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--border); flex-direction: row; align-items: flex-start; gap: 18px; overflow-x: auto; }
      .sidebar-title, .sidebar-group-title { display: none; }
      .sidebar-group { flex: 0 0 auto; flex-direction: row; gap: 2px; }
      .sidebar a { white-space: nowrap; }
      .cards, .stat-grid { grid-template-columns: 1fr; }
      .debug-grid { grid-template-columns: 1fr; }
      h1 { font-size: 38px; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/api/v1"><span class="brand-mark">MDT</span><span>MDTBBS API</span></a>
    <nav class="top-links" aria-label="顶栏导航">
      <a class="hide-mobile" href="/">返回论坛</a>
      <a href="/api/openapi/v1.json">OpenAPI</a>
      <span class="version-pill">API v${escapeHtml(API_V1_VERSION)}</span>
    </nav>
  </header>
  <div class="layout${params.toc?.length ? ' has-toc' : ''}">
    <nav class="sidebar" aria-label="开发者文档">
      <div class="sidebar-title">开发者文档</div>
      <a href="/api/v1"${params.activePath === '/api/v1' ? ' aria-current="page"' : ''}>概览</a>
      ${nav}
    </nav>
    <main class="content">
      ${params.body}
  <div class="footer">MDTBBS 论坛 ${escapeHtml(params.forumVersion)} · API v${escapeHtml(API_V1_VERSION)} · 文档内容以当前公开稳定接口为准。</div>
    </main>
    ${toc}
  </div>
  <script nonce="${nonce}">
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-code-tab]');
      if (!button) return;
      var root = button.closest('.code-example');
      if (!root) return;
      var language = button.getAttribute('data-code-tab');
      root.querySelectorAll('[data-code-tab]').forEach(function (item) {
        item.setAttribute('aria-selected', item === button ? 'true' : 'false');
      });
      root.querySelectorAll('[data-code-lang]').forEach(function (item) {
        item.setAttribute('data-active', item.getAttribute('data-code-lang') === language ? 'true' : 'false');
      });
    });
    var filter = document.querySelector('[data-reference-filter]');
    if (filter) {
      filter.addEventListener('input', function () {
        var query = filter.value.trim().toLowerCase();
        document.querySelectorAll('[data-endpoint-search]').forEach(function (item) {
          item.hidden = query && !item.getAttribute('data-endpoint-search').includes(query);
        });
      });
      var initialQuery = new URLSearchParams(window.location.search).get('q');
      if (initialQuery) {
        filter.value = initialQuery;
        filter.dispatchEvent(new Event('input'));
      }
    }
  </script>
  ${params.script ? `<script nonce="${nonce}">${params.script}</script>` : ''}
</body>
</html>`;
}

function setHtmlHeaders(res: any, nonceAwareHtml: string, options: { noStore?: boolean } = {}): void {
  const nonceMatch = nonceAwareHtml.match(/<style nonce="([^"]+)">/);
  const nonce = nonceMatch?.[1] || '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', options.noStore ? 'no-store' : 'public, max-age=300, stale-while-revalidate=600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' data:; connect-src 'self' https://auth.mdtbbs.cn; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
}

function renderHome(forumVersion: string): string {
  const body = `
    <div class="eyebrow">开发者文档</div>
    <h1>MDTBBS API</h1>
    <p class="lead">供客户端、Mindustry Mod、启动器和服务端集成使用的公开接口。每篇指南说明接口用途、认证要求、请求字段和返回值，并提供可按需修改的示例。</p>
    <div class="stat-grid">
      <div class="stat"><span>论坛版本</span><strong>${escapeHtml(forumVersion)}</strong></div>
      <div class="stat"><span>API 版本</span><strong>v${escapeHtml(API_V1_VERSION)}</strong></div>
      <div class="stat"><span>API 地址</span><strong>mdtbbs.cn/api/v1</strong></div>
    </div>
    ${callout('info', '先检查服务能力', `客户端启动后先请求 ${inlineCode('GET /api/v1/capabilities')}，再根据服务端返回值启用对应功能。`)}
    <h2>按目标开始</h2>
    <div class="cards">
      <a class="card" href="/api/v1/docs/quick-start"><strong>快速开始</strong><span>请求、响应、版本与错误处理。</span></a>
      <a class="card" href="/api/v1/docs/oauth"><strong>Authentication</strong><span>为自己的客户端注册 OAuth Client，使用 Authorization Code + PKCE 登录。</span></a>
      <a class="card" href="/api/v1/docs/public-client"><strong>Build a launcher</strong><span>了解能力发现、资源安装、游戏内容与客户端请求约定。</span></a>
      <a class="card" href="/api/v1/docs/public-client"><strong>Build a community client</strong><span>从讨论、用户资料、通知和社交能力开始接入。</span></a>
      <a class="card" href="/api/v1/docs/first-party"><strong>Read forum content</strong><span>读取讨论、回复、用户资料、公告与首页聚合。</span></a>
      <a class="card" href="/api/v1/docs/first-party"><strong>Publish forum content</strong><span>创建讨论和回复、上传图片并处理稳定错误码。</span></a>
      <a class="card" href="/api/v1/docs/resources"><strong>Access resources</strong><span>查询资源、Manifest、版本、文件摘要与下载。</span></a>
      <a class="card" href="/api/v1/docs/resources"><strong>Upload resources</strong><span>创建草稿、上传文件并提交审核。</span></a>
      <a class="card" href="/api/v1/docs/resources"><strong>Install a Pack</strong><span>使用固定资源版本、校验文件摘要并批量申请下载 grants。</span></a>
      <a class="card" href="/api/v1/reference?q=%2Fv1%2Fsearch"><strong>Search</strong><span>查看论坛搜索接口的参数、权限和当前分页字段。</span></a>
      <a class="card" href="/api/v1/docs/game-content"><strong>Game content</strong><span>浏览 Mindustry 蓝图和地图，进行搜索、预览与下载。</span></a>
      <a class="card" href="/api/v1/docs/cloud-saves"><strong>Cloud Saves</strong><span>管理个人存档、历史版本、上传、恢复与配额。</span></a>
      <a class="card" href="/api/v1/docs/multiplayer"><strong>Friends &amp; Presence</strong><span>好友关系、Presence、隐私与实时状态。</span></a>
      <a class="card" href="/api/v1/docs/multiplayer"><strong>Multiplayer</strong><span>创建和加入 Session、邀请、Join Intent、连接候选与 Relay。</span></a>
      <a class="card" href="/api/v1/reference?q=%2Fv1%2Fnotifications"><strong>Notifications</strong><span>读取通知、未读数量并确认已读状态。</span></a>
      <a class="card" href="/api/v1/docs/oauth"><strong>第三方客户端授权</strong><span>让桌面端、Android、Mod 和启动器安全登录论坛账号。</span></a>
      <a class="card" href="/api/v1/debugger"><strong>在线调试 Public API</strong><span>使用自己的 OAuth Client 调试明确选中的公开操作。</span></a>
      <a class="card" href="/api/v1/docs/rich-content"><strong>富文本格式</strong><span>发帖、回复和资源说明使用的正文数据格式。</span></a>
      <a class="card" href="/api/v1/docs/authentication"><strong>身份认证</strong><span>使用自己的 Public Client、获批 scopes 和 Bearer token。</span></a>
      <a class="card" href="/api/v1/reference"><strong>API 参考</strong><span>按路径查询参数、权限要求和响应字段。</span></a>
    </div>
    ${section('最小示例', `${codeBlock(`curl "https://mdtbbs.cn/api/v1/threads?limit=20&offset=0"`, 'bash')}<p>公开讨论可以匿名读取。发帖、回复等写操作需要 Bearer 身份和对应 scope。</p>`)}
    ${section('公开接口范围', '<p>第三方客户端接口使用 <code>/api/v1/*</code>。服务端集成、管理端和服务间路由不属于本 Public Client Developer Center 或稳定契约。</p>')}
  `;
  return commonShell({
    title: '概览',
    description: 'MDTBBS API 开发者文档入口',
    body,
    forumVersion,
    activePath: '/api/v1',
  });
}

function guidePages(): Record<string, DocPage> {
  const quickStart = `
    <div class="eyebrow">开始使用</div><h1>快速开始</h1>
    <p class="lead">MDTBBS 的公开 API 以 HTTPS 提供。读取蓝图、地图和公开资源通常无需认证，写操作和用户状态接口按场景使用对应凭证。</p>
    ${section('读取服务能力', `${codeBlock('curl https://mdtbbs.cn/api/v1/capabilities', 'bash')}<p>能力为 <code>false</code> 时，客户端应隐藏或禁用对应功能，不要反复请求未启用的接口。</p>`, 'capabilities')}
    ${section('调用公开接口', codeBlock('curl "https://mdtbbs.cn/api/v1/game-content/blueprints?limit=20"', 'bash'), 'public-read')}
    ${section('处理 V1 响应', `${codeBlock(`{
  "data": {},
  "meta": {
    "request_id": "req_..."
  }
}`, 'json')}<p>控制流应依赖 HTTP 状态码和稳定的 <code>error.code</code>，不要匹配中文错误消息。</p>`, 'response')}
    ${section('查看完整接口定义', `<p>OpenAPI：<a href="/api/openapi/v1.json"><code>/api/openapi/v1.json</code></a>。按参数查询：<a href="/api/v1/reference"><code>/api/v1/reference</code></a>。</p>`, 'openapi')}
  `;

  const conventions = `
    <div class="eyebrow">基础规范</div><h1>通用约定</h1>
    <p class="lead">V1 客户端应把公开 ID、错误码、能力发现和文件 Hash 当作稳定边界，而不是依赖论坛数据库内部实现。</p>
    ${section('响应 Envelope', `${codeBlock(`{
  "data": {},
  "meta": { "request_id": "req_..." }
}`, 'json')}${codeBlock(`{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "请求参数无效",
    "retryable": false,
    "details": []
  },
  "meta": { "request_id": "req_..." }
}`, 'json')}`, 'envelope')}
    ${section('分页字段', `${table(['字段', '含义'], [
      [inlineCode('meta.request_id'), '本次请求 ID；联系维护者排查时可提供此值。'],
      [inlineCode('meta.pagination.page'), '当前页码，从 1 开始。'],
      [inlineCode('meta.pagination.limit'), '每页条数。'],
      [inlineCode('meta.pagination.total'), '匹配的总条数。'],
      [inlineCode('meta.pagination.total_pages'), '总页数。'],
      [inlineCode('meta.pagination.has_more'), '是否还有下一页。'],
      [inlineCode('meta.next_cursor'), '部分游标接口返回的下一页不透明游标。'],
    ])}<p>分页位置由各接口响应契约决定：例如讨论 cursor 列表把 <code>next_cursor</code> 放在 <code>data</code> 对象里，云存档列表使用 <code>meta.next_cursor</code>。不要跨接口假设字段位置。</p>`, 'pagination')}
    ${section('文件与重定向响应', '<p>文件、图片与重定向接口可能直接返回字节流或 3xx 状态，不使用 JSON 响应结构。调用方应检查 <code>Content-Type</code>、状态码、<code>ETag</code> 和文件 Hash。</p>', 'raw')}
    ${section('兼容策略', '<ul><li>V1 内可以新增可选字段，客户端必须忽略未知字段。</li><li>删除字段、改变必填关系或身份语义时应进入新版本。</li><li>跨客户端对象优先使用稳定 public id，不持久化数据库自增 ID。</li><li>Preview 不可用不代表原始资源不可用。</li></ul>', 'compat')}
    ${section('默认限流', `<p>无更严格声明时，默认读请求约 <code>1200 / 60s</code>，写请求约 <code>180 / 60s</code>。达到限制返回 HTTP 429，V1 错误码为 <code>RATE_LIMITED</code>。</p>`, 'rate-limit')}
  `;

  const oauth = `
    <div class="eyebrow">MindAuth 授权</div><h1>第三方客户端登录</h1>
    <p class="lead">新做的桌面端、Android、Mindustry Mod、启动器和其他第三方客户端都走这一套。应用只拿公开的 <code>client_id</code>，不发 <code>client_secret</code>。</p>
    ${section('先去哪里申请', `<p>登录 <a href="https://auth.mdtbbs.cn/developer">MindAuth 开发者中心</a> 创建应用，填写名称、说明、主页、Redirect URI 和需要的 scopes。应用通过审核后会得到 <code>client_id</code>。</p><p>注册账号仍在 <a href="https://auth.mdtbbs.cn/register">MindAuth</a> 完成。密码、验证码和风控都留在账号系统里，第三方客户端不应该自己接管这些东西。</p>`, 'apply')}
    ${section('接入流程', '<ol><li>生成随机 <code>state</code> 和 PKCE <code>code_verifier</code>。</li><li>计算 <code>code_challenge = BASE64URL(SHA256(code_verifier))</code>。</li><li>用系统浏览器打开 MindAuth <code>/api/authorize</code>。</li><li>回调后先校验 <code>state</code>，再用授权码和原始 verifier 请求 <code>/api/token</code>。</li><li>拿到 access token 后，以 <code>Authorization: Bearer</code> 调用论坛 <code>/api/v1/*</code>。</li></ol>', 'flow')}
    ${section('Redirect URI', `${table(['客户端', '写法', '要求'], [
      ['Web 服务', inlineCode('https://example.com/oauth/callback'), 'HTTPS，必须与登记值完全匹配'],
      ['原生应用', inlineCode('com.example.app:/oauth2redirect'), '使用应用自己的 scheme，不能用 javascript / file / intent'],
      ['桌面 loopback', inlineCode('http://127.0.0.1:0/oauth/callback'), '只接受 127.0.0.1 或 [::1]；运行时端口可随机'],
    ])}<p>不要登记 <code>localhost</code>、局域网地址、通配符回调，也不要在 callback 里放 fragment 或 userinfo。</p>`, 'redirect')}
    ${section('发起授权', `${codeBlock(`https://auth.mdtbbs.cn/api/authorize
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=REGISTERED_CALLBACK
  &scope=openid%20profile%20forum.read
  &state=RANDOM_STATE
  &code_challenge=BASE64URL_SHA256
  &code_challenge_method=S256`, 'text')}<p>每次登录都重新生成 state 和 verifier。不要复用上一次登录留下来的 PKCE 值。</p>`, 'authorize')}
    ${section('换取 Token', `${codeBlock(`POST https://auth.mdtbbs.cn/api/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "client_id": "YOUR_CLIENT_ID",
  "code": "AUTHORIZATION_CODE",
  "redirect_uri": "REGISTERED_CALLBACK",
  "code_verifier": "ORIGINAL_VERIFIER"
}`, 'http')}<p>Public Client 不发送 <code>client_secret</code>。授权码五分钟有效，只能使用一次，并且绑定 client、Redirect URI 和 PKCE challenge。</p>`, 'token')}
    ${section('刷新与撤销', `${codeBlock(`POST https://auth.mdtbbs.cn/api/token
Content-Type: application/json
Idempotency-Key: RANDOM_UUID_PERSISTED_FOR_THIS_ATTEMPT

{
  "grant_type": "refresh_token",
  "client_id": "YOUR_CLIENT_ID",
  "refresh_token": "CURRENT_REFRESH_TOKEN"
}`, 'http')}<p><code>Idempotency-Key</code> 可选，但建议每次 refresh grant 发送唯一 key。发送前持久保存 key；遇到超时或 5xx 时，10 分钟内用原 refresh token 和同一个 key 重试。成功后原子保存新的 refresh token 并清除待处理 key。未带 key 的旧客户端仍按单次轮换行为刷新，但不能恢复超时前的响应，重放旧 token 会触发原有撤销策略。格式错误的非空 key 会返回 <code>400 invalid_request</code>，不会消耗 refresh token。Access token 当前有效期约一小时。</p>${codeBlock(`POST https://auth.mdtbbs.cn/api/revoke
Content-Type: application/json

{
  "client_id": "YOUR_CLIENT_ID",
  "token": "TOKEN_TO_REVOKE"
}`, 'http')}`, 'refresh')}
    ${section('权限范围（Scopes）', table(['Scope', '用途'], [
      [inlineCode('openid'), '稳定账号标识'],
      [inlineCode('profile'), '基本资料'],
      [inlineCode('email'), '邮箱和验证状态'],
      [inlineCode('forum.read'), '读取论坛、帖子、回复和公开用户资料'],
      [inlineCode('forum.write'), '发帖、回复、编辑以及相关写操作'],
      [inlineCode('resource.read'), '读取资源'],
      [inlineCode('resource.download'), '下载资源文件'],
      [inlineCode('resource.upload'), '创建上传草稿并提交资源'],
      [inlineCode('notification.read'), '读取、处理通知'],
      [inlineCode('message.read'), '读取私信'],
      [inlineCode('message.write'), '发送私信'],
      [inlineCode('friends.read'), '查看好友和隐私设置允许访问的社交状态'],
      [inlineCode('presence.read'), '读取在线状态与活动；仍受隐私设置约束'],
      [inlineCode('presence.write'), '更新在线状态与 Rich Activity；客户端能力另需审核'],
      [inlineCode('multiplayer.read'), '查看可访问的联机会话、Peer 和连接信息'],
      [inlineCode('multiplayer.write'), '创建或加入联机会话、邀请好友和申请 Relay；客户端能力另需审核'],
      [inlineCode('game_content.saves.read'), '读取游戏云存档'],
      [inlineCode('game_content.saves.write'), '创建或更新游戏云存档'],
      [inlineCode('game_content.saves.delete'), '删除游戏云存档'],
    ]), 'scopes')}
    ${callout('info', '权限按操作类别申请', 'Scope 表示客户端可以请求哪类操作，不会为每条 API 路径单独创建一项。例如蓝图和地图共用 <code>resource.read</code> 或 <code>resource.upload</code>；部分公开 GET 接口无需登录。Presence 和多人联机还需要在应用表单申请相应能力并通过审核。服务端集成凭证不属于 Public Client OAuth。')}
    ${section('论坛还会检查用户和站点权限', '<p>OAuth scope 说明客户端可以请求哪类操作。论坛执行请求时还会检查用户封禁、手机号验证、社区条款、版块权限、审核策略、站点开关和资源策略。</p><p>客户端启动后先请求 <code>GET /api/v1/capabilities</code>。登录后也可以读取 <code>GET /api/v1/me</code> 中的 <code>permissions</code>，决定是否展示操作入口。每个接口仍会独立校验权限；<code>permissions</code> 只是界面提示，不能代替授权。</p>', 'policy')}
    ${section('常见失败', table(['错误', '通常是什么问题'], [
      [inlineCode('invalid_client'), 'client_id 不存在、未批准、已停用，或 Confidential Client 缺少正确认证'],
      [inlineCode('invalid_scope'), '申请了应用没有获批的 scope'],
      [inlineCode('invalid_grant'), '授权码过期/已使用、redirect 不一致、PKCE verifier 错误，或 refresh token 已失效'],
      [inlineCode('access_denied'), '用户在授权页拒绝了授权'],
      [inlineCode('PHONE_NOT_VERIFIED'), 'OAuth 已成功，但全局论坛写入校验要求先验证手机号'],
      [inlineCode('PHONE_VERIFICATION_REQUIRED'), '部分服务接口或权限快照表示手机号验证尚未完成'],
      [inlineCode('TERMS_ACCEPTANCE_REQUIRED'), '需要先接受当前社区条款'],
      [inlineCode('FEATURE_DISABLED'), '站点暂时关闭了对应能力'],
      [inlineCode('THIRD_PARTY_ACCESS_DISABLED'), '例如第三方私信能力还没有开放'],
    ]), 'errors')}
    ${callout('warning', '客户端里不要塞服务器密钥', 'Public Client 里只应该出现 client_id。MindAuth 密码、External API Key、Forum 服务密钥和 client secret 都不应该进入 APK、Mod JAR、桌面发行包或网页 bundle。')}
    ${section('自动发现', '<p>协议端点和当前 scopes 可以从 <a href="https://auth.mdtbbs.cn/.well-known/openid-configuration"><code>/.well-known/openid-configuration</code></a> 读取。MindAuth 当前提供 UserInfo，但 Public Client 不需要也不能调用服务端用的 token introspection。</p>', 'discovery')}
  `;

  const authentication = `
    <div class="eyebrow">认证方式</div><h1>身份认证</h1>
    <p class="lead">第三方客户端统一使用 MindAuth Public Client OAuth。每个应用使用自己的 client_id 与获批 scopes。</p>
    ${table(['场景', '凭证', '说明'], [
      ['公开读取', '无需凭证', '蓝图、地图、公开资源等允许匿名读取的接口'],
      ['第三方客户端', 'MindAuth Public Client Bearer', 'Authorization Code + PKCE；不得使用第一方兼容凭证'],
      ['服务端集成', '独立的服务端凭证', '只在可信服务端保存，不可嵌入客户端'],
    ])}
    ${section('新客户端：MindAuth Public Client', '<p>先在 <a href="/api/v1/docs/oauth">OAuth / Public Client</a> 页面完成应用申请和 PKCE 登录。成功后，把 MindAuth access token 放到 <code>Authorization: Bearer &lt;token&gt;</code>。Forum 会在服务端校验 token 和 scopes，客户端自己不需要解析 opaque token。</p>', 'public-client')}
    ${section('第一方兼容能力', '<p>论坛可能保留已发布第一方客户端需要的兼容登录方式，但这些能力不属于第三方 Public API，也不会赋予第三方应用额外权限。</p>', 'first-party-compat')}
    ${callout('warning', '终端客户端只带自己的公开凭证', 'Public Client 只使用自己的 client_id 和获批 scopes。用户密码、服务器端凭证和 client secret 都不应进入浏览器 JavaScript、APK、Mod JAR、桌面客户端发行包或公开仓库。')}
  `;

  const firstParty = `
    <div class="eyebrow">公开论坛接口</div><h1>论坛 API V1</h1>
    <p class="lead">这些接口供 Web、Android、桌面端及其他受支持客户端使用。参数和响应字段见 API 参考。</p>
    ${section('基础入口', table(['方法', '路径', '说明'], [
      ['GET', inlineCode('/api/v1/capabilities'), '能力发现'],
      ['GET', inlineCode('/api/v1/client/config'), '客户端版本与功能配置'],
      ['GET', inlineCode('/api/v1/me'), '当前用户'],
      ['GET', inlineCode('/api/v1/users/{id}'), '用户公开资料'],
      ['GET', inlineCode('/api/v1/threads'), '讨论列表'],
      ['GET', inlineCode('/api/v1/discover'), '发现页聚合'],
      ['GET', inlineCode('/api/v1/home'), '首页聚合'],
      ['GET', inlineCode('/api/v1/portal'), 'Portal 聚合'],
    ]), 'entry')}
    ${section('写操作', '<p>创建讨论、回复、更新资料、上传图片、举报和反馈等接口需要相应登录状态，同时可能受手机号验证、封禁状态和社区条款约束。</p>', 'writes')}
    ${callout('info', '不要依赖 Legacy API', '源码里存在 /api/posts、/api/resources 等历史路由，但它们不属于第三方长期稳定契约。')}
  `;

  const gameContent = `
    <div class="eyebrow">Mindustry</div><h1>游戏内容 API</h1>
    <p class="lead"><code>/api/v1/game-content</code> 提供蓝图和地图的浏览、搜索、预览、下载与上传能力，适合游戏内 Mod、启动器、桌面工具和移动端。</p>
    ${section('能拿来做什么', '<ul><li><strong>游戏内资源浏览器：</strong>直接在 Mindustry Mod 里展示地图和蓝图。</li><li><strong>启动器内容页：</strong>搜索、筛选并预览社区地图和蓝图。</li><li><strong>地图管理器：</strong>读取详情后下载地图原文件。</li><li><strong>第三方投稿工具：</strong>登录后上传地图并完成提交。</li></ul>', 'use-cases')}
    ${section('示例：做一个地图列表', `<p>这个请求适合“最新地图”、地图选择器和启动器内容页。拿到列表后，再用详情或下载接口继续处理。</p>${codeTabs(makeCodeSamples('GET', '/v1/game-content/maps?limit=20', {}))}`, 'example')}
    ${section('浏览与详情', table(['Method', 'Path', '说明'], [
      ['GET', inlineCode('/api/v1/game-content/meta'), '能力与上传限制'],
      ['GET', inlineCode('/api/v1/game-content/blueprints'), '蓝图列表'],
      ['GET', inlineCode('/api/v1/game-content/maps'), '地图列表'],
      ['GET', inlineCode('/api/v1/game-content/blueprints/{id}'), '蓝图详情'],
      ['GET', inlineCode('/api/v1/game-content/maps/{id}'), '地图详情'],
      ['GET', inlineCode('/api/v1/game-content/search'), '统一搜索'],
      ['GET', inlineCode('/api/v1/game-content/tags'), '标签'],
      ['GET', inlineCode('/api/v1/game-content/feed'), 'Feed'],
    ]), 'browse')}
    ${section('蓝图', '<p><code>GET /blueprints/{id}/code</code> 返回可直接复制/导入的蓝图代码；<code>GET /blueprints/{id}/preview</code> 返回图片字节。提交蓝图使用 <code>POST /blueprints</code>，需要 MindAuth Bearer，当前限流约 <code>5 / 3600s</code>。</p>', 'blueprints')}
    ${section('地图下载', '<p><code>GET /maps/{id}/download</code> 获取下载信息，<code>GET /maps/{id}/download/file</code> 返回或重定向到实际文件。客户端应校验服务端给出的 SHA-256 / ETag。</p>', 'maps')}
    ${section('地图上传', '<p>上传采用 session 流程：<code>POST /maps/uploads</code> 上传 <code>.msav</code> 与 SHA-256，查询 session / 私有预览后，再调用 <code>POST /maps/uploads/{uploadId}/complete</code> 完成提交。单文件硬上限当前为 20 MiB，部署可配置更小值。</p>', 'upload')}
    ${section('互动与当前用户', '<p>点赞、收藏、<code>/me</code>、<code>/me/favorites</code>、<code>/me/resources</code> 需要 MindAuth Bearer，并遵守账号发布权限条件。</p>', 'viewer')}
  `;

  const resources = `
    <div class="eyebrow">公开资源</div><h1>资源中心 API</h1>
    <p class="lead">资源中心 API 是论坛资源页、启动器和其他客户端共用的稳定资源模型，覆盖资源详情、版本、Manifest、预览和文件下载。</p>
    ${section('能拿来做什么', '<ul><li><strong>第三方启动器：</strong>展示 Mod、工具等资源并读取版本信息。</li><li><strong>自动更新：</strong>通过 Manifest、版本和文件 Hash 判断是否需要下载。</li><li><strong>资源管理器：</strong>展示详情、预览以及可安装文件。</li><li><strong>投稿客户端：</strong>通过 Draft 流程创建草稿、上传内容并提交。</li></ul>', 'use-cases')}
    ${section('示例：读取资源列表', `<p>适合启动器首页、资源浏览页和搜索结果页。列表中的稳定 <code>public_id</code> 可以继续用于详情、Manifest 和下载流程。</p>${codeTabs(makeCodeSamples('GET', '/v1/resources?limit=20', {}))}`, 'example')}
    ${section('稳定身份', '<p><code>public_id</code> 是资源、版本与文件的外部稳定身份。数字数据库 ID 属于实现细节，不应由第三方客户端持久化。</p>', 'identity')}
    ${section('公开读取', table(['方法', '路径', '说明'], [
      ['GET', inlineCode('/api/v1/resources'), '公开资源列表'],
      ['GET', inlineCode('/api/v1/resources/{id}'), '资源详情'],
      ['GET', inlineCode('/api/v1/resources/{id}/manifest'), '安装 / 同步 Manifest'],
      ['GET', inlineCode('/api/v1/resources/{id}/preview'), '资源预览'],
      ['GET', inlineCode('/api/v1/resources/{resourceId}/versions/{versionId}/files/{fileId}/download'), '版本文件下载'],
    ]), 'endpoints')}
    ${section('Manifest', `${codeBlock(`{
  "resource_public_id": "resource-uuid",
  "resource_kind": "mod",
  "versions": [{
    "public_id": "version-uuid",
    "version": "1.2.0",
    "files": [{
      "public_id": "file-uuid",
      "hash_algorithm": "sha256",
      "content_hash": "...",
      "downloadable": true,
      "installable": true
    }]
  }]
}`, 'json')}<p>Manifest 是安装与同步边界，只暴露稳定 public id、兼容性、依赖、Hash 和可安装状态。</p>`, 'manifest')}
    ${section('客户端安全', '<ul><li>安装前检查文件 Hash 和 availability / installable。</li><li>缺失 metadata 表示未知，不要推断为兼容。</li><li>失败的 Preview 不应让已批准的原始文件变成不可用。</li></ul>', 'safety')}
  `;


  return {
    'quick-start': { title: '快速开始', description: 'MDTBBS API 快速开始', body: quickStart },
    conventions: { title: '通用约定', description: 'MDTBBS API 响应、兼容与限流约定', body: conventions },
    oauth: { title: '第三方客户端授权', description: 'MindAuth Public Client OAuth、PKCE 与 scopes', body: oauth },
    authentication: { title: '身份认证', description: 'MDTBBS API 认证方式', body: authentication },
    'first-party': { title: '论坛 API', description: 'MDTBBS 论坛 API V1', body: firstParty },
    'game-content': { title: '游戏内容 API', description: 'MDTBBS 游戏内容 API', body: gameContent },
    resources: { title: '资源中心 API', description: 'MDTBBS 资源中心 API', body: resources },
  };
}

function hasSecurity(operation: any): boolean {
  return Array.isArray(operation?.security)
    && operation.security.some((requirement: any) => requirement && Object.keys(requirement).length > 0);
}

function hasOptionalSecurity(operation: any): boolean {
  return Array.isArray(operation?.security) && operation.security.some((requirement: any) => !requirement || Object.keys(requirement).length === 0);
}

function parametersFor(pathItem: any, operation: any): any[] {
  const merged = new Map<string, any>();
  for (const parameter of [...(pathItem?.parameters || []), ...(operation?.parameters || [])]) {
    const location = String(parameter?.in || '').toLowerCase();
    const name = String(parameter?.name || '');
    const key = location + ':' + (location === 'header' ? name.toLowerCase() : name);
    const previous = merged.get(key);
    merged.set(key, previous ? {
      ...previous,
      ...parameter,
      required: Boolean(previous.required || parameter.required),
      description: parameter.description || previous.description,
    } : parameter);
  }
  return [...merged.values()];
}

function openApiExample(document: OpenAPIObject, schema: any, name = '', depth = 0, seen = new Set<string>()): any {
  if (!schema || depth > 6) return '<value>';
  const ref = typeof schema.$ref === 'string' ? schema.$ref : '';
  if (ref && seen.has(ref)) return '<recursive object>';
  const nextSeen = new Set(seen);
  if (ref) nextSeen.add(ref);

  const resolved = flattenObjectSchema(document, schema) || {};
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.default !== undefined) return resolved.default;
  if (Array.isArray(resolved.enum) && resolved.enum.length) return resolved.enum[0];

  const key = String(name).toLowerCase();
  if (resolved.type === 'array') return [openApiExample(document, resolved.items, name + 'Item', depth + 1, nextSeen)];
  if (resolved.type === 'object' || resolved.properties) {
    const properties = Object.entries(resolved.properties || {}) as Array<[string, any]>;
    const required = new Set<string>(resolved.required || []);
    const selected = properties.filter(([propertyName, property]) =>
      required.has(propertyName) || property.example !== undefined || property.default !== undefined || Array.isArray(property.enum),
    );
    const chosen = selected.length ? selected : properties.slice(0, 2);
    return Object.fromEntries(chosen.map(([propertyName, property]) => [
      propertyName,
      openApiExample(document, property, propertyName, depth + 1, nextSeen),
    ]));
  }
  if (resolved.type === 'boolean') return true;
  if (resolved.type === 'integer' || resolved.type === 'number') {
    if (key === 'limit') return 20;
    if (key === 'offset') return 0;
    if (key === 'page') return 1;
    if (key.endsWith('_id') || key === 'id') return 1;
    return resolved.minimum ?? 1;
  }
  if (resolved.type === 'string') {
    if (resolved.format === 'binary') return '<file>';
    if (resolved.format === 'uri' || key.endsWith('_url')) return 'https://example.invalid/file';
    if (resolved.format === 'date-time') return '2026-01-01T00:00:00.000Z';
    if (resolved.format === 'uuid') return '00000000-0000-4000-8000-000000000001';
    if (key === 'title') return '示例标题';
    if (key === 'name') return '示例名称';
    if (key.includes('content') || key === 'text' || key === 'body') return '这里填写正文内容';
    if (key === 'cursor') return 'CURSOR_FROM_PREVIOUS_PAGE';
    if (key.includes('token')) return '<TOKEN>';
    if (key.includes('code')) return '<CODE>';
    return '<string>';
  }
  return '<value>';
}

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function samplePathParameterValue(document: OpenAPIObject, path: string, parameter: any): string {
  const schema = parameter?.schema || {};
  const value = parameter.example ?? schema.example ?? schema.default;
  if (value !== undefined) return String(value);
  if (schema.type === 'number' || schema.type === 'integer') return '1';
  const name = String(parameter?.name || '');
  if (/slotId|snapshotId|uploadId/i.test(name) || schema.format === 'uuid') return '00000000-0000-4000-8000-000000000001';
  if (/resource|version|file/i.test(name) || path.includes('/resources/')) return 'res_example_public_id';
  if (/peer|candidate/i.test(name)) return 'peer_example_id';
  if (/session|multiplayer/i.test(path)) return 'session_example_id';
  const generated = openApiExample(document, schema, name);
  return typeof generated === 'string' && generated !== '<string>' ? generated : 'example_id';
}

function makeCodeSamples(method: string, path: string, operation: any): Record<CodeLanguage, string> {
  const upper = method.toUpperCase();
  const url = `${PUBLIC_API_ORIGIN}${path}`;
  const auth = hasSecurity(operation);
  const hasBody = Boolean(operation?.requestBody) && !['GET', 'HEAD'].includes(upper);
  const headers = [
    ...(auth ? ['Authorization: Bearer <TOKEN>'] : []),
    ...(hasBody ? ['Content-Type: application/json'] : []),
  ];

  const curlHeaders = headers.map((header) => ` \\\n  -H "${header}"`).join('');
  const curlBody = hasBody ? ` \\\n  -d '{}'` : '';
  const curl = `curl -X ${upper} "${url}"${curlHeaders}${curlBody}`;

  const jsHeaders = headers.length
    ? `\n  headers: ${JSON.stringify(Object.fromEntries(headers.map((header) => {
        const index = header.indexOf(':');
        return [header.slice(0, index), header.slice(index + 1).trim()];
      })), null, 2).replaceAll('\n', '\n  ')},`
    : '';
  const jsBody = hasBody ? `\n  body: JSON.stringify({}),` : '';
  const javascript = `const response = await fetch("${url}", {\n  method: "${upper}",${jsHeaders}${jsBody}\n});\n\nconst data = await response.json();\nconsole.log(data);`;
  const typescript = `const response: Response = await fetch("${url}", {\n  method: "${upper}",${jsHeaders}${jsBody}\n});\n\nif (!response.ok) throw new Error(\`HTTP \${response.status}\`);\nconst data: unknown = await response.json();\nconsole.log(data);`;

  const javaHeaderLines = headers.map((header) => {
    const index = header.indexOf(':');
    return `    .header("${header.slice(0, index)}", "${header.slice(index + 1).trim()}")`;
  }).join('\n');
  const javaPublisher = hasBody
    ? 'HttpRequest.BodyPublishers.ofString("{}")'
    : 'HttpRequest.BodyPublishers.noBody()';
  const java = `import java.net.URI;\nimport java.net.http.*;\n\nHttpClient client = HttpClient.newHttpClient();\nHttpRequest request = HttpRequest.newBuilder()\n    .uri(URI.create("${url}"))\n${javaHeaderLines ? javaHeaderLines + '\n' : ''}    .method("${upper}", ${javaPublisher})\n    .build();\n\nHttpResponse<String> response = client.send(\n    request, HttpResponse.BodyHandlers.ofString());\nSystem.out.println(response.body());`;

  const kotlinHeaders = headers.map((header) => {
    const index = header.indexOf(':');
    return `conn.setRequestProperty("${header.slice(0, index)}", "${header.slice(index + 1).trim()}")`;
  }).join('\n');
  const kotlinBody = hasBody
    ? `\nconn.doOutput = true\nconn.outputStream.use { it.write("{}".toByteArray()) }`
    : '';
  const kotlin = `import java.net.URL\n\nval conn = URL("${url}").openConnection() as java.net.HttpURLConnection\nconn.requestMethod = "${upper}"\n${kotlinHeaders}${kotlinBody}\n\nval text = conn.inputStream.bufferedReader().use { it.readText() }\nprintln(text)`;

  return { curl, javascript, typescript, java, kotlin };
}

function makeContractSamples(
  document: OpenAPIObject,
  method: string,
  path: string,
  pathItem: any,
  operation: any,
): Record<CodeLanguage, string> {
  const upper = method.toUpperCase();
  const parameters = parametersFor(pathItem, operation);
  const pathValues = new Map(parameters.filter((item) => item.in === 'path').map((item) => [
    item.name,
    samplePathParameterValue(document, path, item),
  ]));
  const route = path.replace(/\{([^}]+)\}/g, (_match, name) => encodeURIComponent(pathValues.get(name) || '1'));
  const queryParameters = parameters.filter((item) => item.in === 'query');
  // The thread endpoint has two distinct list modes. Keep its generated request
  // example on the stable offset path; q and cursor are shown in the parameter
  // table and have separate examples in the first-party guide.
  const sampleQueryParameters = path === '/v1/threads'
    ? queryParameters.filter((item) => ['limit', 'offset', 'category_id'].includes(item.name))
    : queryParameters;
  const query = sampleQueryParameters.map((item) => {
    const value = item.example ?? item.schema?.example ?? item.schema?.default ?? openApiExample(document, item.schema, item.name);
    return encodeURIComponent(item.name) + '=' + encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  const url = PUBLIC_API_ORIGIN + route + (query.length ? '?' + query.join('&') : '');
  const auth = hasSecurity(operation);
  const hasBody = Boolean(operation?.requestBody) && upper !== 'GET' && upper !== 'HEAD';
  const content = operation?.requestBody?.content || {};
  const contentType = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded'].find((type) => content[type]) || Object.keys(content)[0];
  const schema = contentType ? content[contentType]?.schema : undefined;
  const body = hasBody ? openApiExample(document, schema) : undefined;
  const multipart = hasBody && contentType === 'multipart/form-data';
  const properties = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const binaryFields = new Set(Object.entries((schema?.properties || {}) as Record<string, any>)
    .filter(([, property]) => property?.format === 'binary').map(([name]) => name));
  const headers = [
    ...(auth ? ['Authorization: Bearer <TOKEN>'] : []),
    ...parameters.filter((item) => item.in === 'header').map((item) => item.name + ': ' + String(item.example ?? item.schema?.example ?? '<value>')),
    ...(hasBody && contentType && !multipart ? ['Content-Type: ' + contentType] : []),
  ];
  const curlHeaders = headers.map((header) => ' \\\n  -H "' + header + '"').join('');
  const curlBody = !hasBody ? '' : multipart
    ? Object.entries(properties).map(([name, value]) => binaryFields.has(name)
      ? ' \\\n  -F ' + shellQuote(name + '=@/path/to/file')
      : ' \\\n  -F ' + shellQuote(name + '=' + (typeof value === 'object' ? JSON.stringify(value) : String(value)))).join('')
    : ' \\\n  -d ' + shellQuote(JSON.stringify(body));
  const curl = 'curl -X ' + upper + ' "' + url + '"' + curlHeaders + curlBody;

  const fetchHeaders = headers.filter((header) => !header.toLowerCase().startsWith('content-type:'));
  const jsHeaders = fetchHeaders.length
    ? '\n  headers: ' + JSON.stringify(Object.fromEntries(fetchHeaders.map((header) => {
        const index = header.indexOf(':');
        return [header.slice(0, index), header.slice(index + 1).trim()];
      })), null, 2).replaceAll('\n', '\n  ') + ','
    : '';
  const formLines = multipart ? 'const fileInput = document.querySelector(\'input[type="file"]\'); // 选择文件输入框\n' + Object.entries(properties).map(([name, value]) => binaryFields.has(name)
    ? 'body.append(' + JSON.stringify(name) + ', fileInput.files[0]);'
    : 'body.append(' + JSON.stringify(name) + ', ' + JSON.stringify(typeof value === 'object' ? JSON.stringify(value) : String(value)) + ');').join('\n') : '';
  const bodyLine = !hasBody ? '' : multipart
    ? '\n  body,'
    : '\n  body: JSON.stringify(' + JSON.stringify(body, null, 2).replaceAll('\n', '\n  ') + '),';
  const prefix = multipart ? 'const body = new FormData();\n' + formLines + '\n' : '';
  const typedPrefix = prefix.replaceAll('fileInput.files[0]', '(fileInput as HTMLInputElement).files![0]');
  const jsRequest = 'const response = await fetch("' + url + '", {\n  method: "' + upper + '",' + jsHeaders + bodyLine + '\n});';
  const javascript = prefix + jsRequest + '\n\nconst data = await response.json();\nconsole.log(data);';
  const typescript = typedPrefix + 'const response: Response = await fetch("' + url + '", {\n  method: "' + upper + '",' + jsHeaders + bodyLine
    + '\n});\n\nif (!response.ok) throw new Error("HTTP " + response.status);\nconst data: unknown = await response.json();\nconsole.log(data);';
  const multipartNote = '// multipart/form-data endpoint. Use a multipart request builder; the curl and JavaScript examples list the exact fields.';
  const javaHeaders = headers.map((header) => {
    const index = header.indexOf(':');
    return '    .header(' + JSON.stringify(header.slice(0, index)) + ', ' + JSON.stringify(header.slice(index + 1).trim()) + ')';
  }).join('\n');
  const javaPublisher = hasBody && !multipart
    ? 'HttpRequest.BodyPublishers.ofString(' + JSON.stringify(JSON.stringify(body)) + ')'
    : 'HttpRequest.BodyPublishers.noBody()';
  const java = multipart ? multipartNote
    : 'import java.net.URI;\nimport java.net.http.*;\n\nHttpClient client = HttpClient.newHttpClient();\nHttpRequest request = HttpRequest.newBuilder()\n    .uri(URI.create(' + JSON.stringify(url) + '))\n'
      + (javaHeaders ? javaHeaders + '\n' : '')
      + '    .method(' + JSON.stringify(upper) + ', ' + javaPublisher + ')\n    .build();\n\n'
      + 'HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());\nSystem.out.println(response.body());';
  const kotlinHeaders = headers.map((header) => {
    const index = header.indexOf(':');
    return 'conn.setRequestProperty(' + JSON.stringify(header.slice(0, index)) + ', ' + JSON.stringify(header.slice(index + 1).trim()) + ')';
  }).join('\n');
  const kotlinBody = hasBody && !multipart
    ? '\nconn.doOutput = true\nconn.outputStream.use { it.write(' + JSON.stringify(JSON.stringify(body)) + '.toByteArray()) }'
    : '';
  const kotlin = multipart ? multipartNote
    : 'import java.net.URL\n\nval conn = URL(' + JSON.stringify(url) + ').openConnection() as java.net.HttpURLConnection\n'
      + 'conn.requestMethod = ' + JSON.stringify(upper) + '\n'
      + kotlinHeaders + kotlinBody + '\n\n'
      + 'val text = conn.inputStream.bufferedReader().use { it.readText() }\nprintln(text)';
  return { curl, javascript, typescript, java, kotlin };
}

function codeTabs(samples: Record<CodeLanguage, string>): string {
  const labels: Array<[CodeLanguage, string]> = [
    ['curl', 'curl'],
    ['javascript', 'JavaScript'],
    ['typescript', 'TypeScript'],
    ['java', 'Java'],
    ['kotlin', 'Kotlin'],
  ];
  return `<div class="code-example"><div class="code-tabs" role="tablist">${labels.map(([key, label], index) => `<button type="button" data-code-tab="${key}" aria-selected="${index === 0 ? 'true' : 'false'}">${label}</button>`).join('')}</div>${labels.map(([key], index) => `<pre data-code-lang="${key}" data-active="${index === 0 ? 'true' : 'false'}"><code>${escapeHtml(samples[key])}</code></pre>`).join('')}</div>`;
}

function renderParameters(operation: any): string {
  const params = Array.isArray(operation?.parameters) ? operation.parameters : [];
  if (!params.length) return '';
  const rows = params.map((parameter: any) => [
    inlineCode(parameter.name || ''),
    escapeHtml(parameter.in || ''),
    parameter.required ? '是' : '否',
    escapeHtml(parameter.description || ''),
  ]);
  return `<h3>参数</h3>${table(['名称', '位置', '必填', '说明'], rows)}`;
}

function inferredParameterDescription(parameter: any, path: string): string {
  if (parameter.description) return String(parameter.description);
  const name = String(parameter.name || '');
  if (parameter.in === 'header' && name.toLowerCase() === 'idempotency-key') return '为可安全重试的写请求提供幂等键。';
  if (parameter.in === 'query') {
    const descriptions: Record<string, string> = {
      limit: '每页或本次请求最多返回的条目数；默认值和最大值见该接口实现。',
      offset: '从列表开头跳过的条目数，用于 offset 分页。',
      page: '页码，从 1 开始。',
      cursor: '不透明分页游标；使用上一页返回的游标继续读取。',
      q: '搜索关键词。',
      query: '搜索关键词。',
      search: '搜索关键词。',
      category_id: '按论坛分类 ID 筛选。',
      sort: '结果排序方式；可选值见参数表约束。',
      type: '按资源或内容类型筛选；可选值见参数表约束。',
    };
    if (descriptions[name]) return descriptions[name];
  }
  if (parameter.in === 'path') {
    if (/slotId/i.test(name)) return '云存档 Slot 标识。';
    if (/snapshotId/i.test(name)) return '云存档快照标识。';
    if (/uploadId/i.test(name)) return '上传会话标识。';
    if (/versionId/i.test(name)) return '资源版本标识。';
    if (/fileId/i.test(name)) return '资源文件标识。';
    if (/peerId/i.test(name)) return '会话 Peer 标识。';
    if (/candidateId/i.test(name)) return '网络候选地址标识。';
    if (/userId/i.test(name)) return '论坛用户 ID。';
    if (/thread|post/i.test(path)) return '讨论或帖子 ID。';
    if (/resource/i.test(path)) return '资源公开标识。';
    if (/session|multiplayer/i.test(path)) return '多人会话标识。';
    if (/notification/i.test(path)) return '通知 ID。';
    if (name === 'id') return '此路径所指资源的 ID。';
  }
  return '';
}

function renderContractParameters(document: OpenAPIObject, path: string, pathItem: any, operation: any): string {
  const params = parametersFor(pathItem, operation);
  if (!params.length) return '';
  const rows = params.map((parameter: any) => {
    const schema = parameter.schema || {};
    const value = parameter.example ?? schema.example ?? schema.default ?? openApiExample(document, schema, parameter.name);
    return [
      inlineCode(parameter.name || ''),
      escapeHtml(parameter.in || ''),
      inlineCode(schemaType(document, schema)),
      parameter.required ? '是' : '否',
      inlineCode(typeof value === 'object' ? JSON.stringify(value) : String(value)),
      escapeHtml(schemaNotes(document, schema)),
      escapeHtml(inferredParameterDescription(parameter, path)),
    ];
  });
  return '<h3>路径、查询与 Header 参数</h3>' + table(
    ['名称', '位置', '类型', '必填', '示例', '可选值 / 限制', '说明'],
    rows,
  );
}

function resolveSchema(document: OpenAPIObject, schema: any): any {
  if (!schema?.$ref || typeof schema.$ref !== 'string') return schema;
  const prefix = '#/components/schemas/';
  if (!schema.$ref.startsWith(prefix)) return schema;
  const name = schema.$ref.slice(prefix.length);
  return (document.components?.schemas as Record<string, any> | undefined)?.[name] || schema;
}

function flattenObjectSchema(document: OpenAPIObject, schema: any): any {
  const resolved = resolveSchema(document, schema);
  if (!resolved?.allOf) return resolved;
  const parts = resolved.allOf.map((part: any) => flattenObjectSchema(document, part)).filter(Boolean);
  return {
    ...resolved,
    type: 'object',
    properties: Object.assign({}, ...parts.map((part: any) => part.properties || {}), resolved.properties || {}),
    required: [...new Set(parts.flatMap((part: any) => part.required || []).concat(resolved.required || []))],
  };
}

function schemaType(document: OpenAPIObject, schema: any): string {
  if (!schema) return 'unknown';
  if (schema.$ref) return schema.$ref.split('/').pop() || 'object';
  const resolved = resolveSchema(document, schema);
  if (resolved?.type === 'array') return `${schemaType(document, resolved.items)}[]`;
  const type = resolved?.type || (resolved?.properties ? 'object' : 'unknown');
  return resolved?.format ? `${type} (${resolved.format})` : type;
}

function schemaNotes(document: OpenAPIObject, schema: any): string {
  const resolved = flattenObjectSchema(document, schema) || {};
  const notes: string[] = [];
  if (Array.isArray(resolved.enum)) notes.push(`可选：${resolved.enum.map((item: unknown) => String(item)).join(' / ')}`);
  if (resolved.minLength != null) notes.push(`最短 ${resolved.minLength}`);
  if (resolved.maxLength != null) notes.push(`最长 ${resolved.maxLength}`);
  if (resolved.minimum != null) notes.push(`最小 ${resolved.minimum}`);
  if (resolved.maximum != null) notes.push(`最大 ${resolved.maximum}`);
  if (resolved.default != null) notes.push(`默认 ${String(resolved.default)}`);
  if (resolved.pattern) notes.push(`格式 ${String(resolved.pattern)}`);
  if (resolved.nullable) notes.push('允许 null');
  const descriptions = [schema?.description, resolved.description].filter((item: unknown, index: number, list: unknown[]) => item && list.indexOf(item) === index);
  if (descriptions.length) notes.push(descriptions.join('；'));
  return notes.join('；');
}

function schemaFieldRows(document: OpenAPIObject, schema: any, prefix = '', depth = 0): string[][] {
  if (!schema || depth > 6) return [];
  const resolved = flattenObjectSchema(document, schema) || {};
  if (resolved.type === 'array' && resolved.items) {
    return schemaFieldRows(document, resolved.items, (prefix || '[]') + (prefix ? '[]' : ''), depth + 1);
  }
  const properties = Object.entries(resolved.properties || {}) as Array<[string, any]>;
  const required = new Set<string>(resolved.required || []);
  const rows: string[][] = [];
  for (const [name, property] of properties) {
    const fieldPath = prefix ? prefix + '.' + name : name;
    const value = property.example ?? property.default ?? (Array.isArray(property.enum) ? property.enum[0] : undefined);
    const sample = value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    rows.push([
      inlineCode(fieldPath),
      inlineCode(schemaType(document, property)),
      required.has(name) ? '是' : '否',
      escapeHtml(sample),
      escapeHtml(schemaNotes(document, property)),
    ]);
    const nested = flattenObjectSchema(document, property);
    if (nested?.properties) rows.push(...schemaFieldRows(document, property, fieldPath, depth + 1));
    else if (nested?.type === 'array' && nested.items && flattenObjectSchema(document, nested.items)?.properties) {
      rows.push(...schemaFieldRows(document, nested.items, fieldPath + '[]', depth + 1));
    }
  }
  return rows;
}

function schemaFieldTable(document: OpenAPIObject, schema: any, prefix = ''): string {
  const rows = schemaFieldRows(document, schema, prefix);
  return rows.length ? table(['字段路径', '类型', '必填', '示例', '可选值 / 限制 / 说明'], rows) : '';
}

function renderRequestBody(document: OpenAPIObject, operation: any): string {
  const requestBody = operation?.requestBody;
  if (!requestBody) return '';

  const content = requestBody.content || {};
  const contentType = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded']
    .find((type) => content[type]) || Object.keys(content)[0];
  if (!contentType) return '<h3>请求体</h3><p>该接口需要请求体，具体格式见 OpenAPI JSON。</p>';

  const rawSchema = content[contentType]?.schema;
  const schema = flattenObjectSchema(document, rawSchema);
  if (!schema) return `<h3>请求体</h3><p>Content-Type：${inlineCode(contentType)}</p>`;

  const rows = schemaFieldRows(document, rawSchema);
  const sample = openApiExample(document, rawSchema);
  const tableHtml = rows.length
    ? table(['字段路径', '类型', '必填', '示例', '可选值 / 限制 / 说明'], rows)
    : `<p>类型：${inlineCode(schemaType(document, rawSchema))}</p>`;
  const sampleHtml = `<p>请求模板（尖括号占位符需替换成实际值）：</p>${codeBlock(JSON.stringify(sample, null, 2), 'json')}`;
  const bodyDescription = operation.requestBody.description
    ? `<p>${escapeHtml(operation.requestBody.description)}</p>`
    : '';
  return `<h3>请求体</h3><p>Content-Type：${inlineCode(contentType)}${operation.requestBody.required ? '；请求体必填' : '；请求体可省略'}</p>${bodyDescription}${tableHtml}${sampleHtml}`;
}

function renderResponses(document: OpenAPIObject, path: string, method: string, operation: any): string {
  const responses = operation?.responses || {};
  const rows = Object.entries(responses).map(([status, response]: [string, any]) => [
    inlineCode(status),
    escapeHtml(response?.description || ''),
  ]);
  const success = Object.entries(responses).filter(([status, response]: [string, any]) => status.startsWith('2') && response?.content);
  const bodyHtml = success.map(([status, response]: [string, any]) => {
    const content = response.content || {};
    const contentType = Object.keys(content)[0];
    const schema = contentType ? content[contentType]?.schema : undefined;
    if (!schema) return '';
    const isJson = !contentType || contentType.includes('json') || contentType.endsWith('+json');
    const variants = Array.isArray(schema.oneOf) ? schema.oneOf : [schema];
    return variants.map((variant: any, index: number) => {
      const resolved = flattenObjectSchema(document, variant) || {};
      const isThreadListPage = method === 'get'
        && (path === '/v1/threads' || path === '/v1/threads/{id}/replies')
        && resolved.type === 'array';
      const declaredPagination = flattenObjectSchema(document, resolved.properties?.pagination);
      const hasMetaPagination = Boolean(declaredPagination?.properties?.page && declaredPagination?.properties?.limit && declaredPagination?.properties?.total);
      const searchPostsPage = method === 'get' && path === '/v1/search/posts';
      const dataExample = openApiExample(document, variant);
      const meta: Record<string, unknown> = { request_id: 'req_example' };
      if (isThreadListPage || hasMetaPagination || searchPostsPage) {
        meta.pagination = { page: 1, limit: 20, total: 42, total_pages: 3, has_more: true };
      }
      const sample = isJson ? { data: dataExample, meta } : dataExample;
      const variantLabel = variants.length > 1
        ? index === 0 ? 'offset / 搜索分页' : 'cursor 分页'
        : '';
      const prefix = isJson ? 'data' : '';
      const responseNote = isJson ? '' : '<p class="schema-gap">该接口返回原始内容，不使用 V1 JSON Envelope。</p>';
      return `<h4>HTTP ${escapeHtml(status)}${variantLabel ? ' · ' + escapeHtml(variantLabel) : ''} · ${inlineCode(contentType || 'application/json')}</h4>${responseNote}${schemaFieldTable(document, variant, prefix)}${codeBlock(JSON.stringify(sample, null, 2), isJson ? 'json' : 'text')}`;
    }).join('');
  }).join('');
  const hasSuccess = Object.keys(responses).some((status) => status.startsWith('2'));
  const hasSchema = success.some(([, response]: [string, any]) => Object.values(response.content || {}).some((item: any) => item?.schema));
  const missing = hasSuccess && !hasSchema
    ? '<p class="schema-gap">当前 OpenAPI 尚未声明成功响应的字段 Schema，因此这里只能提供状态说明。响应字段仍需按接口说明处理。</p>'
    : '';
  return (rows.length ? `<h3>HTTP 状态</h3>${table(['状态', '说明'], rows)}` : '')
    + (bodyHtml ? `<h3>成功响应字段</h3>${bodyHtml}` : '') + missing;
}

function schemaSearchText(document: OpenAPIObject, schema: any, depth = 0): string[] {
  if (!schema || depth > 5) return [];
  if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) {
    return [...(schema.oneOf || schema.anyOf)].flatMap((variant: any) => schemaSearchText(document, variant, depth + 1));
  }
  const resolved = flattenObjectSchema(document, schema) || {};
  const values = [resolved.description, ...(resolved.enum || []).map((item: unknown) => String(item))].filter(Boolean);
  for (const [name, property] of Object.entries(resolved.properties || {})) {
    values.push(name, ...schemaSearchText(document, property, depth + 1));
  }
  if (resolved.type === 'array' && resolved.items) values.push(...schemaSearchText(document, resolved.items, depth + 1));
  return values.map(String);
}

function operationSearchText(document: OpenAPIObject, method: string, path: string, pathItem: any, operation: any): string {
  const parameters = parametersFor(pathItem, operation).flatMap((parameter) => [
    parameter.name, parameter.description, ...(parameter.schema?.enum || []).map((item: unknown) => String(item)),
  ]);
  const bodies = Object.values(operation?.requestBody?.content || {}).flatMap((media: any) => schemaSearchText(document, media?.schema));
  const responses = Object.values(operation?.responses || {}).flatMap((response: any) =>
    Object.values(response?.content || {}).flatMap((media: any) => schemaSearchText(document, media?.schema)));
  return [method, path, operation?.summary, operation?.description, ...(operation?.tags || []), ...parameters, ...bodies, ...responses]
    .filter(Boolean).join(' ').toLowerCase();
}

function referenceOAuthScope(method: string, path: string): string | null {
  const upper = method.toUpperCase();
  if (path.startsWith('/v1/messages')) return upper === 'POST' ? 'message.write' : 'message.read';
  if (path.startsWith('/v1/notifications')) return 'notification.read';
  if (path.startsWith('/v1/resources/drafts')) return 'resource.upload';
  if (path.startsWith('/v1/resources')) {
    if (path.includes('/download')) return 'resource.download';
    return upper === 'GET' ? 'resource.read' : 'resource.upload';
  }
  if (path.startsWith('/v1/threads')) return upper === 'GET' ? 'forum.read' : 'forum.write';
  if (path.startsWith('/v1/search')) return 'forum.read';
  if (path === '/v1/me' && upper === 'GET') return 'profile';
  if (path.startsWith('/v1/me/') && upper !== 'GET') return 'forum.write';
  if (path.startsWith('/v1/uploads/')) return 'forum.write';
  return null;
}

function endpointUseCase(method: string, path: string, operation: any): string {
  const upper = method.toUpperCase();
  const summary = String(operation?.summary || operation?.description || '').toLowerCase();

  if (path === '/v1/capabilities') return '客户端启动时先读这个接口，根据服务端能力决定哪些功能应该显示或关闭。';
  if (path.includes('/game-content/blueprints') && upper === 'GET') return '用于游戏内蓝图库、启动器蓝图浏览、蓝图详情或复制流程。';
  if (path.includes('/game-content/maps') && upper === 'GET') return '用于地图浏览器、地图选择器、启动器内容页以及地图下载前的详情读取。';
  if (path === '/v1/game-content/search') return '用于把地图和蓝图放进同一个搜索框，适合游戏内或第三方客户端的统一搜索。';
  if (path.startsWith('/v1/game-content') && ['POST', 'PUT', 'PATCH'].includes(upper)) return '用于登录后的地图或蓝图投稿、更新以及相关写操作。';
  if (path.endsWith('/manifest')) return '用于启动器或资源管理器判断版本、依赖、文件 Hash 和可安装状态。';
  if (path.includes('/resources/drafts')) return upper === 'GET' ? '用于投稿客户端恢复和查看尚未提交的资源草稿。' : '用于第三方投稿工具创建、编辑或提交资源草稿。';
  if (path.startsWith('/v1/resources') && upper === 'GET') return '用于资源中心、启动器和第三方资源浏览器展示资源、版本、预览与文件信息。';
  if (path.startsWith('/v1/resources') && upper !== 'GET') return '用于登录后的资源投稿、更新或其他资源写操作。';
  if (path.startsWith('/v1/search')) return '用于论坛或第三方客户端里的站内搜索，可以做全局搜索框和搜索结果页。';
  if (path.startsWith('/v1/notifications')) return '用于客户端通知中心、未读角标以及已读状态同步。';
  if (path.startsWith('/v1/uploads/images')) return '用于编辑器、发帖或资源投稿时上传图片。';
  if (path.startsWith('/v1/categories')) return '用于构建论坛分类导航、筛选器或发帖时的分类选择。';
  if (path.includes('/me')) return '用于登录后读取当前账号信息、权限或与当前用户有关的状态。';
  if (summary.includes('download') || path.includes('/download')) return '用于客户端在用户触发下载后获取资源文件或下载地址。';
  if (upper === 'GET') return '用于读取该模块的数据，可作为列表、详情页或客户端状态展示的数据源。';
  if (upper === 'POST') return '用于创建或触发该操作，通常放在用户明确提交、发布或执行动作之后。';
  if (upper === 'PATCH' || upper === 'PUT') return '用于更新已有数据或状态，客户端应只在用户有对应权限时展示操作入口。';
  if (upper === 'DELETE') return '用于删除或撤销已有内容，建议在客户端执行前做明确确认。';
  return '用于对应模块的客户端集成。';
}

function referenceTagAnchor(tag: string): string {
  const slug = tag.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'domain';
  let hash = 0;
  for (const char of tag) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 'api-tag-' + slug + '-' + hash.toString(36);
}

function referenceTagLabel(tag: string): string {
  return API_TAG_LABELS[tag] || tag;
}

function rateLimitLabel(value: any): string {
  if (!value || !Number.isFinite(value.limit) || !Number.isFinite(value.window_seconds)) return '限流未声明';
  const seconds = Number(value.window_seconds);
  const window = seconds % 3600 === 0 ? `${seconds / 3600}h` : seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
  return `${value.limit} 次 / ${window}`;
}

function paginationLabel(document: OpenAPIObject, path: string, pathItem: any, operation: any): string {
  const names = new Set(parametersFor(pathItem, operation)
    .filter((parameter) => parameter.in === 'query')
    .map((parameter) => String(parameter.name).toLowerCase()));
  if ([...names].some((name) => ['cursor', 'next_cursor', 'after'].includes(name))) return '游标分页；以该接口的 cursor / next_cursor 参数或响应字段为准。';
  if (names.has('page') || names.has('page_size')) return '页码分页；使用 page / page_size，响应元数据字段以契约为准。';
  if (names.has('offset') || names.has('limit')) return '偏移分页；使用 offset / limit，响应元数据字段以契约为准。';
  if (path.includes('/feed') || path.includes('/notifications')) return '连续更新列表；请按此接口声明的游标字段翻页。';
  return '本接口没有声明列表分页参数。';
}

function runOnlineDebugger(): void {
  const root = document.querySelector('[data-public-debugger]') as HTMLElement | null;
  if (!root) return;

  const specUrl = '/api/openapi/v1.json';
  const tokenStorageKey = 'mdtbbs.public-api-debugger.access-token';
  const pendingStorageKey = 'mdtbbs.public-api-debugger.pkce';
  const issuer = 'https://auth.mdtbbs.cn';
  const methodSelect = document.querySelector('[data-debug-operation]') as HTMLSelectElement;
  const selectedPath = root.getAttribute('data-selected-path') || '';
  const selectedMethod = (root.getAttribute('data-selected-method') || '').toLowerCase();
  const clientIdInput = document.querySelector('[data-debug-client-id]') as HTMLInputElement;
  const scopeConsent = document.querySelector('[data-debug-scope-consent]') as HTMLInputElement;
  const scopeLabel = document.querySelector('[data-debug-scopes]') as HTMLElement;
  const authStatus = document.querySelector('[data-debug-auth-status]') as HTMLElement;
  const connectButton = document.querySelector('[data-debug-connect]') as HTMLButtonElement;
  const clearTokenButton = document.querySelector('[data-debug-clear-token]') as HTMLButtonElement;
  const fieldsRoot = document.querySelector('[data-debug-fields]') as HTMLElement;
  const bodyRoot = document.querySelector('[data-debug-body]') as HTMLElement;
  const requestButton = document.querySelector('[data-debug-run]') as HTMLButtonElement;
  const writeConsent = document.querySelector('[data-debug-write-consent]') as HTMLInputElement;
  const requestOutput = document.querySelector('[data-debug-request]') as HTMLElement;
  const responseOutput = document.querySelector('[data-debug-response]') as HTMLElement;
  const requestIdOutput = document.querySelector('[data-debug-request-id]') as HTMLElement;
  const rateOutput = document.querySelector('[data-debug-rate]') as HTMLElement;
  const statusOutput = document.querySelector('[data-debug-status]') as HTMLElement;
  let openApi: any = null;

  function showStatus(target: HTMLElement, message: string, isError = false): void {
    target.textContent = message;
    target.classList.toggle('debug-error', isError);
  }

  function readToken(): any {
    try {
      const value = sessionStorage.getItem(tokenStorageKey);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function updateTokenStatus(): void {
    const token = readToken();
    if (!token?.access_token) {
      showStatus(authStatus, '未连接。可以匿名调用不要求 OAuth 的公开接口。');
      clearTokenButton.hidden = true;
      return;
    }
    if (clientIdInput && !clientIdInput.value) clientIdInput.value = token.client_id || '';
    const expires = Number(token.expires_at || 0);
    const expiryText = expires
      ? expires <= Date.now() ? '，已过期' : `，约 ${Math.ceil((expires - Date.now()) / 60000)} 分钟后过期`
      : '';
    showStatus(authStatus, `已连接 Client ${token.client_id || '(unknown)'}${expiryText}。Token 仅保存在当前浏览器标签页会话中，不会显示或发送给文档服务器。`);
    clearTokenButton.hidden = false;
  }

  function resolveRef(schema: any, depth = 0): any {
    if (!schema || depth > 8) return schema || {};
    if (schema.$ref && openApi) {
      const parts = String(schema.$ref).replace(/^#\//, '').split('/').map((part: string) => part.replaceAll('~1', '/').replaceAll('~0', '~'));
      let value: any = openApi;
      for (const part of parts) value = value?.[part];
      return value ? resolveRef(value, depth + 1) : schema;
    }
    if (schema.allOf?.length) {
      const merged: any = { ...schema, properties: { ...(schema.properties || {}) } };
      for (const candidate of schema.allOf) {
        const resolved = resolveRef(candidate, depth + 1);
        Object.assign(merged, resolved);
        merged.properties = { ...merged.properties, ...(resolved.properties || {}) };
      }
      delete merged.allOf;
      return merged;
    }
    return schema;
  }

  function sampleFor(schemaValue: any, depth = 0): any {
    const schema = resolveRef(schemaValue, depth);
    if (depth > 8) return null;
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
    if (schema.oneOf?.length) return sampleFor(schema.oneOf[0], depth + 1);
    if (schema.anyOf?.length) return sampleFor(schema.anyOf[0], depth + 1);
    if (schema.type === 'object' || schema.properties) {
      const required = new Set(schema.required || []);
      const object: any = {};
      for (const [name, property] of Object.entries(schema.properties || {})) {
        if (required.has(name)) object[name] = sampleFor(property, depth + 1);
      }
      return object;
    }
    if (schema.type === 'array') return [];
    if (schema.type === 'integer' || schema.type === 'number') return 1;
    if (schema.type === 'boolean') return false;
    return '';
  }

  function makeInput(name: string, description: string, schemaValue: any, required: boolean, prefix: string): HTMLInputElement {
    const schema = resolveRef(schemaValue);
    const label = document.createElement('label');
    label.className = 'debug-field';
    const title = document.createElement('span');
    title.textContent = `${name}${required ? ' *' : ''}${description ? ` · ${description}` : ''}`;
    const input = document.createElement('input');
    input.type = schema.format === 'binary' ? 'file' : schema.type === 'integer' || schema.type === 'number' ? 'number' : 'text';
    if (input.type === 'number') input.step = schema.type === 'integer' ? '1' : 'any';
    input.dataset.fieldName = name;
    input.dataset.fieldPrefix = prefix;
    input.dataset.schemaType = schema.type || 'string';
    input.dataset.fieldFormat = schema.format || '';
    input.required = required;
    if (input.type !== 'file') {
      const sample = schema.example ?? schema.default ?? (Array.isArray(schema.enum) ? schema.enum[0] : undefined);
      input.value = sample === undefined ? '' : String(sample);
      input.placeholder = schema.type === 'array' ? '以逗号分隔' : required ? '请填写' : '可选';
    }
    label.append(title, input);
    return input;
  }

  function operationForSelection(): any {
    if (!openApi || !methodSelect.value) return null;
    const [method, ...pathBits] = methodSelect.value.split(' ');
    const path = pathBits.join(' ');
    const item = openApi.paths?.[path];
    return item ? { method, path, pathItem: item, operation: item[method.toLowerCase()] } : null;
  }

  function updateScopeView(): void {
    const selected = operationForSelection();
    if (!selected?.operation) {
      showStatus(scopeLabel, '先选择公开接口。');
      return;
    }
    const operation = selected.operation;
    const requiredScopes = operation['x-required-scopes'] || [];
    const optionalScopes = operation['x-oauth-scopes-if-bearer'] || [];
    const scopes = requiredScopes.length ? requiredScopes : optionalScopes;
    const security = Array.isArray(operation.security) ? operation.security : [];
    const hasAnonymousAlternative = security.some((requirement: any) => !requirement || Object.keys(requirement).length === 0);
    const requiresBearer = security.length > 0 && !hasAnonymousAlternative;
    const requested = ['openid', ...scopes];
    scopeConsent.checked = false;
    scopeConsent.disabled = false;
    connectButton.disabled = false;
    if (requiredScopes.length || optionalScopes.length || requiresBearer) {
      scopeLabel.textContent = `仅为当前操作申请：${requested.join(' ')}`;
    } else {
      scopeLabel.textContent = '此接口不声明 OAuth scope；登录调试只会申请 openid。';
    }
    requestButton.dataset.requiresBearer = requiresBearer ? 'true' : 'false';
    requestButton.dataset.supportsBearer = security.some((requirement: any) => Object.prototype.hasOwnProperty.call(requirement || {}, 'MindAuthBearer')) ? 'true' : 'false';
    updateTokenStatus();
  }

  function renderSelectedOperation(): void {
    const selected = operationForSelection();
    fieldsRoot.replaceChildren();
    bodyRoot.replaceChildren();
    writeConsent.checked = false;
    if (!selected?.operation) {
      showStatus(statusOutput, '选择接口以查看可填写的参数。');
      updateScopeView();
      return;
    }
    const operation = selected.operation;
    const seen = new Set<string>();
    const parameters = [...(selected.pathItem.parameters || []), ...(operation.parameters || [])];
    for (const parameter of parameters) {
      if (!['path', 'query'].includes(parameter.in)) continue;
      const key = `${parameter.in}:${parameter.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      fieldsRoot.append(makeInput(`${parameter.in}.${parameter.name}`, parameter.description || '', parameter.schema || {}, Boolean(parameter.required), parameter.in));
    }
    for (const match of selected.path.matchAll(/\{([^}]+)\}/g)) {
      const name = match[1];
      if (!seen.has(`path:${name}`)) {
        seen.add(`path:${name}`);
        fieldsRoot.append(makeInput(`path.${name}`, '', { type: 'string' }, true, 'path'));
      }
    }

    const requestBody = operation.requestBody;
    if (requestBody) {
      const content = requestBody.content || {};
      const mediaType = Object.keys(content)[0] || 'application/json';
      const schema = resolveRef(content[mediaType]?.schema || {});
      const isMultipart = mediaType.startsWith('multipart/form-data');
      const isBinary = mediaType === 'application/octet-stream' || schema.format === 'binary';
      if (isMultipart && schema.properties) {
        const required = new Set(schema.required || []);
        for (const [name, property] of Object.entries(schema.properties)) {
          fieldsRoot.append(makeInput(`body.${name}`, '', property, required.has(name), 'body'));
        }
        bodyRoot.dataset.contentType = mediaType;
        bodyRoot.dataset.bodyMode = 'multipart';
      } else if (isBinary) {
        bodyRoot.dataset.contentType = mediaType;
        bodyRoot.dataset.bodyMode = 'binary';
        const input = document.createElement('input');
        input.type = 'file';
        input.dataset.bodyFile = 'true';
        input.required = Boolean(requestBody.required);
        bodyRoot.append(input);
      } else {
        const label = document.createElement('label');
        label.className = 'debug-field';
        const title = document.createElement('span');
        title.textContent = `请求体 · ${mediaType}${requestBody.required ? ' *' : ''}`;
        const textarea = document.createElement('textarea');
        textarea.dataset.bodyJson = 'true';
        textarea.dataset.contentType = mediaType;
        textarea.value = JSON.stringify(sampleFor(schema), null, 2);
        label.append(title, textarea);
        bodyRoot.append(label);
        bodyRoot.dataset.bodyMode = 'json';
        bodyRoot.dataset.contentType = mediaType;
      }
    }
    requestButton.dataset.method = selected.method;
    requestButton.dataset.path = selected.path;
    showStatus(statusOutput, '参数已根据 Public OpenAPI 生成。请检查所有示例字段；写操作会真实提交到当前论坛。');
    updateScopeView();
  }

  function parsePath(methodSelectValue: string): { method: string; path: string } | null {
    const [method, ...parts] = methodSelectValue.split(' ');
    return method && parts.length ? { method, path: parts.join(' ') } : null;
  }

  async function connectClient(): Promise<void> {
    const selected = operationForSelection();
    if (!selected?.operation) return;
    const clientId = clientIdInput.value.trim();
    if (!clientId) {
      showStatus(statusOutput, '请先填写你在 MindAuth 开发者中心注册的 client_id。', true);
      clientIdInput.focus();
      return;
    }
    if (!scopeConsent.checked) {
      showStatus(statusOutput, '请先确认只申请当前接口显示的 scopes。', true);
      scopeConsent.focus();
      return;
    }
    connectButton.disabled = true;
    showStatus(statusOutput, '正在读取 MindAuth OAuth 配置…');
    try {
      const discoveryResponse = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: 'no-store', credentials: 'omit' });
      if (!discoveryResponse.ok) throw new Error('无法读取 MindAuth OAuth 配置');
      const discovery = await discoveryResponse.json();
      const authorizationEndpoint = new URL(discovery.authorization_endpoint);
      if (authorizationEndpoint.origin !== issuer) throw new Error('MindAuth discovery 返回了非预期授权域名');
      const verifierBytes = crypto.getRandomValues(new Uint8Array(32));
      const stateBytes = crypto.getRandomValues(new Uint8Array(32));
      const verifier = btoa(Array.from(verifierBytes, (byte) => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      const state = btoa(Array.from(stateBytes, (byte) => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      const challengeDigest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = btoa(Array.from(new Uint8Array(challengeDigest), (byte) => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
      const redirectUri = `${window.location.origin}/api/v1/debug/callback`;
      const scopes = ['openid', ...(selected.operation['x-required-scopes'] || selected.operation['x-oauth-scopes-if-bearer'] || [])];
      sessionStorage.setItem(pendingStorageKey, JSON.stringify({ client_id: clientId, verifier, state, redirect_uri: redirectUri, scopes }));
      authorizationEndpoint.searchParams.set('response_type', 'code');
      authorizationEndpoint.searchParams.set('client_id', clientId);
      authorizationEndpoint.searchParams.set('redirect_uri', redirectUri);
      authorizationEndpoint.searchParams.set('scope', [...new Set(scopes)].join(' '));
      authorizationEndpoint.searchParams.set('state', state);
      authorizationEndpoint.searchParams.set('code_challenge', challenge);
      authorizationEndpoint.searchParams.set('code_challenge_method', 'S256');
      window.location.assign(authorizationEndpoint.toString());
    } catch (error) {
      connectButton.disabled = false;
      showStatus(statusOutput, error instanceof Error ? error.message : '无法发起 OAuth 授权。', true);
    }
  }

  async function sendRequest(): Promise<void> {
    const selected = operationForSelection();
    if (!selected?.operation) return;
    const method = String(selected.method).toUpperCase();
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    if (isWrite && !writeConsent.checked) {
      showStatus(statusOutput, '请先确认这会真实修改论坛数据。', true);
      writeConsent.focus();
      return;
    }
    const token = readToken();
    if (requestButton.dataset.requiresBearer === 'true' && !token?.access_token) {
      showStatus(statusOutput, '此接口需要 Bearer token。请先使用自己的 OAuth Client 登录。', true);
      return;
    }
    if (token?.expires_at && token.expires_at <= Date.now()) {
      showStatus(statusOutput, '当前 access token 已过期，请重新使用自己的 OAuth Client 授权。', true);
      return;
    }

    let path = selected.path;
    const query = new URLSearchParams();
    const inputs = Array.from(fieldsRoot.querySelectorAll('input[data-field-name]')) as HTMLInputElement[];
    for (const input of inputs) {
      const name = input.dataset.fieldName || '';
      const prefix = input.dataset.fieldPrefix || '';
      const value = input.value.trim();
      if (input.required && !value && input.type !== 'file') {
        showStatus(statusOutput, `请填写必填参数 ${name}。`, true);
        input.focus();
        return;
      }
      if (!value) continue;
      if (prefix === 'path') {
        const rawName = name.replace(/^path\./, '');
        path = path.replace(`{${rawName}}`, encodeURIComponent(value));
      } else if (prefix === 'query') {
        const values = input.dataset.schemaType === 'array' ? value.split(',').map((item) => item.trim()).filter(Boolean) : [value];
        if (values.length > 1) values.forEach((item) => query.append(name.replace(/^query\./, ''), item));
        else query.append(name.replace(/^query\./, ''), values[0] || value);
      }
    }
    if (/\{[^}]+\}/.test(path)) {
      showStatus(statusOutput, '请填写所有路径参数。', true);
      return;
    }
    if (query.size) path += `${path.includes('?') ? '&' : '?'}${query.toString()}`;

    let body: BodyInit | undefined;
    let contentType = '';
    const bodyMode = bodyRoot.dataset.bodyMode;
    if (bodyMode === 'json') {
      const textarea = bodyRoot.querySelector('textarea[data-body-json]') as HTMLTextAreaElement;
      if (textarea?.value.trim()) {
        try { body = JSON.stringify(JSON.parse(textarea.value)); }
        catch { showStatus(statusOutput, '请求体不是有效 JSON。', true); textarea.focus(); return; }
      }
      contentType = textarea?.dataset.contentType || 'application/json';
    } else if (bodyMode === 'binary') {
      const fileInput = bodyRoot.querySelector('input[data-body-file]') as HTMLInputElement;
      body = fileInput.files?.[0];
      if (!body && fileInput.required) { showStatus(statusOutput, '请选择要上传的文件。', true); fileInput.focus(); return; }
      contentType = bodyRoot.dataset.contentType || 'application/octet-stream';
    } else if (bodyMode === 'multipart') {
      const form = new FormData();
      for (const input of inputs.filter((item) => item.dataset.fieldPrefix === 'body')) {
        const name = (input.dataset.fieldName || '').replace(/^body\./, '');
        const value = input.type === 'file' ? input.files?.[0] : input.value;
        if (input.required && !value) { showStatus(statusOutput, `请填写或选择 ${name}。`, true); input.focus(); return; }
        if (value) form.append(name, value as string | Blob);
      }
      body = form;
    }

    const url = `${window.location.origin}/api${path}`;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token?.access_token && requestButton.dataset.supportsBearer === 'true') headers.Authorization = `Bearer ${token.access_token}`;
    if (body && contentType && bodyMode !== 'multipart') headers['Content-Type'] = contentType;
    requestOutput.textContent = `${method} ${url}\n${Object.entries(headers).map(([key, value]) => `${key}: ${key.toLowerCase() === 'authorization' ? 'Bearer [redacted]' : value}`).join('\n')}${body ? `\n\n${typeof body === 'string' ? body : '[binary or multipart body]'}` : ''}`;
    responseOutput.textContent = '请求中…';
    showStatus(statusOutput, '请求已发送到当前论坛 API。');
    requestIdOutput.textContent = '—';
    rateOutput.textContent = '—';
    requestButton.disabled = true;
    try {
      const response = await fetch(url, { method, headers, body: ['GET', 'HEAD'].includes(method) ? undefined : body, credentials: 'omit', redirect: 'follow' });
      const requestId = response.headers.get('x-request-id') || response.headers.get('request-id') || '';
      const contentTypeHeader = response.headers.get('content-type') || '';
      const isText = /json|text|xml|javascript|problem\+json/i.test(contentTypeHeader);
      let responseBody = '';
      let parsed: any = null;
      const length = Number(response.headers.get('content-length') || 0);
      if (isText && (!length || length < 1000000)) {
        responseBody = await response.text();
        if (responseBody.length > 160000) responseBody = `${responseBody.slice(0, 160000)}\n…（响应已截断）`;
        try { parsed = JSON.parse(responseBody); } catch { /* text response */ }
      } else if (!isText) {
        responseBody = '[文件/二进制响应未读取；请使用原生客户端验证文件下载]';
      } else {
        responseBody = '[响应超过 1 MB，调试器不读取响应正文]';
      }
      requestIdOutput.textContent = parsed?.meta?.request_id || requestId || '响应未提供 request_id';
      rateOutput.textContent = `limit ${response.headers.get('x-ratelimit-limit') || '不可见'} · remaining ${response.headers.get('x-ratelimit-remaining') || '不可见'} · retry-after ${response.headers.get('retry-after') || '—'}`;
      responseOutput.textContent = `HTTP ${response.status} ${response.statusText}\nContent-Type: ${contentTypeHeader || 'unknown'}\n\n${parsed ? JSON.stringify(parsed, null, 2) : responseBody || '(empty response)'}`;
      showStatus(statusOutput, response.ok ? '请求完成。' : `请求返回 HTTP ${response.status}；检查 error.code 和 request_id。`, !response.ok);
    } catch (error) {
      responseOutput.textContent = error instanceof Error ? error.message : String(error);
      showStatus(statusOutput, '浏览器未能读取响应。若这是 MindAuth CORS 拒绝，请检查 OAuth 服务允许的来源；该页面不会将 token 中转到文档服务器。', true);
    } finally {
      requestButton.disabled = false;
    }
  }

  connectButton.addEventListener('click', () => { void connectClient(); });
  clearTokenButton.addEventListener('click', () => {
    sessionStorage.removeItem(tokenStorageKey);
    updateTokenStatus();
    showStatus(statusOutput, '已清除当前标签页中的 access token。');
  });
  methodSelect.addEventListener('change', renderSelectedOperation);
  requestButton.addEventListener('click', () => { void sendRequest(); });
  scopeConsent.addEventListener('change', () => { connectButton.disabled = !scopeConsent.checked; });
  clientIdInput.addEventListener('input', () => { connectButton.disabled = !scopeConsent.checked; });
  updateTokenStatus();

  fetch(specUrl, { cache: 'no-store', credentials: 'omit' })
    .then((response) => {
      if (!response.ok) throw new Error('Public OpenAPI 下载失败');
      return response.json();
    })
    .then((documentValue) => {
      openApi = documentValue;
      for (const [path, pathItem] of Object.entries(openApi.paths || {})) {
        for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
          const operation = (pathItem as any)[method];
          if (!operation) continue;
          const option = document.createElement('option');
          option.value = `${method} ${path}`;
          const tag = (operation.tags || [])[0] || 'Public API';
          option.textContent = `${method.toUpperCase()} /api${path} · ${operation.summary || operation.operationId || tag}`;
          methodSelect.append(option);
        }
      }
      const wanted = parsePath(`${selectedMethod} ${selectedPath}`);
      if (wanted) methodSelect.value = `${wanted.method} ${wanted.path}`;
      renderSelectedOperation();
      const connected = new URLSearchParams(window.location.search).get('connected');
      if (connected) history.replaceState(null, '', window.location.pathname);
    })
    .catch((error) => showStatus(statusOutput, error instanceof Error ? error.message : 'Public OpenAPI 无法加载。', true));
}

function finishOnlineDebuggerOAuth(): void {
  const statusNode = document.querySelector('[data-oauth-callback-status]') as HTMLElement | null;
  if (!statusNode) return;
  const storageKey = 'mdtbbs.public-api-debugger.pkce';
  const tokenKey = 'mdtbbs.public-api-debugger.access-token';
  const issuer = 'https://auth.mdtbbs.cn';
  const parameters = new URLSearchParams(window.location.search);
  const code = parameters.get('code');
  const returnedState = parameters.get('state');
  const oauthError = parameters.get('error');
  const oauthErrorDescription = parameters.get('error_description');
  history.replaceState(null, '', window.location.pathname);

  function show(message: string, isError = false): void {
    const target = document.querySelector('[data-oauth-callback-status]') as HTMLElement | null;
    if (!target) return;
    target.textContent = message;
    target.classList.toggle('debug-error', isError);
  }

  if (oauthError) {
    sessionStorage.removeItem(storageKey);
    show(`MindAuth 授权未完成：${oauthError}${oauthErrorDescription ? ` · ${oauthErrorDescription}` : ''}`, true);
    return;
  }
  let pending: any;
  try { pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); }
  catch { pending = null; }
  if (!code || !pending || !returnedState || returnedState !== pending.state) {
    sessionStorage.removeItem(storageKey);
    show('授权回调无效或 state 校验失败。请回到调试器重新发起授权。', true);
    return;
  }

  show('已校验 OAuth state，正在兑换短期 access token…');
  fetch(`${issuer}/.well-known/openid-configuration`, { cache: 'no-store', credentials: 'omit' })
    .then((response) => {
      if (!response.ok) throw new Error('无法读取 MindAuth OAuth 配置');
      return response.json();
    })
    .then((discovery) => {
      const tokenEndpoint = new URL(discovery.token_endpoint);
      if (tokenEndpoint.origin !== issuer) throw new Error('MindAuth discovery 返回了非预期 token 域名');
      return fetch(tokenEndpoint.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: pending.client_id,
          code,
          redirect_uri: pending.redirect_uri,
          code_verifier: pending.verifier,
        }),
        credentials: 'omit',
      }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.access_token) throw new Error(payload.error || 'MindAuth token 兑换失败');
        const token = {
          access_token: payload.access_token,
          client_id: pending.client_id,
          expires_at: payload.expires_in ? Date.now() + Number(payload.expires_in) * 1000 : null,
          scope: payload.scope || pending.scopes.join(' '),
        };
        sessionStorage.setItem(tokenKey, JSON.stringify(token));
        sessionStorage.removeItem(storageKey);
        show('授权完成。access token 只保存在当前标签页的 sessionStorage，不显示、不过期刷新，也不发送到文档服务器。');
        window.setTimeout(() => window.location.replace('/api/v1/debugger?connected=1'), 1200);
      });
    })
    .catch((error) => {
      sessionStorage.removeItem(storageKey);
      show(error instanceof Error ? error.message : 'OAuth token 兑换失败。确认 redirect URI 已登记且 MindAuth 允许此网页来源。', true);
    });
}

function renderDebugger(forumVersion: string, method = '', path = ''): string {
  const body = `
    <div class="eyebrow">Public Client V1</div><h1>在线调试</h1>
    <p class="lead">选择一项公开 API，使用自己的 MindAuth Public Client 与明确列出的 scopes 调试。请求直接从浏览器发送到当前论坛；此页不创建高权限 Token、不提供 Sandbox，也不把 Token 发到文档服务器。</p>
    <div class="debug-panel" data-public-debugger data-selected-method="${escapeHtml(method.toLowerCase())}" data-selected-path="${escapeHtml(path)}">
      <div class="debug-field"><label for="debug-operation">Public API 操作</label><select id="debug-operation" data-debug-operation><option value="">正在加载 Public OpenAPI…</option></select></div>
      <div class="debug-grid">
        <div class="debug-field"><label for="debug-client-id">你的 OAuth Client ID</label><input id="debug-client-id" data-debug-client-id autocomplete="off" spellcheck="false" placeholder="从 MindAuth 开发者中心复制 client_id"></div>
        <div class="debug-field"><label>OAuth Scope</label><div data-debug-scopes>先选择 API 操作。</div></div>
      </div>
      <p>Redirect URI：<code data-debug-redirect-uri></code>。先把此完整 URI 登记到你自己的 MindAuth Client。在线调试只申请 <code>openid</code> 和所选 API 操作声明的 scopes，不会追加其他权限。</p>
      <label><input type="checkbox" data-debug-scope-consent> 我确认向当前 Client 申请上面列出的 scopes。</label>
      <div class="debug-actions"><button type="button" class="primary" data-debug-connect disabled>使用我的 Client 登录</button><button type="button" data-debug-clear-token hidden>清除 Token</button></div>
      <p data-debug-auth-status aria-live="polite">正在检查当前标签页的 Token 状态…</p>
      <div data-debug-fields class="debug-grid" aria-label="请求参数"></div>
      <div data-debug-body></div>
      <label><input type="checkbox" data-debug-write-consent> 我知道提交、更新或删除操作会对当前账号执行真实操作。</label>
      <div class="debug-actions"><button type="button" class="primary" data-debug-run>发送 Request</button><span data-debug-status aria-live="polite">选择接口以查看可填写的参数。</span></div>
      <section class="debug-output"><h2>实际 Request</h2><pre><code data-debug-request>—</code></pre></section>
      <section class="debug-output"><h2>Response</h2><p>HTTP 状态和响应正文</p><pre><code data-debug-response>—</code></pre><p>request_id：<code data-debug-request-id>—</code></p><p>Rate Limit：<code data-debug-rate>—</code></p></section>
    </div>
    ${callout('warning', '安全边界', '调试器会使用你的授权执行所选操作。不要粘贴其他人的 Token；完整 Token 不会显示，关闭标签页会清除会话存储。')}
  `;
  const callbackUri = 'window.location.origin + "/api/v1/debug/callback"';
  return commonShell({
    title: '在线调试 Public API',
    description: '使用自己的 OAuth Public Client 调试经批准的 V1 操作。',
    body,
    forumVersion,
    activePath: '/api/v1/debugger',
    script: `document.querySelector('[data-debug-redirect-uri]').textContent = ${callbackUri}; (${runOnlineDebugger.toString()})();`,
  });
}

function renderOAuthCallback(forumVersion: string): string {
  const body = `
    <div class="eyebrow">MindAuth OAuth</div><h1>授权回调</h1>
    <p class="lead" data-oauth-callback-status aria-live="polite">正在验证授权回调…</p>
    <p><a href="/api/v1/debugger">返回 Public API 在线调试器</a></p>
  `;
  return commonShell({
    title: 'OAuth 授权回调',
    description: '验证 PKCE state 并为当前标签页兑换临时访问令牌。',
    body,
    forumVersion,
    script: `(${finishOnlineDebuggerOAuth.toString()})();`,
  });
}

function renderErrorReference(forumVersion: string): string {
  const rows = getAllV1ErrorCodes().slice().sort((left, right) => left.code.localeCompare(right.code)).map((item) => [
    inlineCode(item.code),
    String(item.httpStatus),
    item.retryable ? '是' : '否',
    escapeHtml(item.description),
  ]);
  const body = `
    <div class="eyebrow">Public API 错误</div><h1>稳定错误代码</h1>
    <p class="lead">V1 JSON 错误使用现有 <code>{ error, meta }</code> envelope。控制流应依据 HTTP 状态和 <code>error.code</code>；<code>message</code> 是面向用户的文字，可能本地化。</p>
    ${codeBlock(`{
  "error": {
    "code": "RATE_LIMITED",
    "message": "请求过于频繁",
    "retryable": true,
    "details": []
  },
  "meta": { "request_id": "req_..." }
}`, 'json')}
    ${table(['code', 'HTTP', '可重试', '含义'], rows)}
    ${callout('info', '排查问题', '把 HTTP 状态、稳定错误码和 <code>meta.request_id</code> 一起提供给维护者。达到限流后请遵守 <code>Retry-After</code>，不要忙等重试。')}
  `;
  return commonShell({ title: '错误代码', description: 'MDTBBS Public V1 稳定错误代码表', body, forumVersion, activePath: '/api/v1/docs/errors' });
}

function renderReference(document: OpenAPIObject, forumVersion: string): string {
  const groups = new Map<string, string[]>();
  for (const [path, pathItem] of Object.entries(document.paths || {})) {
    for (const method of METHOD_ORDER) {
      const operation = (pathItem as any)?.[method];
      if (!operation) continue;
      const samples = makeContractSamples(document, method, path, pathItem, operation);
      const securityBadge = hasSecurity(operation)
        ? '<span class="badge">' + (hasOptionalSecurity(operation) ? 'Bearer 可选' : 'Bearer 必需') + '</span>'
        : '';
      const declaredScopes = operation['x-required-scopes'] || operation['x-oauth-scopes-if-bearer'] || [];
      const oauthScope = declaredScopes[0] || referenceOAuthScope(method, path);
      const scopeBadges = declaredScopes.length
        ? declaredScopes.map((scope: string) => `<span class="badge">OAuth scope: ${escapeHtml(scope)}</span>`).join('')
        : oauthScope ? `<span class="badge">OAuth scope: ${escapeHtml(oauthScope)}</span>` : '';
      const limitBadge = `<span class="badge">Rate limit: ${escapeHtml(rateLimitLabel(operation['x-rate-limit']))}</span>`;
      const lifecycle = operation.deprecated
        ? callout('warning', 'Deprecated', `Since ${escapeHtml(operation['x-deprecated-since'] || 'unknown')}. ${escapeHtml(operation['x-removal-plan'] || '')} <a href="${escapeHtml(operation['x-migration-guide'] || '/api/v1/docs/lifecycle')}">Migration guide</a>.`)
        : '';
      const debuggerHref = `/api/v1/debugger?method=${encodeURIComponent(method)}&path=${encodeURIComponent(path)}`;
      const tag = String((operation.tags || [])[0] || '其他接口');
      const anchor = referenceTagAnchor(tag);
      const endpoint = `
        <article class="endpoint" data-endpoint-search="${escapeHtml(operationSearchText(document, method, path, pathItem, operation) + ' ' + (oauthScope || ''))}">
          <div class="endpoint-head">
            <span class="method ${method}">${method.toUpperCase()}</span>
            <span class="endpoint-path">/api${escapeHtml(path)}</span>
          </div>
          <p class="endpoint-summary">${escapeHtml(operation.summary || operation.description || '公开 V1 接口')}</p>
          <div class="use-case"><strong>用途：</strong>${escapeHtml(endpointUseCase(method, path, operation))}</div>
          <div class="meta-line">${securityBadge}${scopeBadges}${limitBadge}${(operation.tags || []).map((tag: string) => `<span class="badge">${escapeHtml(tag)}</span>`).join('')}</div>
          ${lifecycle}
          <p>分页：${escapeHtml(paginationLabel(document, path, pathItem, operation))} <a href="/api/v1/docs/errors">错误码与通用错误结构</a></p>
          ${renderContractParameters(document, path, pathItem, operation)}
          ${renderRequestBody(document, operation)}
          ${renderResponses(document, path, method, operation)}
          <h3>调用示例</h3>
          <p>示例会按契约填入查询参数和请求体字段；尖括号占位符要替换成实际值。响应示例是结构模板，不代表线上数据。</p>
          ${codeTabs(samples)}
          <p><a class="debug-link" href="${escapeHtml(debuggerHref)}">在在线调试器中打开此操作</a></p>
        </article>`;
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag)!.push(endpoint);
    }
  }

  const operationCount = [...groups.values()].reduce((sum, endpoints) => sum + endpoints.length, 0);
  const groupHtml = [...groups.entries()].map(([tag, endpoints]) => {
    const anchor = referenceTagAnchor(tag);
    return `<section id="${anchor}"><h2>${escapeHtml(referenceTagLabel(tag))} <span class="badge">${endpoints.length} 个操作</span></h2>${endpoints.join('')}</section>`;
  }).join('');
  const toc = [...groups.keys()].map((tag) => ({
    href: '#' + referenceTagAnchor(tag),
    label: referenceTagLabel(tag),
  }));
  const body = `
    <div class="eyebrow">OpenAPI</div><h1>API 参考</h1>
    <p class="lead">本页从 Public Client V1 OpenAPI 契约生成，并按业务标签分组。参数表会说明位置、类型、必填、示例和约束；请求体与成功响应会列出契约已声明的字段。</p>
    <p>当前列出 ${operationCount} 个操作。分页方式按接口分别使用 page/offset 或 opaque cursor，请以每个接口的参数表为准，不要混用。</p>
    <input class="reference-filter" data-reference-filter type="search" placeholder="搜索接口路径、用途、方法或说明…" aria-label="搜索 API">
    ${callout('info', '机器可读契约', 'Public OpenAPI JSON：<a href="/api/openapi/v1.json"><code>/api/openapi/v1.json</code></a>。每项接口都列出准确 OAuth scopes、限流和分页参数；<a href="/api/v1/debugger">在线调试器</a>只允许调用本公开契约中的接口。')}
    ${groupHtml}
  `;

  return commonShell({
    title: 'API 参考',
    description: 'MDTBBS First-party V1 API Reference',
    body,
    forumVersion,
    activePath: '/api/v1/reference',
    toc,
  });
}

export function registerDeveloperDocs(
  app: INestApplication,
  document: OpenAPIObject,
  forumVersion: string,
): void {
  const adapter = app.getHttpAdapter();

  adapter.get('/developers', (_req: any, res: any) => {
    const html = renderHome(forumVersion);
    setHtmlHeaders(res, html);
    res.status(200).send(html);
  });

  adapter.get('/api/v1', (_req: any, res: any) => {
    const html = renderHome(forumVersion);
    setHtmlHeaders(res, html);
    res.status(200).send(html);
  });

  adapter.get('/api/v1/docs/:slug', (req: any, res: any) => {
    const slug = String(req.params?.slug || '');
    const page = slug === 'errors'
      ? null
      : renderMarkdownGuide(slug) || guidePages()[slug];
    if (slug === 'errors') {
      const html = renderErrorReference(forumVersion);
      setHtmlHeaders(res, html);
      res.status(200).send(html);
      return;
    }
    if (!page) {
      res.status(404).json({
        error: { code: 'DOC_NOT_FOUND', message: '文档页面不存在', retryable: false, details: [] },
        meta: { request_id: req.requestId || '' },
      });
      return;
    }
    const html = commonShell({
      title: page.title,
      description: page.description,
      body: page.body,
      forumVersion,
      activePath: `/api/v1/docs/${req.params.slug}`,
      toc: page.toc,
    });
    setHtmlHeaders(res, html);
    res.status(200).send(html);
  });

  adapter.get('/api/v1/reference', (_req: any, res: any) => {
    const html = renderReference(document, forumVersion);
    setHtmlHeaders(res, html);
    res.status(200).send(html);
  });

  adapter.get('/api/v1/debugger', (_req: any, res: any) => {
    const method = String(_req.query?.method || '').toLowerCase();
    const path = String(_req.query?.path || '');
    const html = renderDebugger(forumVersion, method, path);
    setHtmlHeaders(res, html, { noStore: true });
    res.status(200).send(html);
  });

  adapter.get('/api/v1/debug/callback', (_req: any, res: any) => {
    const html = renderOAuthCallback(forumVersion);
    setHtmlHeaders(res, html, { noStore: true });
    res.status(200).send(html);
  });
}
