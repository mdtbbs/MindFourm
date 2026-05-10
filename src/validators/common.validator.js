const POST_SCHEMA = {
  title: { required: true, type: 'string', minLength: 1, maxLength: 200 },
  content: { required: true, type: 'string', minLength: 1 },
  category_id: { type: 'number' },
  status: { enum: ['draft', 'published'] }
};

const REPLY_SCHEMA = {
  content: { required: true, type: 'string', minLength: 1, maxLength: 10000 },
  parent_reply_id: { type: 'number' }
};

const CATEGORY_SCHEMA = {
  name: { required: true, type: 'string', minLength: 1, maxLength: 50 },
  slug: { required: true, type: 'string', minLength: 1, maxLength: 50 },
  sort_order: { type: 'number' }
};

const ROLE_SCHEMA = {
  role: { required: true, enum: ['guest', 'user', 'moderator', 'admin'] }
};

module.exports = {
  POST_SCHEMA,
  REPLY_SCHEMA,
  CATEGORY_SCHEMA,
  ROLE_SCHEMA
};