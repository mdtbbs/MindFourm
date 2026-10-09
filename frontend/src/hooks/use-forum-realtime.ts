'use client';

import { useEffect } from 'react';
import { buildV1WebSocketUrl, fetchV1, requestV1 } from '@/lib/api/v1/transport';

export interface ForumRealtimeMessage {
  id?: string;
  event?: string;
  timestamp?: number;
  data?: Record<string, unknown>;
  stream?: string;
  session_id?: string;
  type?: string;
  reason?: string;
}

/**
 * Approval payloads arrive as `data.intent_id` (docs/api/multiplayer-v1.md) and
 * as the projected `{ join_intent: { intent_id } }` shape; accept both so a
 * payload change cannot silently drop an approval.
 */
export function readApprovalIntentId(data: Record<string, unknown> | undefined): string | null {
  if (!data) return null;
  if (typeof data.intent_id === 'string' && data.intent_id) return data.intent_id;
  const nested = data.join_intent;
  if (nested && typeof nested === 'object') {
    const value = (nested as Record<string, unknown>).intent_id;
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

interface ActiveSocket {
  socket: WebSocket;
  /** Session channels the server currently knows about for this socket. */
  subscribedSessions: Set<string>;
}

const activeSockets = new Map<number, ActiveSocket>();

let socketSeq = 0;

export function openForumRealtimeSocket(userId: number, socket: WebSocket, clientId: string): void {
  activeSockets.set(userId, { socket, subscribedSessions: new Set() });
  void clientId;
}

export function closeForumRealtimeSocket(userId: number, socket: WebSocket): void {
  if (activeSockets.get(userId)?.socket === socket) activeSockets.delete(userId);
}

/**
 * Ask the server to start pushing events for a multiplayer session.
 *
 * The gateway only relays `session:*` events to the sockets that sent a
 * `subscribe` for that session id, so join/peer/relay/candidate updates are
 * invisible to a browser that never subscribes. Callers pair this with
 * `unsubscribe`; both are no-ops when the socket is not connected.
 */
export function subscribeForumRealtimeSession(userId: number, sessionId: string): boolean {
  const entry = activeSockets.get(userId);
  if (!entry || entry.socket.readyState !== WebSocket.OPEN) return false;
  if (entry.subscribedSessions.has(sessionId)) return true;
  entry.subscribedSessions.add(sessionId);
  entry.socket.send(JSON.stringify({ type: 'subscribe', sessions: [sessionId] }));
  return true;
}

export function unsubscribeForumRealtimeSession(userId: number, sessionId: string): boolean {
  const entry = activeSockets.get(userId);
  if (!entry) return false;
  entry.subscribedSessions.delete(sessionId);
  return true;
}

/** Session channels the user's socket is currently subscribed to. */
export function subscribedForumRealtimeSessions(userId: number): string[] {
  return [...(activeSockets.get(userId)?.subscribedSessions ?? [])];
}

/**
 * @deprecated The server resubscribes known sessions on `hello`; sessions are
 * now announced via `subscribeForumRealtimeSession`, which tracks state.
 */
export function requestForumRealtimeSessions(userId: number, sessions: string[]): boolean {
  return (sessions.length ? sessions : []).every((sessionId) => subscribeForumRealtimeSession(userId, sessionId));
}

/**
 * Acknowledge a user-stream event so the server can retire the durable outbox
 * row behind it.
 *
 * The docs are explicit: send the confirmation only *after* the intent has been
 * consumed. Approvals that stay unacknowledged are replayed every 5 seconds.
 */
export function ackForumRealtimeEvent(userId: number, id: string): boolean {
  const entry = activeSockets.get(userId);
  if (!entry || entry.socket.readyState !== WebSocket.OPEN) return false;
  entry.socket.send(JSON.stringify({ type: 'ack', stream: 'user', id }));
  return true;
}

/**
 * Ask the gateway to stream session-scoped events (`peer.*`, `candidate.*`,
 * `relay.*`, `session.closed`, ...) for the given sessions. Session events are
 * only delivered after an explicit subscribe; they carry a `session_id` and are
 * never part of the user stream.
 */
export function subscribeForumRealtimeSessions(userId: number, sessionIds: readonly string[]): boolean {
  const entry = activeSockets.get(userId);
  if (!entry || entry.socket.readyState !== WebSocket.OPEN) return false;
  const valid = sessionIds.filter((id) => /^ses_[A-Za-z0-9_-]{16,32}$/.test(id) && !entry.subscribedSessions.has(id));
  if (valid.length === 0) return false;
  for (const id of valid) entry.subscribedSessions.add(id);
  entry.socket.send(JSON.stringify({ type: 'subscribe', sessions: valid }));
  return true;
}

export function useForumRealtime(userId: number | undefined, enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !userId || typeof window === 'undefined' || typeof WebSocket === 'undefined') return;

    let active = true;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let presenceTimer: ReturnType<typeof setInterval> | null = null;
    let connectionId: string | null = null;
    let attempts = 0;
    let status: 'online' | 'idle' | 'dnd' | 'invisible' = 'online';
    const storageKey = `forum:realtime:user:${userId}:cursor`;
    const emit = (message: ForumRealtimeMessage) => window.dispatchEvent(new CustomEvent('forum:realtime', { detail: message }));

    const releasePresence = () => {
      if (!connectionId) return;
      const owned = connectionId;
      connectionId = null;
      void requestV1(`/presence/connections/${encodeURIComponent(owned)}`, { method: 'DELETE' }).catch(() => undefined);
    };

    const loadStatus = async () => {
      try {
        const preferences = await fetchV1<{ status?: typeof status }>('/social/privacy');
        if (preferences.status && ['online', 'idle', 'dnd', 'invisible'].includes(preferences.status)) status = preferences.status;
      } catch { /* Older deployments may not enable social presence. */ }
      try {
        const connection = await requestV1<{ connection_id: string }>('/presence/connections', {
          method: 'POST', body: JSON.stringify({ platform: 'web', status }),
        });
        if (!active) {
          // The effect was torn down while the POST was in flight, so cleanup
          // ran before `connectionId` was set. Release the connection here
          // instead of leaking an "online" presence until the 90s server lease
          // expires.
          void requestV1(`/presence/connections/${encodeURIComponent(connection.connection_id)}`, { method: 'DELETE' }).catch(() => undefined);
          return;
        }
        connectionId = connection.connection_id;
      } catch { /* Realtime events can work when presence is disabled. */ }
      if (active) {
        presenceTimer = setInterval(() => {
          if (connectionId) void requestV1(`/presence/connections/${encodeURIComponent(connectionId)}/heartbeat`, { method: 'POST' }).catch(() => undefined);
        }, 25_000);
      }
    };

    const connect = async () => {
      try {
        const ticket = await requestV1<{ ticket: string; websocket_path: string }>('/realtime/tickets', { method: 'POST' });
        if (!active) return;
        const url = new URL(buildV1WebSocketUrl(ticket.websocket_path));
        url.searchParams.set('ticket', ticket.ticket);
        const next = new WebSocket(url.toString());
        socket = next;
        socketSeq += 1;
        const clientId = `web-${userId}-${socketSeq}`;
        openForumRealtimeSocket(userId, next, clientId);
        next.onopen = () => { attempts = 0; };
        next.onmessage = (message) => {
          let value: ForumRealtimeMessage;
          try { value = JSON.parse(String(message.data)) as ForumRealtimeMessage; } catch { return; }
          if (value.type === 'hello') {
            if (heartbeatTimer) clearInterval(heartbeatTimer);
            heartbeatTimer = setInterval(() => {
              if (next.readyState === WebSocket.OPEN) next.send(JSON.stringify({ type: 'heartbeat' }));
            }, 25_000);
            let lastEventId: string | null = null;
            try { lastEventId = window.sessionStorage.getItem(storageKey); } catch { /* Storage may be unavailable. */ }
            next.send(JSON.stringify({ type: 'resume', last_event_id: lastEventId }));
            // A reconnected socket carries no subscriptions: the gateway keeps
            // them per-connection and drops them when the socket closes, so
            // re-announce the sessions the user subscribed to before the drop.
            const sessions = [...(activeSockets.get(userId)?.subscribedSessions ?? [])];
            if (sessions.length) next.send(JSON.stringify({ type: 'subscribe', sessions }));
            return;
          }
          if (value.type === 'event' && value.id) {
            try { window.sessionStorage.setItem(storageKey, value.id); } catch { /* The live socket can still deliver events. */ }
            emit(value);
            return;
          }
          if (value.type === 'resume_failed') {
            emit(value);
            return;
          }
          if (value.type === 'protocol_error' || value.type === 'error') emit(value);
        };
        next.onclose = () => {
          closeForumRealtimeSocket(userId, next);
          if (socket === next) socket = null;
          if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
          scheduleReconnect();
        };
        next.onerror = () => next.close();
      } catch {
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimer) return;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts, 5));
      attempts += 1;
      reconnectTimer = setTimeout(() => { reconnectTimer = null; void connect(); }, delay);
    };

    const preferenceChanged = (event: Event) => {
      const nextStatus = (event as CustomEvent<{ status?: typeof status }>).detail?.status;
      if (!nextStatus || !['online', 'idle', 'dnd', 'invisible'].includes(nextStatus)) return;
      status = nextStatus;
      if (connectionId) void requestV1(`/presence/connections/${encodeURIComponent(connectionId)}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      }).catch(() => undefined);
    };
    window.addEventListener('forum:presence-preference-change', preferenceChanged);
    void loadStatus().finally(() => { if (active) void connect(); });

    return () => {
      active = false;
      window.removeEventListener('forum:presence-preference-change', preferenceChanged);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (presenceTimer) clearInterval(presenceTimer);
      if (socket) closeForumRealtimeSocket(userId, socket);
      socket?.close();
      releasePresence();
    };
  }, [enabled, userId]);
}
