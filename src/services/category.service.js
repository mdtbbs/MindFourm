const db = require('../database');

class CategoryService {
  static getAll() {
    return db.prepare(`
      SELECT c.id, c.name, c.slug, c.sort_order, c.is_active, c.created_at,
             COUNT(p.id) as post_count
      FROM categories c
      LEFT JOIN posts p ON c.id = p.category_id AND p.deleted_at IS NULL AND p.status = 'published'
      WHERE c.is_active = 1
      GROUP BY c.id
      ORDER BY c.sort_order ASC, c.created_at ASC
    `).all();
  }

  static getById(id) {
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  }

  static getBySlug(slug) {
    return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  }

  static create({ name, slug, sort_order = 0 }) {
    const result = db.prepare(`
      INSERT INTO categories (name, slug, sort_order)
      VALUES (?, ?, ?)
    `).run(name, slug, sort_order);

    return this.getById(result.lastInsertRowid);
  }

  static update(id, updates) {
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
    db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    return this.getById(id);
  }

  static delete(id) {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }
}

module.exports = CategoryService;