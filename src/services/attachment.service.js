const db = require('../database');
const fs = require('fs');
const path = require('path');

class AttachmentService {
  static async create({ post_id, reply_id, user_id, file_name, file_path, file_size, mime_type }) {
    const result = await db.execute(`
      INSERT INTO attachments (post_id, reply_id, user_id, file_name, file_path, file_size, mime_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [post_id || null, reply_id || null, user_id, file_name, file_path, file_size, mime_type]);

    return db.queryOne('SELECT * FROM attachments WHERE id = ?', [result.insertId]);
  }

  static async getByPostId(postId) {
    return db.query(`
      SELECT * FROM attachments WHERE post_id = ? AND reply_id IS NULL ORDER BY created_at ASC
    `, [postId]);
  }

  static async getByReplyId(replyId) {
    return db.query(`
      SELECT * FROM attachments WHERE reply_id = ? ORDER BY created_at ASC
    `, [replyId]);
  }

  static async incrementDownloadCount(id) {
    await db.execute('UPDATE attachments SET download_count = download_count + 1 WHERE id = ?', [id]);
  }

  static async getById(id) {
    return db.queryOne('SELECT * FROM attachments WHERE id = ?', [id]);
  }

  static async delete(id, userId) {
    const attachment = await this.getById(id);
    if (!attachment || attachment.user_id !== userId) return null;

    // Remove file from disk
    try {
      const fullPath = path.join(__dirname, '..', attachment.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (e) {
      // file may already be deleted
    }

    await db.execute('DELETE FROM attachments WHERE id = ?', [id]);
    return true;
  }
}

module.exports = AttachmentService;