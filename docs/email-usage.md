# Email System Implementation

This document provides usage examples for the email system.

## Overview

The email system consists of:
- **TemplateService**: Handlebars-based template rendering with conditionals support
- **EmailService**: SMTP email sending via nodemailer
- **EmailQueueService**: Asynchronous email queue with retry logic
- **Email Templates**: Pre-built templates for reply, mention, message, and system notifications

## Setup

### 1. Configure SMTP Settings

Email settings are stored in the `settings` table with category 'email':

```sql
INSERT INTO settings (key, value, category, description) VALUES
('smtp_host', 'smtp.example.com', 'email', 'SMTP server host'),
('smtp_port', '587', 'email', 'SMTP server port'),
('smtp_user', 'your-username', 'email', 'SMTP username'),
('smtp_password', 'your-password', 'email', 'SMTP password'),
('smtp_from', 'noreply@yourforum.com', 'email', 'Email sender address'),
('smtp_secure', 'true', 'email', 'Use TLS/SSL');
```

Or use the admin settings API:
```typescript
PUT /api/admin/settings/email
{
  "smtp_host": "smtp.example.com",
  "smtp_port": "587",
  "smtp_user": "your-username",
  "smtp_password": "your-password",
  "smtp_from": "noreply@yourforum.com",
  "smtp_secure": "true"
}
```

## Usage Examples

### Basic Email Sending

```typescript
import { EmailService } from './email.service';

@Injectable()
export class MyService {
  constructor(private emailService: EmailService) {}

  async sendWelcomeEmail(user: User) {
    const isConfigured = await this.emailService.isConfigured();
    if (!isConfigured) {
      console.log('Email not configured, skipping');
      return;
    }

    await this.emailService.sendMail({
      to: user.email,
      subject: 'Welcome to the forum!',
      html: '<h1>Welcome!</h1><p>Thanks for joining.</p>',
      text: 'Welcome! Thanks for joining.',
    });
  }
}
```

### Using Templates with Handlebars

```typescript
import { TemplateService } from './template.service';

@Injectable()
export class MyService {
  constructor(private templateService: TemplateService) {}

  async renderEmail() {
    const template = `
      <h1>Hello {{username}}!</h1>
      {{#if hasNewMessages}}
        <p>You have {{messageCount}} new messages.</p>
      {{else}}
        <p>No new messages.</p>
      {{/if}}
    `;

    const html = this.templateService.render(template, {
      username: 'John',
      hasNewMessages: true,
      messageCount: 5,
    });

    // Result: <h1>Hello John!</h1><p>You have 5 new messages.</p>
  }
}
```

### Using Pre-built Email Templates

```typescript
import { EmailService } from './email.service';
import { EMAIL_TEMPLATES } from './email.templates';

@Injectable()
export class NotificationsService {
  constructor(
    private emailService: EmailService,
    private settingsService: SettingsService,
  ) {}

  async sendReplyNotification(
    user: User,
    actorName: string,
    postTitle: string,
    postUrl: string,
    replyExcerpt: string,
  ) {
    const siteName = await this.settingsService.get('site_name') || 'MindFourm';
    const siteUrl = await this.settingsService.get('site_url') || 'http://localhost:3000';

    await this.emailService.sendTemplateEmail(
      user.email,
      `[${siteName}] 有人回复了你的帖子`,
      EMAIL_TEMPLATES.reply,
      {
        username: user.username,
        actor_name: actorName,
        post_title: postTitle,
        post_url: postUrl,
        reply_excerpt: replyExcerpt,
        preferences_url: `${siteUrl}/settings`,
        site_name: siteName,
        year: new Date().getFullYear(),
      },
    );
  }
}
```

### Using Email Queue for Async Sending

```typescript
import { EmailQueueService } from './email-queue.service';
import { EMAIL_TEMPLATES } from './email.templates';

@Injectable()
export class NotificationsService {
  constructor(
    private emailQueueService: EmailQueueService,
    private templateService: TemplateService,
    private settingsService: SettingsService,
  ) {}

  async notifyMention(
    user: User,
    actorName: string,
    postTitle: string,
    postUrl: string,
    mentionExcerpt: string,
  ) {
    const siteName = await this.settingsService.get('site_name') || 'MindFourm';
    const siteUrl = await this.settingsService.get('site_url') || 'http://localhost:3000';

    // Render template
    const html = this.templateService.render(EMAIL_TEMPLATES.mention, {
      username: user.username,
      actor_name: actorName,
      post_title: postTitle,
      post_url: postUrl,
      mention_excerpt: mentionExcerpt,
      preferences_url: `${siteUrl}/settings`,
      site_name: siteName,
      year: new Date().getFullYear(),
    });

    // Add to queue - non-blocking
    await this.emailQueueService.addEmailJob({
      to: user.email,
      subject: `[${siteName}] 有人提及了你`,
      html,
    });
  }
}
```

### Custom Handlebars Helpers

```typescript
import { TemplateService } from './template.service';

@Injectable()
export class MyService {
  constructor(private templateService: TemplateService) {
    // Register a custom helper
    this.templateService.registerHelper('uppercase', (str: string) => {
      return str.toUpperCase();
    });
  }

  renderCustomTemplate() {
    const template = '<p>{{uppercase username}}</p>';
    const html = this.templateService.render(template, { username: 'john' });
    // Result: <p>JOHN</p>
  }
}
```

### Built-in Helpers

The TemplateService includes these built-in helpers:
- `eq` - Equality check: `{{#if (eq value1 value2)}}`
- `ne` - Not equal: `{{#if (ne value1 value2)}}`
- `formatDate` - Format dates: `{{formatDate date 'short'}}`
- `truncate` - Truncate strings: `{{truncate text 50}}`

## Email Templates

Available pre-built templates:
- `EMAIL_TEMPLATES.reply` - New reply notification
- `EMAIL_TEMPLATES.mention` - @mention notification
- `EMAIL_TEMPLATES.message` - Private message notification
- `EMAIL_TEMPLATES.system` - System notification with optional action URL

All templates support:
- `{{username}}` - Recipient username
- `{{site_name}}` - Forum name
- `{{year}}` - Current year
- `{{preferences_url}}` - User preferences link
- `{{#if action_url}}...{{/if}}` - Conditional content

## Testing

To test email sending without SMTP:

```typescript
// Check if email is configured
const isConfigured = await this.emailService.isConfigured();
if (!isConfigured) {
  // Log instead of sending
  console.log('Email would be sent to:', user.email);
  return;
}
```

## Migration from Simple Regex

If migrating from simple regex replacement:

**Old approach (simple regex):**
```typescript
let html = template;
for (const [key, value] of Object.entries(variables)) {
  html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
}
```

**New approach (Handlebars):**
```typescript
const html = this.templateService.render(template, variables);
```

The new approach supports all Handlebars features including conditionals, loops, and helpers.