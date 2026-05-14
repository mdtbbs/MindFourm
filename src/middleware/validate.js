const Response = require('../utils/response');

function validate(schema) {
  return (ctx, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = ctx.request.body[field];

      if (rules.required && (value === undefined || value === null || (typeof value === 'string' && value.trim() === ''))) {
        errors.push({ field, message: `${field} is required` });
        continue;
      }

      if (value === undefined || value === null) {
        continue;
      }

      if (rules.type === 'string' && typeof value !== 'string') {
        errors.push({ field, message: `${field} must be a string` });
        continue;
      }

      if (rules.type === 'number' && typeof value !== 'number' && isNaN(Number(value))) {
        errors.push({ field, message: `${field} must be a number` });
        continue;
      }

      if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
        errors.push({ field, message: `${field} must be at least ${rules.minLength} characters` });
      }

      if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
        errors.push({ field, message: `${field} must be at most ${rules.maxLength} characters` });
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push({ field, message: `${field} must be one of: ${rules.enum.join(', ')}` });
      }

      if (rules.type === 'array' && !Array.isArray(value)) {
        errors.push({ field, message: `${field} must be an array` });
      }

      if (rules.type === 'array' && Array.isArray(value) && rules.maxItems && value.length > rules.maxItems) {
        errors.push({ field, message: `${field} must have at most ${rules.maxItems} items` });
      }

      if (rules.type === 'array' && Array.isArray(value) && rules.itemMaxLength) {
        value.forEach((item, i) => {
          if (typeof item === 'string' && item.length > rules.itemMaxLength) {
            errors.push({ field, message: `${field}[${i}] must be at most ${rules.itemMaxLength} characters` });
          }
        });
      }
    }

    if (errors.length > 0) {
      return Response.error(ctx, 'Validation failed', 422, 'VALIDATION_ERROR', errors);
    }

    return next();
  };
}

// Keep legacy exports for backward compatibility
function validatePost() {
  return validate(require('../validators/common.validator').getPostSchema());
}

function validateReply() {
  return validate(require('../validators/common.validator').getReplySchema());
}

function validateCategory() {
  return validate(require('../validators/common.validator').CATEGORY_SCHEMA);
}

module.exports = { validate, validatePost, validateReply, validateCategory };
