const db = require('../database');

const BAN_CACHE_TTL_MS = 10_000;
let activeBanCache = { ips: new Set(), ipRanges: [], users: new Set(), refreshedAt: 0 };

async function refreshBanCache() {
  const now = Date.now();
  if (now - activeBanCache.refreshedAt < BAN_CACHE_TTL_MS) return;

  const bans = await db.query("SELECT ban_type, value FROM bans WHERE is_active = 1");
  activeBanCache = {
    ips: new Set(),
    ipRanges: [],
    users: new Set(),
    refreshedAt: now,
  };
  for (const ban of bans) {
    if (ban.ban_type === 'ip') activeBanCache.ips.add(ban.value);
    else if (ban.ban_type === 'ip_range') activeBanCache.ipRanges.push(ban.value);
    else if (ban.ban_type === 'user') activeBanCache.users.add(ban.value);
  }
}

function invalidateBanCache() {
  activeBanCache.refreshedAt = 0;
}

class BanService {
  static async create({ ban_type, value, reason, created_by }) {
    const result = await db.execute(`
      INSERT INTO bans (ban_type, value, reason, created_by)
      VALUES (?, ?, ?, ?)
    `, [ban_type, value, reason || null, created_by]);
    invalidateBanCache();
    return db.queryOne('SELECT * FROM bans WHERE id = ?', [result.insertId]);
  }

  static async getList({ page = 1, limit = 20, ban_type, is_active }) {
    const offset = (page - 1) * limit;
    const wheres = [];
    const params = [];

    if (ban_type) { wheres.push('ban_type = ?'); params.push(ban_type); }
    if (is_active !== undefined) { wheres.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    const where = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

    const bans = await db.query(`
      SELECT b.*, u.username as creator_name
      FROM bans b LEFT JOIN users u ON b.created_by = u.id
      ${where} ORDER BY b.created_at DESC LIMIT ? OFFSET ?
    `, [...params, limit, offset]);

    const totalResult = await db.queryOne(`SELECT COUNT(*) as total FROM bans ${where}`, params);

    return { data: bans, pagination: { page, limit, total: totalResult.total, totalPages: Math.ceil(totalResult.total / limit) } };
  }

  static async getById(id) {
    return db.queryOne('SELECT b.*, u.username as creator_name FROM bans b LEFT JOIN users u ON b.created_by = u.id WHERE b.id = ?', [id]);
  }

  static async update(id, updates) {
    const fields = [];
    const values = [];
    if (updates.reason !== undefined) { fields.push('reason = ?'); values.push(updates.reason); }
    if (updates.is_active !== undefined) { fields.push('is_active = ?'); values.push(updates.is_active ? 1 : 0); }
    if (fields.length === 0) return this.getById(id);
    values.push(id);
    await db.execute(`UPDATE bans SET ${fields.join(', ')} WHERE id = ?`, values);
    invalidateBanCache();
    return this.getById(id);
  }

  static async deactivate(id) {
    invalidateBanCache();
    return this.update(id, { is_active: false });
  }

  static async isActive(type, value) {
    await refreshBanCache();
    if (type === 'ip') return activeBanCache.ips.has(value);
    if (type === 'user') return activeBanCache.users.has(value);
    const result = await db.queryOne('SELECT 1 FROM bans WHERE ban_type = ? AND value = ? AND is_active = 1', [type, value]);
    return !!result;
  }

  static async checkIp(ip) {
    await refreshBanCache();
    if (activeBanCache.ips.has(ip)) return true;
    for (const range of activeBanCache.ipRanges) {
      if (this.ipInRange(ip, range)) return true;
    }
    return false;
  }

  static ipInRange(ip, cidr) {
    if (!cidr.includes('/')) return ip === cidr;
    if (ip.includes(':') || cidr.includes(':')) return false;
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