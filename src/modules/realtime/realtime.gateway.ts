import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocketGateway } from '@nestjs/websockets';
import Redis from 'ioredis';
import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { MultiplayerService } from '../multiplayer/multiplayer.service';
import { RedisService } from '../../database/redis.service';
import { RealtimeEvent, RealtimeEventsService } from './realtime-events.service';

interface ClientState {
  userId: number;
  clientId: string;
  sessions: Set<string>;
  cursors: Map<string, string>;
  delivered: Map<string, string>;
  acked: Map<string, string>;
  approvalEvents: Map<string, string>;
  pumps: Map<string, Promise<void>>;
}

function validCursor(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,16}-\d{1,10}$/.test(value);
}

function cursorAtOrBefore(first: string, second: string): boolean {
  if (!validCursor(first) || !validCursor(second)) return false;
  const [firstMs, firstSeq] = first.split('-').map(BigInt);
  const [secondMs, secondSeq] = second.split('-').map(BigInt);
  return firstMs < secondMs || (firstMs === secondMs && firstSeq <= secondSeq);
}

@WebSocketGateway({ path: '/realtime/v1', maxPayload: 16 * 1024 })
export class RealtimeGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private subscriber: Redis | null = null;
  private subscriberReady = false;
  private subscribing = false;
  private readonly states = new WeakMap<WebSocket, ClientState>();
  private readonly clients = new Set<WebSocket>();
  private approvalReplayTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly events: RealtimeEventsService,
    private readonly multiplayer: MultiplayerService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    // Pub/sub has its own connection. Start subscribing only after Redis reaches
    // ready: the command client disables its offline queue, so an eager
    // PSUBSCRIBE during connection setup would reject and abort Nest startup.
    this.subscriber = this.redis.getClient().duplicate({ enableOfflineQueue: true });
    this.subscriber.on('error', (error) => this.logger.warn(`Realtime pubsub error: ${error.message}`));
    this.subscriber.on('pmessage', (_pattern, channel) => void this.handleSignal(channel));
    this.subscriber.on('ready', () => void this.subscribe());
    if (this.subscriber.status === 'ready') await this.subscribe();
    this.approvalReplayTimer = setInterval(() => void this.replayPendingApprovals(), 5_000);
    this.approvalReplayTimer.unref?.();
  }

  private async subscribe(): Promise<void> {
    if (!this.subscriber || this.subscriberReady || this.subscribing) return;
    this.subscribing = true;
    try {
      await this.subscriber.psubscribe('realtime:user:*', 'realtime:session:*');
      this.subscriberReady = true;
    } catch (error) {
      this.logger.warn(`Realtime pubsub subscription failed: ${(error as Error).message}`);
    } finally {
      this.subscribing = false;
    }
  }

  onModuleDestroy() {
    if (this.approvalReplayTimer) clearInterval(this.approvalReplayTimer);
    this.approvalReplayTimer = null;
    this.subscriber?.disconnect();
    this.subscriber = null;
    for (const client of this.clients) client.close(1001, 'server_shutdown');
    this.clients.clear();
  }

  async handleConnection(client: WebSocket, request: IncomingMessage) {
    const origin = request.headers.origin;
    const frontendUrl = this.config.get<string>('app.frontendUrl') || '';
    if (origin && frontendUrl) {
      try {
        if (new URL(origin).origin !== new URL(frontendUrl).origin) {
          client.close(4403, 'ORIGIN_DENIED');
          return;
        }
      } catch {
        client.close(4403, 'ORIGIN_DENIED');
        return;
      }
    }
    let ticket = '';
    try { ticket = new URL(request.url || '/', 'http://localhost').searchParams.get('ticket') || ''; } catch { /* malformed URL */ }
    if (!/^[A-Za-z0-9_-]{32}$/.test(ticket)) {
      client.close(4401, 'AUTH_REQUIRED');
      return;
    }
    const raw = await this.redis.getAndDelete(`realtime:ticket:${ticket}`).catch(() => null);
    const separator = raw?.indexOf(':') ?? -1;
    if (!raw || separator < 1) {
      client.close(4401, 'AUTH_REQUIRED');
      return;
    }
    let identity: { user_id: number; client_id: string };
    try { identity = JSON.parse(raw.slice(separator + 1)); } catch {
      client.close(4401, 'AUTH_REQUIRED');
      return;
    }
    if (!Number.isSafeInteger(identity.user_id) || typeof identity.client_id !== 'string') {
      client.close(4401, 'AUTH_REQUIRED');
      return;
    }
    const state: ClientState = {
      userId: identity.user_id,
      clientId: identity.client_id,
      sessions: new Set(),
      cursors: new Map(),
      delivered: new Map(),
      acked: new Map(),
      approvalEvents: new Map(),
      pumps: new Map(),
    };
    this.states.set(client, state);
    this.clients.add(client);
    state.cursors.set('user', await this.events.latestUserEventId(state.userId));
    this.send(client, { type: 'hello', heartbeat_interval: 30, resume_supported: true, client_id: state.clientId });
    let messageQueue = Promise.resolve();
    client.on('message', (value) => {
      const raw = value.toString();
      messageQueue = messageQueue.then(() => this.handleMessage(client, raw)).catch((error) => {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Realtime client message failed: ${detail}`);
      });
    });
    client.on('close', () => { this.clients.delete(client); this.states.delete(client); });
    client.on('error', () => { this.clients.delete(client); this.states.delete(client); });
  }

  handleDisconnect(client: WebSocket) {
    this.clients.delete(client);
    this.states.delete(client);
  }

  private async handleMessage(client: WebSocket, raw: string) {
    const state = this.states.get(client);
    if (!state) return;
    if (Buffer.byteLength(raw, 'utf8') > 16 * 1024) return this.protocolError(client, 'RATE_LIMITED');
    let message: any;
    try { message = JSON.parse(raw); } catch { return this.protocolError(client, 'ACTIVITY_INVALID'); }
    if (!message || typeof message !== 'object' || typeof message.type !== 'string') return this.protocolError(client, 'ACTIVITY_INVALID');
    if (message.type === 'heartbeat') {
      this.send(client, { type: 'heartbeat_ack', timestamp: Date.now() });
      return;
    }
    if (message.type === 'subscribe') {
      const requested = Array.isArray(message.sessions) ? message.sessions.slice(0, 32) : [];
      for (const sessionId of requested) {
        if (typeof sessionId !== 'string' || !/^ses_[A-Za-z0-9_-]{16,32}$/.test(sessionId)) continue;
        try {
          await this.multiplayer.authorizeRealtimeSession(state.userId, sessionId);
          state.sessions.add(sessionId);
          const stream = `session:${sessionId}`;
          if (!state.cursors.has(stream)) state.cursors.set(stream, await this.events.latestSessionEventId(sessionId));
        } catch {
          this.send(client, { type: 'error', code: 'SESSION_PERMISSION_DENIED' });
        }
      }
      this.send(client, { type: 'subscribed', channels: ['user', ...[...state.sessions].map((id) => `session:${id}`)] });
      return;
    }
    if (message.type === 'resume') {
      await this.resume(client, state, message);
      return;
    }
    if (message.type === 'ack') {
      const stream = message.stream === 'user' ? 'user'
        : typeof message.session_id === 'string' && state.sessions.has(message.session_id) ? `session:${message.session_id}` : null;
      const delivered = stream ? state.delivered.get(stream) : undefined;
      const previousAck = stream ? state.acked.get(stream) : undefined;
      if (stream && validCursor(message.id) && delivered && cursorAtOrBefore(message.id, delivered)
        && (!previousAck || cursorAtOrBefore(previousAck, message.id))) {
        if (stream === 'user') {
          for (const [eventId, requestId] of state.approvalEvents) {
            if (!cursorAtOrBefore(eventId, message.id)) continue;
            await this.multiplayer.acknowledgeJoinApproval(state.userId, state.clientId, requestId);
            state.approvalEvents.delete(eventId);
          }
        }
        state.acked.set(stream, message.id);
      }
      return;
    }
    this.protocolError(client, 'ACTIVITY_INVALID');
  }

  private async resume(client: WebSocket, state: ClientState, message: any) {
    // Establish the fresh-client baseline before re-emitting durable approvals;
    // otherwise the no-cursor path would advance past the just-appended event.
    if (!message.last_event_id) this.advanceCursor(state, 'user', await this.events.latestUserEventId(state.userId));
    // The JoinRequest row is the approval outbox. Re-emit after the cursor is
    // known so a crash between local cursor persistence and server ACK is safe.
    await this.multiplayer.publishPendingJoinApprovals(state.userId, state.clientId, true);
    const sessions: Record<string, string> = message.sessions && typeof message.sessions === 'object' ? message.sessions : {};
    const requests: Array<{ stream: string; cursor: unknown }> = [
      { stream: 'user', cursor: message.last_event_id || state.cursors.get('user') },
      ...[...state.sessions].map((sessionId) => ({ stream: `session:${sessionId}`, cursor: sessions[sessionId] })),
    ];
    const plans: Array<{ stream: string; events: RealtimeEvent[]; reset: boolean }> = [];
    for (const item of requests) {
      if (!item.cursor) {
        const id = item.stream === 'user'
          ? (state.cursors.get('user') || await this.events.latestUserEventId(state.userId))
          : await this.events.latestSessionEventId(item.stream.slice('session:'.length));
        this.advanceCursor(state, item.stream, id);
        plans.push({ stream: item.stream, events: [], reset: false });
        continue;
      }
      if (!validCursor(item.cursor)) {
        plans.push({ stream: item.stream, events: [], reset: true });
        continue;
      }
      const result = item.stream === 'user'
        ? await this.events.resumeUser(state.userId, item.cursor)
        : await this.events.resumeSession(item.stream.slice('session:'.length), item.cursor);
      if (!result.resumed) plans.push({ stream: item.stream, events: [], reset: true });
      else {
        this.advanceCursor(state, item.stream, item.cursor);
        plans.push({ stream: item.stream, events: result.events, reset: false });
      }
    }
    this.send(client, { type: 'resumed', streams: requests.map((item) => item.stream) });
    for (const plan of plans) {
      if (plan.reset) {
        this.send(client, { type: 'resume_failed', stream: plan.stream, reason: 'snapshot_required' });
        const latest = plan.stream === 'user'
          ? await this.events.latestUserEventId(state.userId)
          : await this.events.latestSessionEventId(plan.stream.slice('session:'.length));
        this.advanceCursor(state, plan.stream, latest);
        if (plan.stream === 'user') {
          await this.multiplayer.publishPendingJoinApprovals(state.userId, state.clientId, true);
          const replay = await this.events.resumeUser(state.userId, latest);
          if (replay.resumed) for (const event of replay.events) this.deliver(client, state, plan.stream, event);
        }
      } else {
        for (const event of plan.events) this.deliver(client, state, plan.stream, event);
      }
    }
  }

  private async handleSignal(channel: string) {
    const userMatch = /^realtime:user:(\d+)$/.exec(channel);
    const sessionMatch = /^realtime:session:(ses_[A-Za-z0-9_-]{16,32})$/.exec(channel);
    if (!userMatch && !sessionMatch) return;
    const stream = userMatch ? 'user' : `session:${sessionMatch![1]}`;
    for (const client of this.clients) {
      const state = this.states.get(client);
      if (!state || client.readyState !== WebSocket.OPEN) continue;
      if (userMatch && state.userId !== Number(userMatch[1])) continue;
      if (sessionMatch && !state.sessions.has(sessionMatch[1])) continue;
      await this.pump(client, state, stream);
    }
  }

  private async replayPendingApprovals() {
    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const state = this.states.get(client);
      if (!state) continue;
      try {
        await this.multiplayer.publishPendingJoinApprovals(state.userId, state.clientId);
      } catch (error) {
        this.logger.warn(`Durable join approval replay failed: ${(error as Error).message}`);
      }
    }
  }

  private async pump(client: WebSocket, state: ClientState, stream: string) {
    const previous = state.pumps.get(stream) || Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.pumpOnce(client, state, stream));
    state.pumps.set(stream, current);
    try {
      await current;
    } finally {
      if (state.pumps.get(stream) === current) state.pumps.delete(stream);
    }
  }

  private async pumpOnce(client: WebSocket, state: ClientState, stream: string) {
    if (this.states.get(client) !== state || client.readyState !== WebSocket.OPEN) return;
    const cursor = state.cursors.get(stream);
    if (!cursor) return;
    const result = stream === 'user'
      ? await this.events.resumeUser(state.userId, cursor)
      : await this.events.resumeSession(stream.slice('session:'.length), cursor);
    // A client resume can advance the cursor while the Redis query is in flight.
    // Discard that stale batch; a later queued pump or the resume itself will
    // deliver the newer range. Never let an older query rewind delivery state.
    if (this.states.get(client) !== state || state.cursors.get(stream) !== cursor) return;
    if (!result.resumed) {
      this.send(client, { type: 'resume_failed', stream, reason: 'snapshot_required' });
      this.advanceCursor(state, stream, stream === 'user'
        ? await this.events.latestUserEventId(state.userId)
        : await this.events.latestSessionEventId(stream.slice('session:'.length)));
      return;
    }
    for (const event of result.events) this.deliver(client, state, stream, event);
  }

  private deliver(client: WebSocket, state: ClientState, stream: string, event: RealtimeEvent) {
    const cursor = state.cursors.get(stream);
    if (cursor && cursorAtOrBefore(event.id, cursor)) return;
    if (stream === 'user' && event.event === 'multiplayer.join_request.approved'
      && typeof event.data.join_request_id === 'string' && state.approvalEvents.size >= 256) {
      // Keep every delivered approval mapped to its durable outbox row until
      // the client ACKs it. Closing before delivery makes the client reconnect
      // from its last persisted cursor and replay the event without losing the
      // acknowledgement association.
      client.close(1013, 'approval_backlog');
      return;
    }
    this.send(client, {
      type: 'event',
      id: event.id,
      event: event.event,
      timestamp: event.timestamp,
      data: event.data,
      ...(stream === 'user' ? { stream: 'user' } : { stream: 'session', session_id: stream.slice('session:'.length) }),
    });
    state.delivered.set(stream, event.id);
    this.advanceCursor(state, stream, event.id);
    if (stream === 'user' && event.event === 'multiplayer.join_request.approved'
      && typeof event.data.join_request_id === 'string') {
      state.approvalEvents.set(event.id, event.data.join_request_id);
    }
  }

  private advanceCursor(state: ClientState, stream: string, candidate: string) {
    const current = state.cursors.get(stream);
    if (!current || cursorAtOrBefore(current, candidate)) state.cursors.set(stream, candidate);
  }

  private protocolError(client: WebSocket, code: string) {
    this.send(client, { type: 'error', code });
  }

  private send(client: WebSocket, value: Record<string, unknown>) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(value));
  }
}
