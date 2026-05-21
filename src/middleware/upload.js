const { koaBody } = require('koa-body');

const avatarUpload = koaBody({
  multipart: true,
  formidable: {
    maxFileSize: 2 * 1024 * 1024, // 2MB
    maxFields: 1,
  },
  parsedMethods: ['POST'],
});

const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  // Documents
  'application/pdf',
  // Archives
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
  // Text
  'text/plain', 'text/markdown',
]);

const attachmentUpload = koaBody({
  multipart: true,
  formidable: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxFields: 5,
    filter: (meta) => ALLOWED_MIME_TYPES.has(meta.mime),
  },
  parsedMethods: ['POST'],
});

module.exports = { avatarUpload, attachmentUpload };
