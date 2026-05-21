const nodemailer = require('nodemailer');
const SettingService = require('./setting.service');
const LogService = require('./log.service');
const { LOG_ACTIONS } = require('../utils/constants');

let transporter = null;
let lastConfig = null;

function getTransporter() {
  const settings = SettingService.getAll();
  const smtpHost = settings.smtp_host;
  const smtpPort = settings.smtp_port;
  const smtpUser = settings.smtp_user;
  const smtpPass = settings.smtp_pass;
  const smtpFrom = settings.smtp_from;

  if (!smtpHost || !smtpUser || !smtpPass) return null;

  const configKey = `${smtpHost}:${smtpPort}:${smtpUser}`;
  if (transporter && configKey === lastConfig) return transporter;

  transporter = nodemailer.createTransport({
    host: smtpHost,
    port: parseInt(smtpPort) || 587,
    secure: parseInt(smtpPort) === 465,
    auth: { user: smtpUser, pass: smtpPass },
  });
  lastConfig = configKey;
  return transporter;
}

function buildEmailHtml(type, data) {
  const templates = {
    reply: `
      <p><strong>${data.actor_name}</strong> 回复了你的帖子 <strong>${data.post_title}</strong></p>
      <blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#666;margin:12px 0;">
        ${data.content || ''}
      </blockquote>
      <p><a href="${data.post_url}">查看回复</a></p>
    `,
    mention: `
      <p><strong>${data.actor_name}</strong> 在帖子中提到了你</p>
      <blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#666;margin:12px 0;">
        ${data.content || ''}
      </blockquote>
      <p><a href="${data.post_url}">查看详情</a></p>
    `,
    message: `
      <p><strong>${data.actor_name}</strong> 给你发了一条私信</p>
      <blockquote style="border-left:3px solid #ddd;padding-left:12px;color:#666;margin:12px 0;">
        ${data.content || ''}
      </blockquote>
      <p><a href="${data.post_url}">查看私信</a></p>
    `,
    verify: `
      <p>请使用以下验证码完成注册：</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:8px;margin:20px 0;">${data.code}</p>
      <p>此验证码 10 分钟内有效。</p>
    `,
  };

  const settings = SettingService.getAll();
  const siteName = settings.site_name || 'MindForum';

  return `
    <div style="max-width:600px;margin:0 auto;font-family:system-ui,sans-serif;padding:20px;">
      <h2 style="color:#4f46e5;border-bottom:2px solid #4f46e5;padding-bottom:8px;">${siteName}</h2>
      <div style="margin:20px 0;line-height:1.6;color:#333;">${templates[type] || ''}</div>
      <p style="color:#999;font-size:12px;border-top:1px solid #eee;padding-top:12px;">
        此邮件由系统自动发送，请勿直接回复。
      </p>
    </div>
  `;
}

class EmailService {
  static async send(to, type, data) {
    const transport = getTransporter();
    if (!transport) return;

    const settings = SettingService.getAll();
    const from = settings.smtp_from || settings.smtp_user;
    const siteName = settings.site_name || 'MindForum';

    const subjects = {
      reply: `[${siteName}] 收到新回复`,
      mention: `[${siteName}] 你被提及了`,
      message: `[${siteName}] 收到新私信`,
      verify: `[${siteName}] 注册验证码`,
    };

    const html = buildEmailHtml(type, data);

    setImmediate(async () => {
      try {
        await transport.sendMail({ from, to, subject: subjects[type] || siteName, html });
        LogService.log({ action: LOG_ACTIONS.EMAIL_SENT, details: { to, type } });
      } catch (e) {
        LogService.log({ action: LOG_ACTIONS.EMAIL_FAILED, details: { to, type, error: e.message } });
      }
    });
  }
}

module.exports = EmailService;
