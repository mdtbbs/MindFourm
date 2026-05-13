const SettingService = require('../services/setting.service');

const BASE_POST_SCHEMA = {
  title: { required: true, type: 'string' },
  content: { required: true, type: 'string' },
  category_id: { type: 'number' },
  status: { enum: ['draft', 'published'] },
  tags: { type: 'array' }
};

const BASE_REPLY_SCHEMA = {
  content: { required: true, type: 'string', maxLength: 10000 },
  parent_reply_id: { type: 'number' }
};

function getPostSchema() {
  return {
    ...BASE_POST_SCHEMA,
    title: {
      ...BASE_POST_SCHEMA.title,
      minLength: SettingService.getNumber('title_min_length') ?? 1,
      maxLength: SettingService.getNumber('title_max_length') ?? 200,
    },
    content: {
      ...BASE_POST_SCHEMA.content,
      minLength: SettingService.getNumber('content_min_length') ?? 10,
    },
    tags: {
      ...BASE_POST_SCHEMA.tags,
      maxItems: SettingService.getNumber('max_tags_per_post') ?? 5,
      itemMaxLength: SettingService.getNumber('max_tag_length') ?? 30,
    }
  };
}

function getReplySchema() {
  return {
    ...BASE_REPLY_SCHEMA,
    content: {
      ...BASE_REPLY_SCHEMA.content,
      minLength: SettingService.getNumber('content_min_length') ?? 10,
    }
  };
}

const CATEGORY_SCHEMA = {
  name: { required: true, type: 'string', minLength: 1, maxLength: 50 },
  slug: { required: true, type: 'string', minLength: 1, maxLength: 50 },
  sort_order: { type: 'number' }
};

const ROLE_SCHEMA = {
  role: { required: true, enum: ['guest', 'user', 'moderator', 'admin'] }
};

module.exports = {
  getPostSchema,
  getReplySchema,
  CATEGORY_SCHEMA,
  ROLE_SCHEMA
};