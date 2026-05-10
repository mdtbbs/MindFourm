const Response = require('../utils/response');
const CategoryService = require('../services/category.service');

class CategoryController {
  static list(ctx) {
    const categories = CategoryService.getAll();
    Response.success(ctx, categories);
  }

  static getById(ctx) {
    const { id } = ctx.params;
    const category = CategoryService.getById(parseInt(id));

    if (!category) {
      Response.notFound(ctx, 'Category not found');
      return;
    }

    Response.success(ctx, category);
  }
}

module.exports = CategoryController;