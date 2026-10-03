import { createHash } from 'node:crypto';
import type { APIRequestContext, APIResponse, Page } from '@playwright/test';
import { test as authTest, expect, TEST_USERS } from '../fixtures/auth.fixture';
import { API_URL, testLogin } from '../helpers/content.helpers';
import type { CreateGameSaveSlotDto, CreateGameSaveUploadDto } from '../../src/modules/game-saves/dto/game-saves.dto';
import type { CreateMultiplayerInviteDto, CreateMultiplayerSessionDto, JoinIntentConsumeDto } from '../../src/modules/multiplayer/dto/multiplayer.dto';
import type { CreatePresenceConnectionDto, PatchPresenceConnectionDto } from '../../src/modules/presence/dto/presence-v1.dto';
import type { CreateFriendRequestDto } from '../../src/modules/social/dto/social-privacy.dto';

type RequestHeaders = Record<string, string>;
type SettingRestore = () => Promise<void>;
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function responseData(body: unknown): unknown {
  // V1 uses { data, meta }; the legacy/admin surface uses { success, data }.
  return isRecord(body) ? body.data ?? body : body;
}

async function readJson(response: APIResponse, operation: string): Promise<unknown> {
  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok()) {
    throw new Error(`${operation} failed (${response.status()}): ${typeof body === 'string' ? body : JSON.stringify(body) ?? String(body)}`);
  }
  return body;
}

async function pageSessionHeaders(page: Page): Promise<RequestHeaders> {
  const cookies = await page.context().cookies(API_URL);
  const session = cookies.find((cookie) => cookie.name === 'forum_session')?.value;
  const csrf = cookies.find((cookie) => cookie.name === 'csrf_token')?.value;
  if (!session || !csrf) throw new Error('Authenticated browser fixture did not expose forum_session and csrf_token cookies');
  return { Cookie: `forum_session=${session}; csrf_token=${csrf}`, 'X-CSRF-Token': csrf };
}

async function adminSessionHeaders(request: APIRequestContext): Promise<RequestHeaders> {
  const session = await testLogin(request, 'admin');
  return { Cookie: session.cookieHeader, 'X-CSRF-Token': session.csrfToken };
}

async function temporarilyEnableSettings(
  request: APIRequestContext,
  headers: RequestHeaders,
  category: string,
  keys: string[],
): Promise<SettingRestore> {
  const path = `/api/admin/settings/${encodeURIComponent(category)}`;
  const beforeResponse = await request.get(`${API_URL}${path}`, { headers });
  const beforeBody = await readJson(beforeResponse, `read ${category} settings`);
  const before = asRecord(responseData(beforeBody));
  const original = Object.fromEntries(keys.map((key) => [key, String(before?.[key] ?? 'false')]));
  const changed = Object.fromEntries(keys
    .filter((key) => original[key] !== 'true')
    .map((key) => [key, 'true']));

  const restore = async () => {
    const values = Object.fromEntries(Object.entries(changed).map(([key]) => [key, original[key]]));
    if (!Object.keys(values).length) return;
    await readJson(await request.put(`${API_URL}${path}`, { data: values, headers }), `restore ${category} settings`);
  };

  if (Object.keys(changed).length) {
    try {
      await readJson(await request.put(`${API_URL}${path}`, { data: changed, headers }), `enable ${category} settings`);
    } catch (error) {
      try {
        await restore();
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], `enable ${category} settings failed and restoration failed`);
      }
      throw error;
    }
  }
  return restore;
}

async function listFriends(request: APIRequestContext, headers: RequestHeaders): Promise<JsonRecord[]> {
  const body = asRecord(responseData(await readJson(await request.get(`${API_URL}/api/v1/friends`, { headers }), 'list friends')));
  return asRecords(body.friends);
}

async function pendingRequests(request: APIRequestContext, headers: RequestHeaders): Promise<JsonRecord[]> {
  const body = asRecord(responseData(await readJson(await request.get(`${API_URL}/api/v1/friends/requests`, { headers }), 'list friend requests')));
  return asRecords(body.requests);
}

/** Ensure the two seeded E2E accounts are friends, and return a cleanup for only a relation this test establishes. */
async function ensureFriendPair(
  request: APIRequestContext,
  userHeaders: RequestHeaders,
  adminHeaders: RequestHeaders,
): Promise<() => Promise<void>> {
  const userId = TEST_USERS.user.id;
  const adminId = TEST_USERS.admin.id;
  const [userFriends, adminFriends] = await Promise.all([
    listFriends(request, userHeaders),
    listFriends(request, adminHeaders),
  ]);
  if (userFriends.some((friend) => Number(friend.id) === adminId)
    || adminFriends.some((friend) => Number(friend.id) === userId)) {
    return async () => undefined;
  }

  let pendingId: number | null = null;
  let recipientHeaders: RequestHeaders | null = null;
  let relationshipCreated = false;
  try {
    const [pendingToUser, pendingToAdmin] = await Promise.all([
      pendingRequests(request, userHeaders),
      pendingRequests(request, adminHeaders),
    ]);
    const incomingToUser = pendingToUser.find((row) => Number(asRecord(row.requester).id) === adminId);
    const incomingToAdmin = pendingToAdmin.find((row) => Number(asRecord(row.requester).id) === userId);

    if (incomingToAdmin) {
      pendingId = Number(incomingToAdmin.id);
      recipientHeaders = adminHeaders;
    } else if (incomingToUser) {
      pendingId = Number(incomingToUser.id);
      recipientHeaders = userHeaders;
    } else {
      const input: CreateFriendRequestDto = { target_user_id: adminId };
      const requestBody = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/friends/requests`, {
        data: input,
        headers: userHeaders,
      }), 'create friend request')));
      pendingId = Number(requestBody.id);
      recipientHeaders = adminHeaders;
      if (!Number.isSafeInteger(pendingId) || pendingId < 1) throw new Error('Friend request response did not include its request id');
    }

    const accepted = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/friends/requests/${pendingId}/accept`, {
      headers: recipientHeaders!,
    }), 'accept friend request')));
    expect(accepted.status).toBe('accepted');
    relationshipCreated = true;
    pendingId = null;

    const friends = await listFriends(request, userHeaders);
    expect(friends.some((friend) => Number(friend.id) === adminId)).toBe(true);
  } catch (error) {
    const cleanupActions: Promise<void>[] = [];
    if (pendingId && recipientHeaders) {
      cleanupActions.push(request.post(`${API_URL}/api/v1/friends/requests/${pendingId}/reject`, { headers: recipientHeaders })
        .then((response) => cleanupResponse(response, 'reject leftover E2E friend request', true)));
    }
    cleanupActions.push(request.delete(`${API_URL}/api/v1/friends/${adminId}`, { headers: userHeaders })
      .then((response) => cleanupResponse(response, 'remove incomplete E2E friend relation', true)));
    const cleanupResults = await Promise.allSettled(cleanupActions);
    const cleanupErrors = cleanupResults.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
    if (cleanupErrors.length) {
      throw new AggregateError([error, ...cleanupErrors], 'friend setup failed and cleanup was incomplete');
    }
    throw error;
  }

  return async () => {
    if (!relationshipCreated) return;
    const response = await request.delete(`${API_URL}/api/v1/friends/${adminId}`, { headers: userHeaders });
    if (!response.ok() && response.status() !== 404) {
      throw new Error(`remove E2E friend relation failed (${response.status()}): ${await response.text()}`);
    }
  };
}

async function cleanupResponse(response: APIResponse, operation: string, allowNotFound = false): Promise<void> {
  if (response.ok() || (allowNotFound && response.status() === 404)) return;
  throw new Error(`${operation} failed (${response.status()}): ${await response.text()}`);
}

authTest.describe('Friends, Multiplayer, and Cloud Saves product API flows', () => {
  authTest.describe.configure({ mode: 'serial' });
  authTest.skip(({ browserName }) => browserName !== 'chromium', 'These API-backed E2E flows use the shared seeded accounts and run once on Chromium.');

  authTest('friends can see a live Presence connection and heartbeat', async ({ authenticatedPage, request }) => {
    const userHeaders = await pageSessionHeaders(authenticatedPage);
    const adminHeaders = await adminSessionHeaders(request);
    const restorePresence = await temporarilyEnableSettings(request, adminHeaders, 'features', [
      'feature_social_presence_v1_enabled',
    ]);
    let cleanupFriend: (() => Promise<void>) | null = null;
    let connectionId: string | null = null;
    let previousPresenceStatus: string | null = null;

    try {
      cleanupFriend = await ensureFriendPair(request, userHeaders, adminHeaders);
      const privacy = asRecord(responseData(await readJson(await request.get(`${API_URL}/api/v1/social/privacy`, {
        headers: userHeaders,
      }), 'read original social Presence settings')));
      previousPresenceStatus = String(privacy.status || '');
      expect(['online', 'idle', 'dnd', 'invisible']).toContain(previousPresenceStatus);

      const input: CreatePresenceConnectionDto = { platform: 'web', status: 'online' };
      const created = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/presence/connections`, {
        data: input,
        headers: userHeaders,
      }), 'create Presence connection')));
      connectionId = String(created.connection_id || '');
      expect(connectionId).toMatch(/^[A-Za-z0-9_-]{8,}$/);

      const statusPatch: PatchPresenceConnectionDto = { status: 'idle' };
      const patched = asRecord(responseData(await readJson(await request.patch(`${API_URL}/api/v1/presence/connections/${encodeURIComponent(connectionId)}`, {
        data: statusPatch,
        headers: userHeaders,
      }), 'update Presence status')));
      expect(patched.status).toBe('idle');

      const heartbeat = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/presence/connections/${encodeURIComponent(connectionId)}/heartbeat`, {
        headers: userHeaders,
      }), 'heartbeat Presence connection')));
      expect(heartbeat.acknowledged).toBe(true);

      const feed = asRecord(responseData(await readJson(await request.get(`${API_URL}/api/v1/social/friends/presence?page=1&limit=50`, {
        headers: adminHeaders,
      }), 'read friends Presence feed')));
      const friend = asRecords(feed.data).find((item) => Number(asRecord(item.user).id) === TEST_USERS.user.id);
      expect(friend, 'the newly connected friend should appear in the social Presence feed').toBeTruthy();
      expect(asRecord(asRecord(friend).presence).status).toBe('idle');
    } finally {
      try {
        if (connectionId) {
          if (previousPresenceStatus) {
            const restoreStatus: PatchPresenceConnectionDto = { status: previousPresenceStatus as PatchPresenceConnectionDto['status'] };
            await readJson(await request.patch(`${API_URL}/api/v1/presence/connections/${encodeURIComponent(connectionId)}`, {
              data: restoreStatus,
              headers: userHeaders,
            }), 'restore original Presence status');
          }
          await cleanupResponse(await request.delete(`${API_URL}/api/v1/presence/connections/${encodeURIComponent(connectionId)}`, {
            headers: userHeaders,
          }), 'delete Presence connection', true);
        }
        if (cleanupFriend) await cleanupFriend();
      } finally {
        await restorePresence();
      }
    }
  });

  authTest('a friend accepts an invite, consumes its join intent, and leaves the Multiplayer session', async ({ authenticatedPage, request }) => {
    const userHeaders = await pageSessionHeaders(authenticatedPage);
    const adminHeaders = await adminSessionHeaders(request);
    const restoreMultiplayer = await temporarilyEnableSettings(request, adminHeaders, 'features', [
      'feature_multiplayer_sessions_v1_enabled',
      'feature_multiplayer_invites_v1_enabled',
    ]);
    let cleanupFriend: (() => Promise<void>) | null = null;
    let sessionId: string | null = null;
    let inviteId: string | null = null;
    let inviteAccepted = false;
    let memberMayHaveJoined = false;

    try {
      cleanupFriend = await ensureFriendPair(request, userHeaders, adminHeaders);

      const input: CreateMultiplayerSessionDto = {
        game_id: 'mindustry',
        game_version: 'v157',
        activity_name: `E2E Multiplayer ${Date.now()}`,
        visibility: 'friends',
        join_policy: 'friends',
        max_players: 2,
      };
      const created = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/multiplayer/sessions`, {
        data: input,
        headers: userHeaders,
      }), 'create Multiplayer session')));
      const session = asRecord(created.session);
      const ownerPeer = asRecord(created.peer);
      sessionId = String(session.id || '');
      expect(sessionId).toMatch(/^ses_/);
      expect(ownerPeer.role).toBe('owner');
      expect(session.status).toBe('active');

      const inviteInput: CreateMultiplayerInviteDto = {
        session_id: sessionId,
        target_user_id: TEST_USERS.admin.id,
      };
      const invite = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/multiplayer/invites`, {
        data: inviteInput,
        headers: userHeaders,
      }), 'invite friend to Multiplayer session')));
      inviteId = String(invite.invite_id || '');
      expect(inviteId).toMatch(/^inv_/);
      expect(invite.status).toBe('pending');

      const incoming = asRecords(responseData(await readJson(await request.get(`${API_URL}/api/v1/multiplayer/invites`, {
        headers: adminHeaders,
      }), 'list Multiplayer invites')));
      expect(incoming.some((row) => row.invite_id === inviteId)).toBe(true);

      const accepted = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/multiplayer/invites/${encodeURIComponent(inviteId)}/accept`, {
        headers: adminHeaders,
      }), 'accept Multiplayer invite')));
      inviteAccepted = true;
      expect(accepted.status).toBe('accepted');
      const joinIntent = asRecord(accepted.join_intent);
      expect(joinIntent.intent_id).toBeTruthy();

      const consumeInput: JoinIntentConsumeDto = { capabilities: { supports_udp: true, e2e: true } };
      memberMayHaveJoined = true;
      const joined = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/multiplayer/join-intents/${encodeURIComponent(String(joinIntent.intent_id))}/consume`, {
        data: consumeInput,
        headers: adminHeaders,
      }), 'consume Multiplayer join intent')));
      const joinedPeer = asRecord(joined.peer);
      expect(joinedPeer.role).toBe('member');
      expect(joinedPeer.status).toBe('active');

      const peers = asRecords(responseData(await readJson(await request.get(`${API_URL}/api/v1/multiplayer/sessions/${encodeURIComponent(sessionId)}/peers`, {
        headers: userHeaders,
      }), 'list Multiplayer peers')));
      expect(peers).toHaveLength(2);
      expect(peers.map((peer) => Number(peer.user_id)).sort()).toEqual([
        TEST_USERS.admin.id,
        TEST_USERS.user.id,
      ].sort());

      const heartbeat = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/multiplayer/sessions/${encodeURIComponent(sessionId)}/peers/${encodeURIComponent(String(joinedPeer.peer_id))}/heartbeat`, {
        headers: adminHeaders,
      }), 'heartbeat Multiplayer peer')));
      expect(heartbeat.peer_id).toBe(joinedPeer.peer_id);
      expect(heartbeat.expires_in).toBeGreaterThan(0);
    } finally {
      try {
        if (sessionId && memberMayHaveJoined) {
          await cleanupResponse(await request.post(`${API_URL}/api/v1/multiplayer/sessions/${encodeURIComponent(sessionId)}/leave`, {
            headers: adminHeaders,
          }), 'leave Multiplayer session as invited peer', true);
        }
        if (sessionId) {
          const ownerLeave = await request.post(`${API_URL}/api/v1/multiplayer/sessions/${encodeURIComponent(sessionId)}/leave`, {
            headers: userHeaders,
          });
          if (ownerLeave.ok()) {
            const closed = asRecord(responseData(await readJson(ownerLeave, 'close Multiplayer session as owner')));
            expect(closed.status).toBe('closing');
          } else {
            await cleanupResponse(ownerLeave, 'close Multiplayer session as owner', true);
          }
        }
        if (inviteId && !inviteAccepted) {
          // Revocation is available only while pending; accepted invites remain as lifecycle history.
          await cleanupResponse(await request.post(`${API_URL}/api/v1/multiplayer/invites/${encodeURIComponent(inviteId)}/revoke`, {
            headers: userHeaders,
          }), 'revoke pending Multiplayer invite', true);
        }
        if (cleanupFriend) await cleanupFriend();
      } finally {
        await restoreMultiplayer();
      }
    }
  });

  authTest('Cloud Saves uploads, commits, downloads, and deletes a snapshot through V1 APIs', async ({ authenticatedPage, request }) => {
    const userHeaders = await pageSessionHeaders(authenticatedPage);
    const adminHeaders = await adminSessionHeaders(request);
    const restoreCloudSaves = await temporarilyEnableSettings(request, adminHeaders, 'cloud-saves', ['cloud_saves_enabled']);
    let slotId: string | null = null;
    let uploadId: string | null = null;

    try {
      const quota = asRecord(responseData(await readJson(await request.get(`${API_URL}/api/v1/game-saves/quota`, {
        headers: userHeaders,
      }), 'read Cloud Saves quota')));
      expect(quota.limit_bytes).toBeGreaterThan(0);
      expect(quota.max_file_size_bytes).toBeGreaterThan(0);

      const slotInput: CreateGameSaveSlotDto = { name: `E2E Cloud Save ${Date.now()}` };
      const slot = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/game-saves`, {
        data: slotInput,
        headers: userHeaders,
      }), 'create Cloud Save slot')));
      slotId = String(slot.id || '');
      expect(slotId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(slot.current_snapshot).toBeNull();

      const file = Buffer.from(`Mindustry Club E2E save fixture ${Date.now()}\n`);
      const sha256 = createHash('sha256').update(file).digest('hex');
      const uploadInput: CreateGameSaveUploadDto = {
        sha256,
        size: file.length,
        reason: 'manual',
        game: { version: 'v157', build: 157 },
        save: { map_name: 'E2E Salt Flats', wave: 12, playtime_seconds: 600 },
        device_id: 'playwright-e2e',
      };
      const upload = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/game-saves/${encodeURIComponent(slotId)}/uploads`, {
        data: uploadInput,
        headers: userHeaders,
      }), 'create Cloud Save upload session')));
      uploadId = String(upload.upload_id || '');
      const uploadDescriptor = asRecord(upload.upload);
      expect(uploadId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(uploadDescriptor.method).toBe('PUT');

      const received = asRecord(responseData(await readJson(await request.put(`${API_URL}/api/v1/game-saves/uploads/${encodeURIComponent(uploadId)}/file`, {
        data: file,
        headers: { ...userHeaders, 'Content-Type': 'application/octet-stream' },
      }), 'upload Cloud Save bytes')));
      expect(received.uploaded).toBe(true);
      expect(received.size_bytes).toBe(file.length);
      expect(received.sha256).toBe(sha256);

      const snapshot = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/game-saves/uploads/${encodeURIComponent(uploadId)}/commit`, {
        headers: userHeaders,
      }), 'commit Cloud Save upload')));
      expect(snapshot.revision).toBe(1);
      expect(snapshot.sha256).toBe(sha256);
      expect(snapshot.size).toBe(file.length);

      const fetchedSlot = asRecord(responseData(await readJson(await request.get(`${API_URL}/api/v1/game-saves/${encodeURIComponent(slotId)}`, {
        headers: userHeaders,
      }), 'read Cloud Save slot')));
      const currentSnapshot = asRecord(fetchedSlot.current_snapshot);
      expect(currentSnapshot.id).toBe(snapshot.id);
      expect(asRecord(currentSnapshot.save)).toMatchObject({ map_name: 'E2E Salt Flats', wave: 12 });

      const history = asRecords(responseData(await readJson(await request.get(`${API_URL}/api/v1/game-saves/${encodeURIComponent(slotId)}/snapshots`, {
        headers: userHeaders,
      }), 'list Cloud Save snapshots')));
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ id: snapshot.id, revision: 1, sha256, size: file.length });

      const grant = asRecord(responseData(await readJson(await request.post(`${API_URL}/api/v1/game-saves/${encodeURIComponent(slotId)}/snapshots/${encodeURIComponent(String(snapshot.id))}/download`, {
        headers: userHeaders,
      }), 'request Cloud Save download')));
      const downloadDescriptor = asRecord(grant.download);
      expect(downloadDescriptor.method).toBe('GET');
      expect(downloadDescriptor.sha256).toBe(sha256);
      const download = await request.get(`${API_URL}${String(downloadDescriptor.url)}`, { headers: userHeaders });
      expect(download.ok(), `download snapshot failed (${download.status()}): ${await download.text()}`).toBe(true);
      expect(Buffer.from(await download.body())).toEqual(file);
    } finally {
      try {
        if (uploadId) {
          await cleanupResponse(await request.delete(`${API_URL}/api/v1/game-saves/uploads/${encodeURIComponent(uploadId)}`, {
            headers: userHeaders,
          }), 'cancel Cloud Save upload', true);
        }
        if (slotId) {
          const deleted = await request.delete(`${API_URL}/api/v1/game-saves/${encodeURIComponent(slotId)}`, {
            headers: userHeaders,
          });
          if (deleted.ok()) {
            const body = asRecord(responseData(await readJson(deleted, 'delete Cloud Save slot')));
            expect(body.deleted).toBe(true);
            expect((await request.get(`${API_URL}/api/v1/game-saves/${encodeURIComponent(slotId)}`, { headers: userHeaders })).status()).toBe(404);
          } else {
            await cleanupResponse(deleted, 'delete Cloud Save slot', true);
          }
        }
      } finally {
        await restoreCloudSaves();
      }
    }
  });
});
