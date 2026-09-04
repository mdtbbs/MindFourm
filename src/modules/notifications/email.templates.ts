export const EMAIL_LAYOUT_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 0; background: #f5f7fb; color: #1f2937; }
    .container { max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #dbe5f1; border-radius: 12px; overflow: hidden; }
    .header { padding: 24px; background: linear-gradient(135deg, #2f80ed 0%, #5aa1ff 100%); color: #ffffff; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .content { padding: 28px 24px; line-height: 1.7; color: #334155; }
    .content h1, .content h2, .content h3, .content h4 { color: #0f172a; margin: 0 0 12px; }
    .content p, .content ul, .content ol, .content blockquote { margin: 0 0 16px; }
    .content a { color: #2f80ed; text-decoration: none; }
    .content a:hover { text-decoration: underline; }
    .content blockquote { margin: 16px 0; padding: 12px 16px; background: #f5f8ff; border-left: 4px solid #2f80ed; color: #475569; }
    .content pre, .content code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .content pre { overflow-x: auto; padding: 12px 14px; background: #0f172a; color: #e2e8f0; border-radius: 8px; }
    .content code { padding: 0.15em 0.35em; background: #eaf2ff; border-radius: 4px; }
    .content pre code { padding: 0; background: transparent; }
    .button-link {
      display: inline-block;
      margin-top: 8px;
      padding: 12px 18px;
      background: #2f80ed;
      color: #ffffff !important;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
    }
    .footer { padding: 16px 24px 24px; background: #f8fafc; color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; }
    .footer p { margin: 0 0 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{site_name}}</h1>
    </div>
    <div class="content">
      {{{content_html}}}
    </div>
    <div class="footer">
      <p>此邮件由系统自动发送，请勿直接回复。</p>
      {{#if preferences_url}}
      <p>如需调整收件偏好，请前往 <a href="{{preferences_url}}">通知设置</a>。</p>
      {{/if}}
      <p>© {{year}} {{site_name}}</p>
    </div>
  </div>
</body>
</html>`;

export const DEFAULT_WELCOME_NOTIFICATION_TITLE = '欢迎来到 {{site_name}}';

export const DEFAULT_WELCOME_NOTIFICATION_BODY = `你好，**{{username}}**！

欢迎加入 {{site_name}}，这里是一个以帖子讨论和资源分享为核心的社区。

- 浏览你感兴趣的版块和资源
- 完善个人资料，方便大家认识你
- 遇到好内容时，记得回复、收藏或点赞

祝你在这里玩得开心。`;

type EmailPreferenceKey = 'reply_email' | 'mention_email' | 'message_email' | 'system_email';

interface EmailTemplateConfig {
  enabledSettingKey: string;
  subjectSettingKey: string;
  bodySettingKey: string;
  preferenceKey: EmailPreferenceKey;
  defaultEnabled: boolean;
  defaultSubject: string;
  defaultBody: string;
}

export const EMAIL_TEMPLATE_DEFAULTS = {
  reply: {
    enabledSettingKey: 'email_reply_enabled',
    subjectSettingKey: 'email_template_reply_subject',
    bodySettingKey: 'email_template_reply_body',
    preferenceKey: 'reply_email',
    defaultEnabled: true,
    defaultSubject: '[{{site_name}}] 有人回复了你的帖子',
    defaultBody: `你好，{{username}}！

**{{actor_name}}** 回复了你的帖子 **[{{post_title}}]({{post_url}})**。

> {{reply_excerpt}}

{{#if action_url}}[{{action_label}}]({{action_url}}){{/if}}`,
  },
  mention: {
    enabledSettingKey: 'email_mention_enabled',
    subjectSettingKey: 'email_template_mention_subject',
    bodySettingKey: 'email_template_mention_body',
    preferenceKey: 'mention_email',
    defaultEnabled: true,
    defaultSubject: '[{{site_name}}] 有人提到了你',
    defaultBody: `你好，{{username}}！

**{{actor_name}}** 在帖子 **[{{post_title}}]({{post_url}})** 中提到了你。

> {{mention_excerpt}}

{{#if action_url}}[{{action_label}}]({{action_url}}){{/if}}`,
  },
  message: {
    enabledSettingKey: 'email_message_enabled',
    subjectSettingKey: 'email_template_message_subject',
    bodySettingKey: 'email_template_message_body',
    preferenceKey: 'message_email',
    defaultEnabled: true,
    defaultSubject: '[{{site_name}}] {{sender_name}} 给你发了私信',
    defaultBody: `你好，{{username}}！

你收到了来自 **{{sender_name}}** 的一条私信。

> {{message_excerpt}}

{{#if action_url}}[{{action_label}}]({{action_url}}){{/if}}`,
  },
  system: {
    enabledSettingKey: 'email_system_enabled',
    subjectSettingKey: 'email_template_system_subject',
    bodySettingKey: 'email_template_system_body',
    preferenceKey: 'system_email',
    defaultEnabled: true,
    defaultSubject: '[{{site_name}}] 系统通知',
    defaultBody: `你好，{{username}}！

{{content}}

{{#if action_url}}[{{action_label}}]({{action_url}}){{/if}}`,
  },
  welcome: {
    enabledSettingKey: 'email_welcome_enabled',
    subjectSettingKey: 'email_template_welcome_subject',
    bodySettingKey: 'email_template_welcome_body',
    preferenceKey: 'system_email',
    defaultEnabled: true,
    defaultSubject: '[{{site_name}}] 欢迎加入社区',
    defaultBody: `{{content}}

{{#if action_url}}[{{action_label}}]({{action_url}}){{/if}}`,
  },
} as const satisfies Record<string, EmailTemplateConfig>;

export type EmailTemplateEventKey = keyof typeof EMAIL_TEMPLATE_DEFAULTS;
