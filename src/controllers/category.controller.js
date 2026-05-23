const Response = require('../utils/response');
const CategoryService = require('../services/category.service');

class CategoryController {
  static async list(ctx) {
    const categories = await CategoryService.getAll();
    Response.success(ctx, categories);
  }

  static async getById(ctx) {
    const { id } = ctx.params;
    const category = await CategoryService.getById(parseInt(id));

    if (!category) {
      Response.notFound(ctx, 'Category not found');
      return;
    }

    Response.success(ctx, category);
  }
}

module.exports = CategoryController;