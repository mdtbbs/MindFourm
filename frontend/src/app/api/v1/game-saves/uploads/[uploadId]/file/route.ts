/**
 * Streaming proxy for the cloud-save binary upload. The web UI does not upload
 * saves (launchers do, straight to the forum API), but the flow it protects is
 * reachable through this origin whenever an ingress sends `/api/*` here, so the
 * body must stay a stream: buffering it would defeat the whole upload path.
 * Covered by `docs/production-deployment.md`; keep it in sync if this moves.
 */
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

const HOP_BY_HOP_HEADERS = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

function makeRequestId(request: Request): string {
  const incoming = request.headers.get('x-request-id')?.trim();
  return incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : randomUUID();
}

function withoutHopByHopHeaders(source: Headers): Headers {
  const headers = new Headers(source);
  const connectionTokens = (headers.get('connection') || '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  for (const name of [...HOP_BY_HOP_HEADERS, ...connectionTokens, 'host', 'content-length']) {
    headers.delete(name);
  }
  return headers;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ uploadId: string }> },
) {
  const { uploadId } = await context.params;
  const requestId = makeRequestId(request);
  const requestHeaders = withoutHopByHopHeaders(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const apiBase = (process.env.API_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');
  const target = new URL(
    `/api/v1/game-saves/uploads/${encodeURIComponent(uploadId)}/file`,
    apiBase,
  );

  let upstream: Response;
  try {
    // Keep this body as a stream; buffering it with text(), arrayBuffer(), or
    // json() would recreate the large-upload failure this route avoids.
    upstream = await fetch(target, {
      method: 'PUT',
      headers: requestHeaders,
      body: request.body,
      cache: 'no-store',
      redirect: 'manual',
      signal: request.signal,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });
  } catch (error) {
    if (request.signal.aborted) throw error;

    console.error('[cloud-save-upload-proxy] backend request failed', {
      requestId,
      error: error instanceof Error ? error.message : 'unknown error',
    });
    return Response.json({
      error: {
        code: 'SAVE_STORAGE_UNAVAILABLE',
        message: '无法连接云存档上传服务。',
        retryable: true,
        details: [],
      },
      meta: { request_id: requestId },
    }, {
      status: 503,
      headers: { 'cache-control': 'no-store', 'x-request-id': requestId },
    });
  }

  const responseHeaders = withoutHopByHopHeaders(upstream.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.set('cache-control', 'no-store');
  if (!responseHeaders.has('x-request-id')) responseHeaders.set('x-request-id', requestId);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
