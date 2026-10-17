// A presentation-only HTTP fixture. It does NOT validate backend writes,
// authentication, attachment binding or database migrations.
const http = require('node:http');
const posts = new Map();
let nextId = 900;
const user = { id: 1, username: 'presentation-user', role: 'admin', phone_verified: true, email_verified: true };
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:4502');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || 'Content-Type, X-CSRF-Token, X-API-Version');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  res.setHeader('Content-Type', 'application/json');
  const path = new URL(req.url, 'http://localhost').pathname;
  let data = [];
  if (path === '/health') data = { fixture: 'presentation-only' };
  else if (path === '/api/auth/check') data = { authenticated: true, user };
  else if (path === '/api/settings' || path === '/api/settings/public') data = {};
  else if (path === '/api/posts' && req.method === 'POST') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw);
    data = { ...input, id: nextId++, user_id: 1, author_name: user.username, author_role: 'admin', content_format: 'tiptap_json', created_at: new Date().toISOString(), view_count: 0, status: 'published', tags: [], replies: [] };
    posts.set(data.id, data);
  } else if (/^\/api\/posts\/\d+$/.test(path)) {
    data = posts.get(Number(path.split('/').pop()));
    if (!data) { res.writeHead(404).end('{}'); return; }
  } else if (/\/quote-availability/.test(path)) data = { available: true };
  else if (path === '/api/notifications/unread-count') data = { count: 0 };
  else if (/\/custom-emojis\/\d+\/image/.test(path)) {
    res.setHeader('Content-Type', 'image/svg+xml');
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><text x="0" y="20">🌻</text></svg>'); return;
  }
  res.end(JSON.stringify({ success: true, data }));
});
server.listen(4600, '127.0.0.1', () => console.log('Presentation fixture API on 4600 (no real database)'));
