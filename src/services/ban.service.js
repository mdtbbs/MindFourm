const db = require('../database');

class BanService {
  static create({ ban_type, value, reason, created_by }) {
    const result = db.prepare(`
      INSERT INTO bans (ban_type, value, reason, created_by)
      VALUES (?, ?, ?, ?)
    `).run(ban_type, value, reason || null, created_by);
    return db.prepare('SELECT * FROM bans WHERE id = ?').get(result.lastInsertRowid);
  }

  static getList({ page = 1, limit = 20, ban_type, is_active }) {
    const offset = (page - 1) * limit;
    const wheres = [];
    const params = [];

    if (ban_type) { wheres.push('ban_type = ?'); params.push(ban_type); }
    if (is_active !== undefined) { wheres.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    const where = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

    const bans = db.prepare(`
      SELECT b.*, u.username as creator_name
      FROM bans b LEFT JOIN users u ON b.created_by = u.id
      ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const total = db.prepare(`SELECT COUNT(*) as total FROM bans ${where}`).get(...params).total;

    return { data: bans, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  static getById(id) {
    return db.prepare('SELECT b.*, u.username as creator_name FROM bans b LEFT JOIN users u ON b.created_by = u.id WHERE b.id = ?').get(id);
  }

  static update(id, updates) {
    const fields = [];
    const values = [];
    if (updates.reason !== undefined) { fields.push('reason = ?'); values.push(updates.reason); }
    if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active ? 1 : 0); }
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    db.prepare(`UPDATE bans SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  static deactivate(id) {
    return this.update(id, { is_active: false });
  }

  static isActive(type, value) {
    return db.prepare('SELECT 1 FROM bans WHERE ban_type = ? AND value = ? AND is_active = 1').get(type, value);
  }

  static checkIp(ip) {
    if (this.isActive('ip', ip)) return true;

    const ranges = db.prepare("SELECT value FROM bans WHERE ban_type = 'ip_range' AND is_active = 1").all();
    for (const row of ranges) {
      if (this.ipInRange(ip, row.value)) return true;
    }
    return false;
  }

  static ipInRange(ip, cidr) {
    if (!cidr.includes('/')) return ip === cidr;
    const [base, bits] = cidr.split('/');
    const mask = ~((1 << (32 - parseInt(bits))) - 1);
    const ipNum = this.ipToNum(ip);
    const baseNum = this.ipToNum(base);
    return (ipNum & mask) === (baseNum & mask);
  }

  static ipToNum(ip) {
    return ip.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0;
  }
}

module.exports = BanService;
