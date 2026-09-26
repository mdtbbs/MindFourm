import { randomBytes } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { OpenAPIObject } from '@nestjs/swagger';
import { API_V1_BASE_PATH, API_V1_VERSION } from '../openapi/api-version';

type CodeLanguage = 'curl' | 'javascript' | 'typescript' | 'java' | 'kotlin';

interface DocPage {
  title: string;
  description: string;
  body: string;
}

const PUBLIC_SITE = 'https://mdtbbs.cn';
const PUBLIC_API_ORIGIN = `${PUBLIC_SITE}/api`;

const NAV_ITEMS = [
  { href: '/api/v1/docs/quick-start', label: '快速开始' },
  { href: '/api/v1/docs/conventions', label: '通用约定' },
  { href: '/api/v1/docs/oauth', label: 'OAuth / Public Client' },
  { href: '/api/v1/docs/authentication', label: '身份认证' },
  { href: '/api/v1/docs/first-party', label: 'First-party V1' },
  { href: '/api/v1/docs/game-content', label: 'Game Content' },
  { href: '/api/v1/docs/resources', label: 'Resource V1' },
  { href: '/api/v1/docs/external', label: 'External API' },
  { href: '/api/v1/reference', label: 'API Reference' },
];

const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
  toc?: Array<{ href: string; label: string }>;
}): string {
  const nonce = randomBytes(16).toString('base64');
  const nav = NAV_ITEMS.map((item) => {
    const active = params.activePath === item.href ? ' aria-current="page"' : '';
    return `<a href="${item.href}"${active}>${escapeHtml(item.label)}</a>`;
  }).join('');

  const toc = params.toc?.length
    ? `<aside class="toc"><div class="toc-title">本页目录</div>${params.toc.map((item) => `<a href="${item.href}">${escapeHtml(item.label)}</a>`).join('')}</aside>`
    : '<aside class="toc"></aside>';

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
      --max: 1480px;
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
    .brand-mark { width: 27px; height: 27px; border-radius: 8px; display: grid; place-items: center; background: var(--text); color: var(--bg); font-size: 12px; font-weight: 800; }
    .top-links { margin-left: auto; display: flex; gap: 16px; align-items: center; font-size: 14px; }
    .version-pill { padding: 4px 9px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); }
    .layout {
      width: min(100%, var(--max));
      margin: 0 auto;
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr) 190px;
      gap: 38px;
      padding: 34px 24px 72px;
    }
    .sidebar { position: sticky; top: 86px; align-self: start; display: flex; flex-direction: column; gap: 3px; }
    .sidebar-title { margin: 0 0 10px 10px; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .sidebar a { padding: 7px 10px; border-radius: 8px; color: var(--muted); font-size: 14px; }
    .sidebar a[aria-current="page"] { background: var(--accent-soft); color: var(--accent); font-weight: 650; }
    .content { min-width: 0; max-width: 900px; }
    .eyebrow { color: var(--accent); font-size: 13px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
    h1 { margin: 8px 0 14px; font-size: clamp(34px, 5vw, 54px); line-height: 1.08; letter-spacing: -0.045em; }
    .lead { margin: 0 0 28px; max-width: 760px; color: var(--muted); font-size: 18px; }
    h2 { margin: 42px 0 14px; padding-top: 12px; font-size: 25px; line-height: 1.25; letter-spacing: -0.025em; }
    h3 { margin: 28px 0 10px; font-size: 18px; }
    p { margin: 10px 0 16px; }
    ul, ol { padding-left: 22px; }
    code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; font-size: .92em; }
    :not(pre) > code { padding: 2px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
    pre { overflow: auto; margin: 14px 0 22px; padding: 16px 18px; border-radius: 12px; background: var(--code); color: var(--code-text); line-height: 1.55; }
    pre code { font-size: 13px; }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 24px 0; }
    .card { display: block; padding: 18px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); color: var(--text); }
    .card:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); text-decoration: none; }
    .card strong { display: block; margin-bottom: 5px; }
    .card span { display: block; color: var(--muted); font-size: 14px; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 26px 0; }
    .stat { padding: 16px; border: 1px solid var(--border); border-radius: 12px; }
    .stat span { display: block; color: var(--muted); font-size: 12px; }
    .stat strong { display: block; margin-top: 4px; overflow-wrap: anywhere; font-size: 15px; }
    .callout { margin: 20px 0; padding: 14px 16px; border-left: 3px solid var(--accent); border-radius: 8px; background: var(--accent-soft); }
    .callout.warning { border-left-color: #f79009; background: color-mix(in srgb, #f79009 10%, var(--bg)); }
    .callout p { margin: 5px 0 0; color: var(--muted); }
    .table-wrap { overflow: auto; margin: 14px 0 24px; border: 1px solid var(--border); border-radius: 12px; }
    table { width: 100%; border-collapse: collapse; min-width: 620px; font-size: 14px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { background: var(--surface); color: var(--muted); font-size: 12px; }
    tr:last-child td { border-bottom: 0; }
    .toc { position: sticky; top: 86px; align-self: start; border-left: 1px solid var(--border); padding-left: 16px; display: flex; flex-direction: column; gap: 7px; font-size: 13px; }
    .toc-title { margin-bottom: 4px; color: var(--muted); font-weight: 650; }
    .toc a { color: var(--muted); }
    .endpoint { margin: 20px 0 28px; padding: 18px; border: 1px solid var(--border); border-radius: 14px; }
    .endpoint-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .method { min-width: 62px; padding: 3px 8px; border-radius: 6px; color: white; text-align: center; font-size: 12px; font-weight: 800; }
    .method.get { background: var(--get); } .method.post { background: var(--post); } .method.put { background: var(--put); }
    .method.patch { background: var(--patch); } .method.delete { background: var(--delete); }
    .endpoint-path { overflow-wrap: anywhere; font-family: "SFMono-Regular", Consolas, monospace; font-weight: 650; }
    .endpoint-summary { margin: 9px 0 0; color: var(--muted); }
    .meta-line { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .badge { padding: 3px 8px; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); font-size: 12px; }
    .code-example { margin-top: 16px; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .code-tabs { display: flex; gap: 2px; overflow-x: auto; padding: 8px; background: var(--surface); }
    .code-tabs button { appearance: none; border: 0; border-radius: 7px; padding: 6px 9px; background: transparent; color: var(--muted); cursor: pointer; font: inherit; font-size: 12px; }
    .code-tabs button[aria-selected="true"] { background: var(--bg); color: var(--text); box-shadow: inset 0 0 0 1px var(--border); }
    .code-example pre { display: none; margin: 0; border-radius: 0; }
    .code-example pre[data-active="true"] { display: block; }
    .reference-filter { width: 100%; margin: 10px 0 22px; padding: 11px 13px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text); font: inherit; }
    .footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; }
    @media (max-width: 1100px) {
      .layout { grid-template-columns: 210px minmax(0, 1fr); }
      .toc { display: none; }
    }
    @media (max-width: 760px) {
      .topbar { padding: 0 16px; }
      .top-links .hide-mobile, .version-pill { display: none; }
      .layout { display: block; padding: 22px 16px 54px; }
      .sidebar { position: static; margin-bottom: 28px; padding-bottom: 16px; border-bottom: 1px solid var(--border); flex-direction: row; overflow-x: auto; }
      .sidebar-title { display: none; }
      .sidebar a { white-space: nowrap; }
      .cards, .stat-grid { grid-template-columns: 1fr; }
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
  <div class="layout">
    <nav class="sidebar" aria-label="开发者文档">
      <div class="sidebar-title">开发者文档</div>
      <a href="/api/v1"${params.activePath === '/api/v1' ? ' aria-current="page"' : ''}>概览</a>
      ${nav}
    </nav>
    <main class="content">
      ${params.body}
      <div class="footer">MDTBBS Forum ${escapeHtml(params.forumVersion)} · API v${escapeHtml(API_V1_VERSION)} · 文档内容以当前公开稳定接口为准。</div>
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
    }
  </script>
</body>
</html>`;
}

function setHtmlHeaders(res: any, nonceAwareHtml: string): void {
  const nonceMatch = nonceAwareHtml.match(/<style nonce="([^"]+)">/);
  const nonce = nonceMatch?.[1] || '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
}

function renderHome(forumVersion: string): string {
  const body = `
    <div class="eyebrow">Developer Documentation</div>
    <h1>MDTBBS API</h1>
    <p class="lead">面向第三方工具、Mindustry Mod、桌面与移动客户端以及服务端集成的公开接口文档。这里仅展示承诺稳定的公开契约，不包含论坛内部、管理端或 Legacy 路由。</p>
    <div class="stat-grid">
      <div class="stat"><span>论坛版本</span><strong>${escapeHtml(forumVersion)}</strong></div>
      <div class="stat"><span>API 版本</span><strong>v${escapeHtml(API_V1_VERSION)}</strong></div>
      <div class="stat"><span>Base URL</span><strong>mdtbbs.cn/api/v1</strong></div>
    </div>
    ${callout('info', '从 Capability 开始', `客户端启动后建议先请求 ${inlineCode('GET /api/v1/capabilities')}，再根据服务端声明启用对应功能。`)}
    <div class="cards">
      <a class="card" href="/api/v1/docs/quick-start"><strong>快速开始</strong><span>请求、响应、版本与错误处理。</span></a>
      <a class="card" href="/api/v1/docs/game-content"><strong>Game Content</strong><span>蓝图、地图、搜索、预览、下载与提交。</span></a>
      <a class="card" href="/api/v1/docs/resources"><strong>Resource V1</strong><span>资源、版本、Manifest 与文件。</span></a>
      <a class="card" href="/api/v1/docs/oauth"><strong>OAuth / Public Client</strong><span>申请应用、PKCE、Scope、Token 刷新与撤销。</span></a>
      <a class="card" href="/api/v1/docs/authentication"><strong>身份认证</strong><span>新客户端、旧版兼容和服务端凭证怎么选。</span></a>
      <a class="card" href="/api/v1/docs/external"><strong>External API</strong><span>机器人、同步服务和后台自动化。</span></a>
      <a class="card" href="/api/v1/reference"><strong>API Reference</strong><span>由当前 OpenAPI 契约生成的只读接口参考。</span></a>
    </div>
    ${section('最小示例', `${codeBlock(`curl "https://mdtbbs.cn/api/v1/game-content/maps?limit=10"`, 'bash')}<p>公开读取接口可以匿名调用。需要身份的接口会在对应文档中明确标记认证方式。</p>`)}
    ${section('公开边界', '<p><strong>First-party V1</strong> 使用 <code>/api/v1/*</code>；<strong>External API</strong> 使用 <code>/api/external/v1/*</code>。未在本开发者入口列出的 <code>/api/*</code>、管理端和服务间路由不属于第三方稳定契约。</p>')}
  `;
  return commonShell({
    title: '概览',
    description: 'MDTBBS API 开发者文档入口',
    body,
    forumVersion,
    activePath: '/api/v1',
    toc: [{ href: '#', label: '概览' }],
  });
}

function guidePages(): Record<string, DocPage> {
  const quickStart = `
    <div class="eyebrow">开始使用</div><h1>快速开始</h1>
    <p class="lead">MDTBBS 的公开 API 以 HTTPS 提供。读取蓝图、地图和公开资源通常无需认证，写操作和用户状态接口按场景使用对应凭证。</p>
    ${section('1. 发现服务能力', `${codeBlock('curl https://mdtbbs.cn/api/v1/capabilities', 'bash')}<p>能力为 <code>false</code> 时，客户端应隐藏或禁用对应功能，而不是反复探测接口。</p>`, 'capabilities')}
    ${section('2. 调用公开接口', codeBlock('curl "https://mdtbbs.cn/api/v1/game-content/blueprints?limit=20"', 'bash'), 'public-read')}
    ${section('3. 处理 V1 响应', `${codeBlock(`{
  "data": {},
  "meta": {
    "request_id": "req_..."
  }
}`, 'json')}<p>控制流应依赖 HTTP 状态码和稳定的 <code>error.code</code>，不要匹配中文错误消息。</p>`, 'response')}
    ${section('4. 获取机器可读规范', `<p>OpenAPI：<a href="/api/openapi/v1.json"><code>/api/openapi/v1.json</code></a>。完整接口参考：<a href="/api/v1/reference"><code>/api/v1/reference</code></a>。</p>`, 'openapi')}
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
    ${section('Raw Response', '<p>文件、图片与重定向接口可能直接返回字节流或 3xx，不使用 JSON Envelope。调用方应检查 <code>Content-Type</code>、状态码、<code>ETag</code> 与下载 Hash。</p>', 'raw')}
    ${section('兼容策略', '<ul><li>V1 内可以新增可选字段，客户端必须忽略未知字段。</li><li>删除字段、改变必填关系或身份语义时应进入新版本。</li><li>跨客户端对象优先使用稳定 public id，不持久化数据库自增 ID。</li><li>Preview 不可用不代表原始资源不可用。</li></ul>', 'compat')}
    ${section('默认限流', `<p>无更严格声明时，默认读请求约 <code>1200 / 60s</code>，写请求约 <code>180 / 60s</code>。达到限制返回 HTTP 429，V1 错误码为 <code>RATE_LIMITED</code>。</p>`, 'rate-limit')}
  `;

  const oauth = `
    <div class="eyebrow">MindAuth</div><h1>OAuth / Public Client</h1>
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

{
  "grant_type": "refresh_token",
  "client_id": "YOUR_CLIENT_ID",
  "refresh_token": "CURRENT_REFRESH_TOKEN"
}`, 'http')}${codeBlock(`POST https://auth.mdtbbs.cn/api/revoke
Content-Type: application/json

{
  "client_id": "YOUR_CLIENT_ID",
  "token": "TOKEN_TO_REVOKE"
}`, 'http')}<p>Access token 当前有效期约一小时。Refresh token 会轮换，刷新成功后要立刻保存新的 refresh token，旧值不要继续使用。</p>`, 'refresh')}
    ${section('Scopes', table(['Scope', '用来做什么'], [
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
    ]), 'scopes')}
    ${section('Scope 过了，还要看论坛权限', '<p>OAuth scope 只说明“这个客户端被允许请求什么”。真正执行操作时，论坛还会检查用户封禁、手机号验证、社区条款、版块权限、审核策略、站点开关和资源策略。</p><p>客户端启动后先请求 <code>GET /api/v1/capabilities</code>。登录后还可以读 <code>GET /api/v1/me</code> 里的 <code>permissions</code>，用来决定按钮要不要展示。接口本身仍会再次校验，不能把 permissions 当授权凭证。</p>', 'policy')}
    ${section('常见失败', table(['错误', '通常是什么问题'], [
      [inlineCode('invalid_client'), 'client_id 不存在、未批准、已停用，或 Confidential Client 缺少正确认证'],
      [inlineCode('invalid_scope'), '申请了应用没有获批的 scope'],
      [inlineCode('invalid_grant'), '授权码过期/已使用、redirect 不一致、PKCE verifier 错误，或 refresh token 已失效'],
      [inlineCode('access_denied'), '用户在授权页拒绝了授权'],
      [inlineCode('PHONE_VERIFICATION_REQUIRED'), 'OAuth 已成功，但当前论坛写操作要求先验证手机号'],
      [inlineCode('TERMS_ACCEPTANCE_REQUIRED'), '需要先接受当前社区条款'],
      [inlineCode('FEATURE_DISABLED'), '站点暂时关闭了对应能力'],
      [inlineCode('THIRD_PARTY_ACCESS_DISABLED'), '例如第三方私信能力还没有开放'],
    ]), 'errors')}
    ${callout('warning', '客户端里不要塞服务器密钥', 'Public Client 里只应该出现 client_id。MindAuth 密码、External API Key、Forum 服务密钥和 client secret 都不应该进入 APK、Mod JAR、桌面发行包或网页 bundle。')}
    ${section('自动发现', '<p>协议端点和当前 scopes 可以从 <a href="https://auth.mdtbbs.cn/.well-known/openid-configuration"><code>/.well-known/openid-configuration</code></a> 读取。MindAuth 当前提供 UserInfo，但 Public Client 不需要也不能调用服务端用的 token introspection。</p>', 'discovery')}
  `;

  const authentication = `
    <div class="eyebrow">Security</div><h1>身份认证</h1>
    <p class="lead">新客户端优先使用 MindAuth Public Client OAuth。下面几套凭证还会保留一段时间，主要服务旧客户端、浏览器会话和服务端集成。</p>
    ${table(['场景', '凭证', '说明'], [
      ['公开读取', '无需凭证', '蓝图、地图、公开资源等允许匿名读取的接口'],
      ['新桌面端 / Android / Mod / 启动器', 'MindAuth Public Client Bearer', 'Authorization Code + PKCE，推荐路径'],
      ['旧版移动客户端', 'Forum Mobile Bearer', '兼容现有已发布客户端'],
      ['浏览器论坛', 'forum_session Cookie', 'HttpOnly，同源 Web 使用'],
      ['机器人 / 同步服务', 'External API Key', '只放服务端'],
    ])}
    ${section('新客户端：MindAuth Public Client', '<p>先在 <a href="/api/v1/docs/oauth">OAuth / Public Client</a> 页面完成应用申请和 PKCE 登录。成功后，把 MindAuth access token 放到 <code>Authorization: Bearer &lt;token&gt;</code>。Forum 会在服务端校验 token 和 scopes，客户端自己不需要解析 opaque token。</p>', 'public-client')}
    ${section('Forum Mobile Bearer（兼容）', `<p>现有 Android / 原生客户端仍可使用 MindAuth native authorization code + PKCE，通过 <code>POST /api/v1/auth/mobile/exchange</code> 换 Forum 自己的 access/refresh token。当前 access token 约 30 分钟，refresh token 约 90 天并轮换。</p><p>新项目没有兼容包袱时，不建议再从这条路径起步。</p>`, 'mobile')}
    ${section('浏览器 forum_session', '<p>论坛 Web 登录后使用 HttpOnly <code>forum_session</code> Cookie。它适合同源网页和 SSR，客户端不要尝试读取、复制或把这个 Cookie 搬到别的应用里。</p>', 'session')}
    ${section('External API Key', `${codeBlock('Authorization: Bearer mfk_live_xxx.yyy\n# 或\nX-API-Key: mfk_live_xxx.yyy', 'http')}<p>Key 带有 scopes、启停、过期、IP 白名单、限流、默认 actor 和审计属性，只适合机器人、同步服务和后台自动化。</p>`, 'external-key')}
    ${callout('warning', '终端客户端只带自己的公开凭证', 'External API Key、Forum 内部服务密钥和 Confidential Client secret 都不应该出现在浏览器 JavaScript、APK、Mod JAR、桌面客户端发行包或公开仓库中。')}
  `;

  const firstParty = `
    <div class="eyebrow">First-party</div><h1>First-party API V1</h1>
    <p class="lead">这是 Web、Android、桌面端与其他受支持客户端的稳定接口面。完整方法和 Schema 以 API Reference 为准。</p>
    ${section('基础入口', table(['Method', 'Path', '说明'], [
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
    <div class="eyebrow">Mindustry</div><h1>Game Content API</h1>
    <p class="lead"><code>/api/v1/game-content</code> 是蓝图和地图的一等客户端 API，适合游戏内 Mod、桌面工具和移动端。</p>
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
    <div class="eyebrow">Resources</div><h1>Resource API V1</h1>
    <p class="lead">Resource V1 是论坛资源中心、未来启动器和游戏内客户端共用的稳定读取模型。</p>
    ${section('稳定身份', '<p><code>public_id</code> 是资源、版本与文件的外部稳定身份。数字数据库 ID 属于实现细节，不应由第三方客户端持久化。</p>', 'identity')}
    ${section('公开读取', table(['Method', 'Path', '说明'], [
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

  const externalRows = [
    ['GET', '/me', '—', '当前 API Key 的安全视图'],
    ['POST', '/images', 'images:write', '上传公共图片'],
    ['GET', '/users/{id}', 'users:read', '读取用户安全字段'],
    ['GET', '/categories', 'categories:read', '分类'],
    ['GET', '/tags', 'tags:read', '标签'],
    ['GET', '/posts', 'posts:read', '帖子列表'],
    ['GET', '/posts/activity', 'posts:read', '帖子活动'],
    ['POST', '/posts', 'posts:write', '创建帖子'],
    ['GET', '/posts/{id}', 'posts:read', '帖子详情'],
    ['PATCH', '/posts/{id}', 'posts:write', '更新帖子'],
    ['DELETE', '/posts/{id}', 'posts:delete', '删除帖子'],
    ['GET', '/posts/{id}/replies', 'replies:read', '回复列表'],
    ['POST', '/posts/{id}/replies', 'replies:write', '创建回复'],
    ['GET', '/replies/{id}', 'replies:read', '回复详情'],
    ['PATCH', '/replies/{id}', 'replies:write', '更新回复'],
    ['DELETE', '/replies/{id}', 'replies:delete', '删除回复'],
    ['POST', '/posts/{id}/moderation', 'posts:moderate', '帖子审核 / 管理'],
    ['POST', '/replies/{id}/moderation', 'replies:delete / posts:moderate', '回复审核'],
    ['GET', '/resources', 'resources:read', '资源列表'],
    ['GET', '/resources/filter-options', 'resources:read', '资源筛选项'],
    ['POST', '/resources', 'resources:write', '创建外链资源'],
    ['GET', '/resources/categories', 'resources:read', '资源分类'],
    ['GET', '/resources/{id}', 'resources:read', '资源详情'],
    ['PATCH', '/resources/{id}', 'resources:write', '更新资源'],
    ['DELETE', '/resources/{id}', 'resources:delete', '删除资源'],
    ['POST', '/resources/{id}/moderation', 'resources:moderate', '资源审核'],
  ];

  const external = `
    <div class="eyebrow">Server Integration</div><h1>External API</h1>
    <p class="lead">External API 面向机器人、同步器和后台自动化，只允许在服务器端持有 API Key。Base URL 为 <code>/api/external/v1</code>。</p>
    ${section('认证', `${codeBlock('Authorization: Bearer mfk_live_xxxxxxxx.yyyyyyyyyyyyyyyyy\n# 兼容：X-API-Key: mfk_live_...', 'http')}<p>每个 Key 都可以独立设置 scopes、启停、过期、IP 白名单、每分钟限流、默认 actor 和审计。</p>${codeTabs(makeCodeSamples('GET', '/external/v1/me', { security: [{ ExternalApiKey: [] }] }))}`, 'auth')}
    ${section('Scopes 与接口', table(['Method', '相对路径', 'Scope', '说明'], externalRows.map((row) => [row[0], inlineCode(row[1]), inlineCode(row[2]), row[3]])), 'endpoints')}
    ${section('用户代发', '<p>需要 <code>users:impersonate</code> 时，可显式指定 <code>user_id</code>、<code>mindauth_id</code> 或 <code>username</code> 之一；未指定时使用 Key 的默认用户。被封禁用户不能被代发。</p>', 'actor')}
    ${callout('warning', '仅服务器端使用', '不要将 External API Key 嵌入 Mod、APK、启动器或浏览器前端。需要终端用户身份时，应使用相应的客户端认证流程。')}
  `;

  return {
    'quick-start': { title: '快速开始', description: 'MDTBBS API 快速开始', body: quickStart },
    conventions: { title: '通用约定', description: 'MDTBBS API 响应、兼容与限流约定', body: conventions },
    oauth: { title: 'OAuth / Public Client', description: 'MindAuth Public Client OAuth、PKCE 与 scopes', body: oauth },
    authentication: { title: '身份认证', description: 'MDTBBS API 认证方式', body: authentication },
    'first-party': { title: 'First-party V1', description: 'MDTBBS First-party API V1', body: firstParty },
    'game-content': { title: 'Game Content', description: 'MDTBBS Game Content API', body: gameContent },
    resources: { title: 'Resource V1', description: 'MDTBBS Resource API V1', body: resources },
    external: { title: 'External API', description: 'MDTBBS External API', body: external },
  };
}

function hasSecurity(operation: any): boolean {
  return Array.isArray(operation?.security) && operation.security.length > 0;
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

function codeTabs(samples: Record<CodeLanguage, string>): string {
  const labels: Array<[CodeLanguage, string]> = [
    ['curl', 'curl'],
    ['javascript', 'JavaScript'],
    ['typescript', 'TypeScript'],
    ['java', 'Java'],
    ['kotlin', 'Kotlin'],
  ];
  return `<div class="code-example"><div class="code-tabs" role="tablist">${labels.map(([key, label], index) => `<button type="button" data-code-tab="${key}" aria-selected="${index === 0 ? 'true' : 'false'}">${label}</button>`).join('')}</div>${labels.map(([key], index) => `<pre data-code-lang="${key}" data-active="${index === 0 ? 'true' : 'false'}><code>${escapeHtml(samples[key])}</code></pre>`).join('')}</div>`;
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
  const resolved = resolveSchema(document, schema) || {};
  const notes: string[] = [];
  if (Array.isArray(resolved.enum)) notes.push(`可选：${resolved.enum.map((item: unknown) => String(item)).join(' / ')}`);
  if (resolved.minLength != null) notes.push(`最短 ${resolved.minLength}`);
  if (resolved.maxLength != null) notes.push(`最长 ${resolved.maxLength}`);
  if (resolved.minimum != null) notes.push(`最小 ${resolved.minimum}`);
  if (resolved.maximum != null) notes.push(`最大 ${resolved.maximum}`);
  if (resolved.default != null) notes.push(`默认 ${String(resolved.default)}`);
  if (resolved.description) notes.push(String(resolved.description));
  return notes.join('；');
}

function renderRequestBody(document: OpenAPIObject, operation: any): string {
  const requestBody = operation?.requestBody;
  if (!requestBody) return '';

  const content = requestBody.content || {};
  const contentType = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded']
    .find((type) => content[type]) || Object.keys(content)[0];
  if (!contentType) return '<h3>请求体</h3><p>该接口需要请求体，具体格式见 OpenAPI JSON。</p>';

  const schema = flattenObjectSchema(document, content[contentType]?.schema);
  if (!schema) return `<h3>请求体</h3><p>Content-Type：${inlineCode(contentType)}</p>`;

  const properties = schema.properties || {};
  const propertyEntries = Object.entries(properties);
  if (!propertyEntries.length) {
    return `<h3>请求体</h3><p>Content-Type：${inlineCode(contentType)}；类型：${inlineCode(schemaType(document, schema))}</p>`;
  }

  const required = new Set<string>(schema.required || []);
  const rows = propertyEntries.map(([name, property]: [string, any]) => [
    inlineCode(name),
    inlineCode(schemaType(document, property)),
    required.has(name) ? '是' : '否',
    escapeHtml(schemaNotes(document, property)),
  ]);

  return `<h3>请求体</h3><p>Content-Type：${inlineCode(contentType)}</p>${table(['字段', '类型', '必填', '说明 / 限制'], rows)}`;
}

function renderResponses(operation: any): string {
  const responses = operation?.responses || {};
  const rows = Object.entries(responses).map(([status, response]: [string, any]) => [
    inlineCode(status),
    escapeHtml(response?.description || ''),
  ]);
  return rows.length ? `<h3>响应</h3>${table(['状态', '说明'], rows)}` : '';
}

function operationSearchText(method: string, path: string, operation: any): string {
  return [method, path, operation?.summary, operation?.description, ...(operation?.tags || [])]
    .filter(Boolean).join(' ').toLowerCase();
}

function renderReference(document: OpenAPIObject, forumVersion: string): string {
  const endpoints: string[] = [];
  for (const [path, pathItem] of Object.entries(document.paths || {})) {
    for (const method of METHOD_ORDER) {
      const operation = (pathItem as any)?.[method];
      if (!operation) continue;
      const samples = makeCodeSamples(method, path, operation);
      const securityBadge = hasSecurity(operation) ? '<span class="badge">Bearer 认证</span>' : '';
      endpoints.push(`
        <article class="endpoint" data-endpoint-search="${escapeHtml(operationSearchText(method, path, operation))}">
          <div class="endpoint-head">
            <span class="method ${method}">${method.toUpperCase()}</span>
            <span class="endpoint-path">/api${escapeHtml(path)}</span>
          </div>
          <p class="endpoint-summary">${escapeHtml(operation.summary || operation.description || '公开 V1 接口')}</p>
          <div class="meta-line">${securityBadge}${(operation.tags || []).map((tag: string) => `<span class="badge">${escapeHtml(tag)}</span>`).join('')}</div>
          ${renderParameters(operation)}
          ${renderRequestBody(document, operation)}
          ${renderResponses(operation)}
          <h3>代码示例</h3>
          ${codeTabs(samples)}
        </article>`);
    }
  }

  const body = `
    <div class="eyebrow">OpenAPI</div><h1>API Reference</h1>
    <p class="lead">本页从运行时 First-party V1 OpenAPI 契约生成，不提供在线 Try it。路径统一以 <code>https://mdtbbs.cn/api</code> 为服务器根地址；请求体字段、必填项、枚举和常见长度限制会直接展开。</p>
    <input class="reference-filter" data-reference-filter type="search" placeholder="搜索路径、方法或说明…" aria-label="搜索 API">
    ${endpoints.join('')}
    ${callout('info', '需要完整 Schema？', '机器可读规范位于 <a href="/api/openapi/v1.json"><code>/api/openapi/v1.json</code></a>。')}
  `;

  return commonShell({
    title: 'API Reference',
    description: 'MDTBBS First-party V1 API Reference',
    body,
    forumVersion,
    activePath: '/api/v1/reference',
    toc: [{ href: '#', label: `${endpoints.length} 个接口` }],
  });
}

export function registerDeveloperDocs(
  app: INestApplication,
  document: OpenAPIObject,
  forumVersion: string,
): void {
  const adapter = app.getHttpAdapter();

  adapter.get('/api/v1', (_req: any, res: any) => {
    const html = renderHome(forumVersion);
    setHtmlHeaders(res, html);
    res.status(200).send(html);
  });

  adapter.get('/api/v1/docs/:slug', (req: any, res: any) => {
    const page = guidePages()[req.params?.slug];
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
    });
    setHtmlHeaders(res, html);
    res.status(200).send(html);
  });

  adapter.get('/api/v1/reference', (_req: any, res: any) => {
    const html = renderReference(document, forumVersion);
    setHtmlHeaders(res, html);
    res.status(200).send(html);
  });
}
