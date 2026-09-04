# 邮件系统设计

> 本文档记录了论坛系统的邮件设计方案。
> 创建时间: 2026-06-07

## 邮件架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        邮件系统                                    │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ SMTP     │  │ Template │  │ 发送     │  │ 用户偏好     │   │
│  │ 配置     │  │ 引擎     │  │ 队列     │  │ 管理         │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## SMTP 配置

### 系统设置
```sql
INSERT INTO settings (key, value, category, is_public) VALUES
('smtp_host', '', 'email', FALSE),
('smtp_port', '587', 'email', FALSE),
('smtp_user', '', 'email', FALSE),
('smtp_password', '', 'email', FALSE),
('smtp_from', 'noreply@mindforum.com', 'email', FALSE),
('smtp_secure', 'true', 'email', FALSE);
```

### 邮件服务实现
```typescript
// modules/notifications/email.service.ts
@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private settingsService: SettingsService) {}

  private async initTransporter(): Promise<void> {
    const config = await this.settingsService.getCategorySettings('email');
    
    this.transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: parseInt(config.smtp_port),
      secure: config.smtp_secure === 'true',
      auth: {
        user: config.smtp_user,
        pass: config.smtp_password,
      },
    });
  }

  async sendMail(options: MailOptions): Promise<void> {
    if (!this.transporter) {
      await this.initTransporter();
    }

    await this.transporter.sendMail({
      from: await this.settingsService.get('smtp_from'),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text, // 纯文本备选
    });
  }
}
```

---

## 邮件模板引擎

### 模板结构
所有邮件模板基于统一的 HTML 布局：

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* 内联样式，确保邮件客户端兼容 */
    body { font-family: system-ui, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; overflow: hidden; }
    .header { background: #3b82f6; padding: 20px; text-align: center; color: #fff; }
    .content { padding: 24px; line-height: 1.6; color: #333; }
    .footer { background: #f5f5f5; padding: 16px; text-align: center; font-size: 12px; color: #666; }
    .button { display: inline-block; padding: 12px 24px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 4px; }
    .link { color: #3b82f6; text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{site_name}}</h1>
    </div>
    <div class="content">
      {{content}}
    </div>
    <div class="footer">
      <p>此邮件由系统自动发送，请勿直接回复。</p>
      <p>如果要退订此类通知，请前往 <a href="{{preferences_url}}" class="link">邮件偏好设置</a></p>
      <p>© {{year}} {{site_name}}</p>
    </div>
  </div>
</body>
</html>
```

### 模板渲染服务
```typescript
// modules/notifications/template.service.ts
@Injectable()
export class TemplateService {
  render(template: string, variables: Record<string, any>): string {
    let html = template;
    
    for (const [key, value] of Object.entries(variables)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
    }

    return html;
  }
}
```

---

## 邮件模板

### 1. 新回复通知邮件
```html
<!-- 内容部分 -->
<p>你好，{{username}}！</p>

<p>{{actor_name}} 回复了你的帖子：</p>

<h2><a href="{{post_url}}" style="color: #3b82f6;">{{post_title}}</a></h2>

<div style="background: #f5f5f5; padding: 16px; border-left: 4px solid #3b82f6; margin: 16px 0;">
  {{reply_excerpt}}
</div>

<p><a href="{{post_url}}" class="button">查看完整回复</a></p>
```

### 2. @提及通知邮件
```html
<!-- 内容部分 -->
<p>你好，{{username}}！</p>

<p>{{actor_name}} 在帖子中提及了你：</p>

<h2><a href="{{post_url}}" style="color: #3b82f6;">{{post_title}}</a></h2>

<div style="background: #f5f5f5; padding: 16px; border-left: 4px solid #f59e0b; margin: 16px 0;">
  {{mention_excerpt}}
</div>

<p><a href="{{post_url}}" class="button">查看完整内容</a></p>
```

### 3. 私信通知邮件
```html
<!-- 内容部分 -->
<p>你好，{{username}}！</p>

<p>你收到了一条来自 {{sender_name}} 的私信：</p>

<div style="background: #f5f5f5; padding: 16px; border-left: 4px solid #22c55e; margin: 16px 0;">
  {{message_excerpt}}
</div>

<p><a href="{{message_url}}" class="button">查看私信</a></p>
```

### 4. 系统通知邮件
```html
<!-- 内容部分 -->
<p>你好，{{username}}！</p>

<h2>{{title}}</h2>

<p>{{content}}</p>

{{#if action_url}}
<p><a href="{{action_url}}" class="button">前往处理</a></p>
{{/if}}
```

---

## 邮件发送队列

### 队列实现（基于 Redis Bull）
```typescript
// modules/notifications/email-queue.service.ts
@Injectable()
export class EmailQueueService {
  private queue: Queue;

  constructor() {
    this.queue = new Queue('email-queue', {
      connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
      },
    });
  }

  async addEmailJob(job: EmailJob): Promise<void> {
    await this.queue.add('send-email', job, {
      attempts: 3,              // 最多重试 3 次
      backoff: { type: 'exponential', delay: 1000 }, // 指数退避
    });
  }

  // 处理器
  async process(job: Job<EmailJob>): Promise<void> {
    const { to, subject, html, text } = job.data;
    
    await this.emailService.sendMail({ to, subject, html, text });
  }
}
```

### 使用示例
```typescript
// 在通知服务中调用
async sendReplyNotification(reply: Reply, post: Post): Promise<void> {
  // 检查用户是否开启邮件通知
  const preference = await this.getUserEmailPreference(post.user_id);
  if (!preference.reply_email) return;

  // 获取收件人邮箱
  const user = await this.userService.findById(post.user_id);
  if (!user.email) return;

  // 渲染模板
  const html = this.templateService.render(replyEmailTemplate, {
    username: user.username,
    actor_name: reply.user.username,
    post_title: post.title,
    post_url: `${this.frontendUrl}/posts/${post.id}`,
    reply_excerpt: this.truncateHtml(reply.content_html, 200),
    preferences_url: `${this.frontendUrl}/settings`,
    site_name: await this.settingsService.get('site_name'),
    year: new Date().getFullYear(),
  });

  // 加入队列
  await this.emailQueueService.addEmailJob({
    to: user.email,
    subject: `[${siteName}] 有人回复了你的帖子`,
    html,
  });
}
```

---

## 用户邮件偏好管理

### 偏好设置
| 邮件类型 | 默认值 | 说明 |
|----------|--------|------|
| reply_email | true | 新回复通知 |
| mention_email | true | @提及通知 |
| message_email | true | 私信通知 |
| system_email | true | 系统通知 |
| digest_email | false | 每周精选 |

### 管理接口
```
GET  /api/notifications/email-preference  # 获取偏好设置
PUT  /api/notifications/email-preference  # 更新偏好设置
```

### 退订链接
每封邮件底部提供退订链接，点击后跳转到偏好设置页面，用户可自行关闭特定类型的邮件通知。

---

## 邮件发送统计

### 统计表
```sql
CREATE TABLE email_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT,
  email_type ENUM('reply', 'mention', 'message', 'system'),
  to_email VARCHAR(255),
  subject VARCHAR(255),
  status ENUM('sent', 'failed', 'bounced') DEFAULT 'sent',
  error_message TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 监控指标
| 指标 | 说明 |
|------|------|
| 发送成功率 | 成功发送数 / 总发送数 |
| 退信率 | 退信数 / 总发送数 |
| 平均延迟 | 从加入队列到发送完成的时间 |
