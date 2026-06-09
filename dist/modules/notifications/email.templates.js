"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_TEMPLATES = exports.SYSTEM_EMAIL_CONTENT = exports.MESSAGE_EMAIL_CONTENT = exports.MENTION_EMAIL_CONTENT = exports.REPLY_EMAIL_CONTENT = exports.BASE_EMAIL_LAYOUT = void 0;
exports.compileEmailTemplate = compileEmailTemplate;
exports.BASE_EMAIL_LAYOUT = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* Inline styles for email client compatibility */
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); padding: 20px; text-align: center; color: #fff; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 24px; line-height: 1.6; color: #333; }
    .footer { background: #f5f5f5; padding: 16px; text-align: center; font-size: 12px; color: #666; }
    .button { display: inline-block; padding: 12px 24px; background: #ff6b35; color: #fff; text-decoration: none; border-radius: 4px; font-weight: 500; }
    .button:hover { background: #e55a2b; }
    .link { color: #ff6b35; text-decoration: underline; }
    .excerpt { background: #f5f5f5; padding: 16px; border-left: 4px solid #ff6b35; margin: 16px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{site_name}}</h1>
    </div>
    <div class="content">
      {{> content}}
    </div>
    <div class="footer">
      <p>此邮件由系统自动发送,请勿直接回复。</p>
      {{#if preferences_url}}
      <p>如果要退订此类通知,请前往 <a href="{{preferences_url}}" class="link">邮件偏好设置</a></p>
      {{/if}}
      <p>© {{year}} {{site_name}}</p>
    </div>
  </div>
</body>
</html>`;
exports.REPLY_EMAIL_CONTENT = `<p>你好,{{username}}!</p>

<p><strong>{{actor_name}}</strong> 回复了你的帖子:</p>

<h2><a href="{{post_url}}" style="color: #ff6b35;">{{post_title}}</a></h2>

<div class="excerpt">
  {{reply_excerpt}}
</div>

<p><a href="{{post_url}}" class="button">查看完整回复</a></p>`;
exports.MENTION_EMAIL_CONTENT = `<p>你好,{{username}}!</p>

<p><strong>{{actor_name}}</strong> 在帖子中提及了你:</p>

<h2><a href="{{post_url}}" style="color: #ff6b35;">{{post_title}}</a></h2>

<div class="excerpt" style="border-left-color: #f59e0b;">
  {{mention_excerpt}}
</div>

<p><a href="{{post_url}}" class="button">查看完整内容</a></p>`;
exports.MESSAGE_EMAIL_CONTENT = `<p>你好,{{username}}!</p>

<p>你收到了一条来自 <strong>{{sender_name}}</strong> 的私信:</p>

<div class="excerpt" style="border-left-color: #22c55e;">
  {{message_excerpt}}
</div>

<p><a href="{{message_url}}" class="button">查看私信</a></p>`;
exports.SYSTEM_EMAIL_CONTENT = `<p>你好,{{username}}!</p>

<h2>{{title}}</h2>

<p>{{content}}</p>

{{#if action_url}}
<p><a href="{{action_url}}" class="button">前往处理</a></p>
{{/if}}`;
function compileEmailTemplate(content) {
    return exports.BASE_EMAIL_LAYOUT.replace('{{> content}}', content);
}
exports.EMAIL_TEMPLATES = {
    reply: compileEmailTemplate(exports.REPLY_EMAIL_CONTENT),
    mention: compileEmailTemplate(exports.MENTION_EMAIL_CONTENT),
    message: compileEmailTemplate(exports.MESSAGE_EMAIL_CONTENT),
    system: compileEmailTemplate(exports.SYSTEM_EMAIL_CONTENT),
};
//# sourceMappingURL=email.templates.js.map