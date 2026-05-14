const { koaBody } = require('koa-body');

const avatarUpload = koaBody({
  multipart: true,
  formidable: {
    maxFileSize: 2 * 1024 * 1024, // 2MB
    maxFields: 1,
  },
  parsedMethods: ['POST'],
});

module.exports = { avatarUpload };
