const db = require('../database');

class ResourceCategoryService {
  static async list(includeInactive = false) {
    const where = includeInactive ? '' : 'WHERE is_active = 1';
    return db.query(`SELECT * FROM resource_categories ${where} ORDER BY sort_order ASC, name ASC`);
  }

  static async getById(id) {
    return db.queryOne('SELECT * FROM resource_categories WHERE id = ?', [id]);
  }

  static async create({ name, slug, description, icon, sort_order, is_active }) {
    const result = await db.execute(`
      INSERT INTO resource_categories (name, slug, description, icon, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [name, slug, description || null, icon || null, sort_order || 0, is_active ? 1 : 0]);
    return this.getById(result.insertId);
  }

  static async update(id, { name, slug, description, icon, sort_order, is_active }) {
    const fields = [];
    const values = [];

    if (name !== null && name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (slug !== null && slug !== undefined) { fields.push('slug = ?'); values.push(slug); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (icon !== undefined) { fields.push('icon = ?'); values.push(icon); }
    if (sort_order !== null && sort_order !== undefined) { fields.push('sort_order = ?'); values.push(sort_order); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    await db.execute(`UPDATE resource_categories SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.getById(id);
  }

  static async delete(id) {
    const resourceCount = await db.queryOne('SELECT COUNT(*) as cnt FROM resources WHERE category_id = ?', [id]);
    if (resourceCount.cnt > 0) {
      return { error: '该类别下还有资源，无法删除' };
    }
    await db.execute('DELETE FROM resource_categories WHERE id = ?', [id]);
    return { success: true };
  }
}

module.exports = ResourceCategoryService;