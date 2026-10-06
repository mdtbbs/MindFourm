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

const activeSockets = new Map<number, WebSocket>();

/** ACK is intentionally explicit: approval outbox rows stay pending until the user consumes the intent. */
export function ackForumRealtimeEvent(userId: number, id: string): boolean {
  const socket = activeSockets.get(userId);
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ type: 'ack', stream: 'user', id }));
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
        activeSockets.set(userId, next);
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
          if (activeSockets.get(userId) === next) activeSockets.delete(userId);
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
      if (activeSockets.get(userId) === socket) activeSockets.delete(userId);
      socket?.close();
      if (connectionId) void requestV1(`/presence/connections/${encodeURIComponent(connectionId)}`, { method: 'DELETE' }).catch(() => undefined);
    };
  }, [enabled, userId]);
}
