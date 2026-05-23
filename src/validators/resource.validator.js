const Joi = require('joi');

const RESOURCE_SCHEMA = Joi.object({
  title: Joi.string().required().min(2).max(200),
  description: Joi.string().allow('').max(2000),
  resource_type: Joi.string().valid('file', 'external').default('file'),
  version: Joi.string().allow('').max(50),
  content: Joi.string().allow('').max(50000),
  category_id: Joi.number().integer().positive().allow(null),
  is_public: Joi.boolean().default(true),
  external_url: Joi.string().uri().allow('').when('resource_type', {
    is: 'external',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().allow(''),
  }),
});

const RESOURCE_UPDATE_SCHEMA = Joi.object({
  title: Joi.string().min(2).max(200),
  description: Joi.string().allow('').max(2000),
  version: Joi.string().allow('').max(50),
  content: Joi.string().allow('').max(50000),
  category_id: Joi.number().integer().positive().allow(null),
  is_public: Joi.boolean(),
  external_url: Joi.string().uri().allow(''),
});

const CATEGORY_SCHEMA = Joi.object({
  name: Joi.string().required().min(1).max(50),
  slug: Joi.string().required().min(1).max(50).pattern(/^[a-z0-9一-龥-]+$/),
  description: Joi.string().allow('').max(200),
  icon: Joi.string().allow('').max(50),
  sort_order: Joi.number().integer().default(0),
  is_active: Joi.boolean().default(true),
});

const VERSION_SCHEMA = Joi.object({
  version: Joi.string().required().min(1).max(50),
  file_path: Joi.string().allow(''),
});

module.exports = {
  RESOURCE_SCHEMA,
  RESOURCE_UPDATE_SCHEMA,
  CATEGORY_SCHEMA,
  VERSION_SCHEMA,
};