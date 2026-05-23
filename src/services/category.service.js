const db = require('../database');

class CategoryService {
  static async getAll() {
    return db.query(`
      SELECT c.id, c.name, c.slug, c.sort_order, c.is_active, c.created_at,
             COUNT(p.id) as post_count
      FROM categories c
      LEFT JOIN posts p ON c.id = p.category_id AND p.deleted_at IS NULL AND p.status = 'published'
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.created_at ASC
    `);
  }

  static async getById(id) {
    return db.queryOne('SELECT * FROM categories WHERE id = ?', [id]);
  }

  static async getBySlug(slug) {
    return db.queryOne('SELECT * FROM categories WHERE slug = ?', [slug]);
  }

  static async create({ name, slug, sort_order = 0 }) {
    const result = await db.execute(`
      INSERT INTO categories (name, slug, sort_order)
      VALUES (?, ?, ?)
    `, [name, slug, sort_order]);

    return this.getById(result.insertId);
  }

  static async update(id, updates) {
    const fields = [];
    const values = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.slug !== undefined) {
      fields.push('slug = ?');
      values.push(updates.slug);
    }
    if (updates.sort_order !== undefined) {
      fields.push('sort_order = ?');
      values.push(updates.sort_order);
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(updates.is_active);
    }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    await db.execute(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, values);

    return this.getById(id);
  }

  static async delete(id) {
    await db.execute('DELETE FROM categories WHERE id = ?', [id]);
  }
}

module.exports = CategoryService;