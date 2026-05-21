const db = require('../database');
const fs = require('fs');
const path = require('path');

class AttachmentService {
  static create({ post_id, reply_id, user_id, file_name, file_path, file_size, mime_type }) {
    const result = db.prepare(`
      INSERT INTO attachments (post_id, reply_id, user_id, file_name, file_path, file_size, mime_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(post_id || null, reply_id || null, user_id, file_name, file_path, file_size, mime_type);

    return db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.lastInsertRowid);
  }

  static getByPostId(postId) {
    return db.prepare(`
      SELECT * FROM attachments WHERE post_id = ? AND reply_id IS NULL ORDER BY created_at ASC
    `).all(postId);
  }

  static getByReplyId(replyId) {
    return db.prepare(`
      SELECT * FROM attachments WHERE reply_id = ? ORDER BY created_at ASC
    `).all(replyId);
  }

  static incrementDownloadCount(id) {
    db.prepare('UPDATE attachments SET download_count = download_count + 1 WHERE id = ?').run(id);
  }

  static getById(id) {
    return db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
  }

  static delete(id, userId) {
    const attachment = this.getById(id);
    if (!attachment || attachment.user_id !== userId) return null;

    // Remove file from disk
    try {
      const fullPath = path.join(__dirname, '..', attachment.file_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch (e) {
      // file may already be deleted
    }

    db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
    return true;
  }
}

module.exports = AttachmentService;
