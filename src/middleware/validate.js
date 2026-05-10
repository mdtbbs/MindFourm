const Response = require('../utils/response');

function validate(schema) {
  return async (ctx, next) => {
    const data = ctx.request.method === 'GET' ? ctx.query : ctx.request.body;
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = data[field];

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value !== undefined && value !== null) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`${field} must be ${rules.type}`);
        }

        if (rules.minLength && typeof value === 'string' && value.length < rules.minLength) {
          errors.push(`${field} must be at least ${rules.minLength} characters`);
        }

        if (rules.maxLength && typeof value === 'string' && value.length > rules.maxLength) {
          errors.push(`${field} must be at most ${rules.maxLength} characters`);
        }

        if (rules.min && typeof value === 'number' && value < rules.min) {
          errors.push(`${field} must be at least ${rules.min}`);
        }

        if (rules.max && typeof value === 'number' && value > rules.max) {
          errors.push(`${field} must be at most ${rules.max}`);
        }

        if (rules.enum && !rules.enum.includes(value)) {
          errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
        }

        if (rules.custom && !rules.custom(value)) {
          errors.push(`${field} validation failed`);
        }
      }
    }

    if (errors.length > 0) {
      Response.error(ctx, 'Validation failed', 400, errors);
      return;
    }

    return next();
  };
}

module.exports = { validate };