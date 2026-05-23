const Response = require('../utils/response');
const TagService = require('../services/tag.service');

class TagController {
  static async list(ctx) {
    const tags = await TagService.getAll();
    Response.success(ctx, tags);
  }

  static async getPostsByTag(ctx) {
    const { slug } = ctx.params;
    const { page, limit } = ctx.query;

    const result = await TagService.getPostsByTagSlug(slug, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20
    });

    Response.paginated(ctx, result.data, result.pagination);
  }
}

module.exports = TagController;