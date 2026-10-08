#!/usr/bin/env node

/**
 * Minimal ResourceStorage-compatible HTTP service for isolated product E2E.
 *
 * This is intentionally test-only. It exercises the forum's real HTTP client,
 * upload-token flow, object verification, binding visibility, signed private
 * downloads, and public downloads without weakening production's requirement
 * that ResourceStorage be configured for new managed uploads.
 */

const http = require('node:http');
const { createHash, randomUUID } = require('node:crypto');
const { URL } = require('node:url');

if (process.env.NODE_ENV !== 'test') {
  throw new Error('The E2E ResourceStorage stub may only run with NODE_ENV=test.');
}

const apiKey = process.env.RES_API_KEY || 'e2e-res-key';
const configuredBaseUrl = process.env.RES_BASE_URL || 'http://127.0.0.1:4100';
const baseUrl = new URL(configuredBaseUrl);
const port = Number(baseUrl.port || (baseUrl.protocol === 'https:' ? 443 : 80));
const hostname = baseUrl.hostname;

if (baseUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(hostname)) {
  throw new Error('The E2E ResourceStorage stub must bind to loopback HTTP only.');
}
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new Error('Invalid E2E ResourceStorage port.');
}

const uploads = new Map();
const objects = new Map();
const bindings = new Map();
const ownerBindings = new Map();
const privateTokens = new Map();
const dedupByHash = new Map();

function json(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function empty(res, status = 204) {
  res.writeHead(status, { 'cache-control': 'no-store' });
  res.end();
}

function authorized(req) {
  return req.headers.authorization === `Bearer ${apiKey}`;
}

async function readBody(req, maxBytes = 64 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('request body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

async function readJson(req) {
  const body = await readBody(req, 1024 * 1024);
  try {
    return body.length ? JSON.parse(body.toString('utf8')) : {};
  } catch {
    throw new Error('invalid json');
  }
}

function objectResponse(object) {
  return {
    id: object.id,
    public_id: object.public_id,
    sha256: object.sha256,
    size_bytes: object.bytes.length,
    mime_type: object.mime_type,
    original_filename: object.original_filename,
    state: 'verified',
    created_at: object.created_at,
    verified_at: object.verified_at,
  };
}

function serveBytes(res, object, filename, isPrivate) {
  const safeFilename = String(filename || object.original_filename || 'file')
    .replace(/[\r\n"\\/]/g, '_')
    .slice(0, 240) || 'file';
  res.writeHead(200, {
    'content-type': object.mime_type || 'application/octet-stream',
    'content-length': String(object.bytes.length),
    'content-disposition': `attachment; filename="${safeFilename}"`,
    'cache-control': isPrivate ? 'private, no-store' : 'public, max-age=60',
  });
  res.end(object.bytes);
}

function ownerKey(input) {
  return `${input.namespace}\u0000${input.owner_type}\u0000${input.owner_id}`;
}

const server = http.createServer(async (req, res) => {
  try {
    // Browser direct uploads exercise the same preflight as the real RES service.
    // This test-only server accepts local frontend origins; upload tokens remain required.
    const origin = req.headers.origin;
    if (origin) {
      const parsedOrigin = new URL(origin);
      if (['localhost', '127.0.0.1', '[::1]'].includes(parsedOrigin.hostname)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      }
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const url = new URL(req.url || '/', configuredBaseUrl);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { ok: true, status: 'ok' });
    }

    const publicMatch = /^\/o\/([^/]+)\/([^/]+)$/.exec(path);
    if (req.method === 'GET' && publicMatch) {
      const publicId = decodeURIComponent(publicMatch[1]);
      const object = objects.get(publicId);
      if (!object) return json(res, 404, { error: 'not_found' });
      const publicBinding = [...bindings.values()].some((binding) =>
        binding.object_public_id === publicId && binding.visibility === 'public');
      if (!publicBinding) return json(res, 404, { error: 'not_public' });
      return serveBytes(res, object, decodeURIComponent(publicMatch[2]), false);
    }

    const privateMatch = /^\/private\/([^/]+)$/.exec(path);
    if (req.method === 'GET' && privateMatch) {
      const token = decodeURIComponent(privateMatch[1]);
      const signed = privateTokens.get(token);
      if (!signed || signed.expires_at <= Date.now()) return json(res, 404, { error: 'expired' });
      const object = objects.get(signed.object_public_id);
      if (!object) return json(res, 404, { error: 'not_found' });
      return serveBytes(res, object, signed.filename, true);
    }

    const uploadMatch = /^\/upload\/([^/]+)$/.exec(path);
    if (req.method === 'PUT' && uploadMatch) {
      const sessionId = decodeURIComponent(uploadMatch[1]);
      const upload = uploads.get(sessionId);
      if (!upload || upload.expires_at <= Date.now()) return json(res, 404, { error: 'upload_expired' });
      if (req.headers.authorization !== `Bearer ${upload.token}`) return json(res, 401, { error: 'unauthorized' });
      const bytes = await readBody(req);
      if (bytes.length !== upload.size_bytes) return json(res, 422, { error: 'size_mismatch' });
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      if (upload.sha256 && sha256 !== upload.sha256) return json(res, 422, { error: 'sha256_mismatch' });
      const existing = dedupByHash.get(`${sha256}:${bytes.length}`);
      let object = existing ? objects.get(existing) : null;
      if (!object) {
        const now = new Date().toISOString();
        object = {
          id: randomUUID(),
          public_id: randomUUID(),
          sha256,
          bytes,
          mime_type: upload.mime_type,
          original_filename: upload.original_filename,
          created_at: now,
          verified_at: now,
        };
        objects.set(object.public_id, object);
        dedupByHash.set(`${sha256}:${bytes.length}`, object.public_id);
      }
      uploads.delete(sessionId);
      return json(res, 201, { object: { public_id: object.public_id } });
    }

    if (!path.startsWith('/api/v1/') || !authorized(req)) {
      return json(res, path.startsWith('/api/v1/') ? 401 : 404, { error: 'unauthorized' });
    }

    if (req.method === 'POST' && path === '/api/v1/uploads') {
      const input = await readJson(req);
      const sizeBytes = Number(input.size_bytes);
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 64 * 1024 * 1024) {
        return json(res, 422, { error: 'invalid_size' });
      }
      const sha256 = typeof input.sha256 === 'string' ? input.sha256.toLowerCase() : '';
      if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) return json(res, 422, { error: 'invalid_sha256' });
      if (sha256) {
        const existingId = dedupByHash.get(`${sha256}:${sizeBytes}`);
        const existing = existingId ? objects.get(existingId) : null;
        if (existing) {
          return json(res, 200, {
            deduplicated: true,
            object: {
              id: existing.id,
              public_id: existing.public_id,
              sha256: existing.sha256,
              size_bytes: existing.bytes.length,
            },
          });
        }
      }
      const sessionId = randomUUID();
      const token = randomUUID();
      const expiresAt = Date.now() + 10 * 60_000;
      uploads.set(sessionId, {
        token,
        expires_at: expiresAt,
        sha256,
        size_bytes: sizeBytes,
        mime_type: String(input.mime_type || 'application/octet-stream').slice(0, 100),
        original_filename: String(input.original_filename || 'file').slice(0, 500),
      });
      return json(res, 201, {
        deduplicated: false,
        upload: {
          session_id: sessionId,
          url: `${configuredBaseUrl.replace(/\/$/, '')}/upload/${encodeURIComponent(sessionId)}`,
          token,
          expires_at: new Date(expiresAt).toISOString(),
        },
      });
    }

    const contentMatch = /^\/api\/v1\/objects\/([^/]+)\/content$/.exec(path);
    if (req.method === 'GET' && contentMatch) {
      const object = objects.get(decodeURIComponent(contentMatch[1]));
      if (!object) return json(res, 404, { error: 'not_found' });
      res.writeHead(200, {
        'content-type': object.mime_type || 'application/octet-stream',
        'content-length': String(object.bytes.length),
        'cache-control': 'no-store',
      });
      return res.end(object.bytes);
    }

    const bindingCreateMatch = /^\/api\/v1\/objects\/([^/]+)\/bindings$/.exec(path);
    if (req.method === 'POST' && bindingCreateMatch) {
      const objectPublicId = decodeURIComponent(bindingCreateMatch[1]);
      const object = objects.get(objectPublicId);
      if (!object) return json(res, 404, { error: 'not_found' });
      const input = await readJson(req);
      if (!['public', 'private'].includes(input.visibility)) return json(res, 422, { error: 'invalid_visibility' });
      const key = ownerKey(input);
      const previousId = ownerBindings.get(key);
      const id = previousId || randomUUID();
      const binding = {
        id,
        object_id: object.id,
        object_public_id: objectPublicId,
        namespace: String(input.namespace),
        owner_type: String(input.owner_type),
        owner_id: String(input.owner_id),
        visibility: input.visibility,
        created_at: new Date().toISOString(),
      };
      bindings.set(id, binding);
      ownerBindings.set(key, id);
      return json(res, previousId ? 200 : 201, { binding });
    }

    const bindingDeleteMatch = /^\/api\/v1\/objects\/([^/]+)\/bindings\/([^/]+)$/.exec(path);
    if (req.method === 'DELETE' && bindingDeleteMatch) {
      const objectPublicId = decodeURIComponent(bindingDeleteMatch[1]);
      const bindingId = decodeURIComponent(bindingDeleteMatch[2]);
      const binding = bindings.get(bindingId);
      if (!binding || binding.object_public_id !== objectPublicId) return json(res, 404, { error: 'not_found' });
      bindings.delete(bindingId);
      ownerBindings.delete(ownerKey(binding));
      return empty(res);
    }

    const signedMatch = /^\/api\/v1\/objects\/([^/]+)\/signed-url$/.exec(path);
    if (req.method === 'POST' && signedMatch) {
      const objectPublicId = decodeURIComponent(signedMatch[1]);
      const object = objects.get(objectPublicId);
      if (!object) return json(res, 404, { error: 'not_found' });
      const input = await readJson(req);
      const expiresIn = Math.max(1, Math.min(Number(input.expires_in) || 300, 3600));
      const expiresAt = Date.now() + expiresIn * 1000;
      const token = randomUUID();
      privateTokens.set(token, {
        object_public_id: objectPublicId,
        filename: String(input.filename || object.original_filename || 'file'),
        expires_at: expiresAt,
      });
      return json(res, 201, {
        url: `${configuredBaseUrl.replace(/\/$/, '')}/private/${encodeURIComponent(token)}`,
        expires_at: new Date(expiresAt).toISOString(),
      });
    }

    const objectMatch = /^\/api\/v1\/objects\/([^/]+)$/.exec(path);
    if (req.method === 'GET' && objectMatch) {
      const object = objects.get(decodeURIComponent(objectMatch[1]));
      if (!object) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { object: objectResponse(object) });
    }

    return json(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('[e2e-res] request failed', error);
    return json(res, 500, { error: 'internal_error' });
  }
});

server.listen(port, hostname, () => {
  console.log(`[e2e-res] listening on ${configuredBaseUrl}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 2000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
