import { fetchV1, requestV1 } from './transport';

/**
 * Squad shared saves (小队共享存档接力) V1 client.
 *
 * Every call goes through the V1 transport so cookies, CSRF and the
 * `{ data, meta }` envelope stay in one place. The squad API is only available
 * when the `squad_saves_v1` capability is on; the page checks it first.
 */

export type SquadRole = 'owner' | 'admin' | 'member';
export type SquadMemberStatus = 'active' | 'invited' | 'left' | 'kicked';
export type SquadSnapshotBranch = 'main' | 'conflict';

export type SquadSummary = {
  id: string;
  name: string;
  owner_user_id: number;
  my_role: SquadRole;
  max_members: number;
  max_slots: number;
  member_count: number;
  slot_count: number;
  created_at: string;
  updated_at: string;
};

export type SquadInvitation = {
  squad_id: string;
  squad_name: string;
  owner_user_id: number;
  role: SquadRole;
  invited_by_username: string | null;
  created_at: string;
};

export type SquadMember = {
  user_id: number;
  username: string | null;
  avatar_url: string | null;
  role: SquadRole;
  status: SquadMemberStatus;
  joined_at: string | null;
};

export type SquadLeaseSummary = {
  holder_user_id: number;
  holder_username: string | null;
  fencing_token: number;
  expires_at: string;
};

export type SquadSlotSummary = {
  id: string;
  name: string;
  head_snapshot_id: string | null;
  active_session_id: string | null;
  lanlink_room_code: string | null;
  game_version: string | null;
  created_by_user_id: number;
  updated_at: string;
  lease: SquadLeaseSummary | null;
};

export type SquadOwnershipTransfer = {
  id: string;
  from_user_id: number;
  to_user_id: number;
  expires_at: string;
};

export type SquadDetail = {
  id: string;
  name: string;
  owner_user_id: number;
  my_role: SquadRole;
  max_members: number;
  max_slots: number;
  members: SquadMember[];
  slots: SquadSlotSummary[];
  ownership_transfer: SquadOwnershipTransfer | null;
};

export type SquadLease = {
  slot_id: string;
  lease_id: string;
  holder_user_id: number;
  holder_client_id: string;
  multiplayer_session_id: string | null;
  fencing_token: number;
  status: 'active' | 'released' | 'expired';
  acquired_at: string;
  last_heartbeat_at: string;
  expires_at: string;
};

export type SquadLeaseStatus = {
  slot_id: string;
  lease: SquadLease | null;
  held_by_me: boolean;
};

export type AcquireSquadLeaseResult = {
  lease: SquadLease;
  taken_over: boolean;
  previous_holder_user_id: number | null;
  previous_lease_id: string | null;
};

export type RenewSquadLeaseResult = {
  slot_id: string;
  lease_id: string;
  fencing_token: number;
  expires_at: string;
  heartbeat_interval_seconds: number;
};

export type ReleaseSquadLeaseResult = {
  slot_id: string;
  lease_id: string;
  released: boolean;
};

export type SquadSlot = {
  id: string;
  squad_id: string;
  name: string;
  head_snapshot_id: string | null;
  active_session_id: string | null;
  lanlink_room_code: string | null;
  game_version: string | null;
  mods: unknown[];
  owner_user_id: number;
  created_by_user_id: number;
  created_at: string | null;
  updated_at: string | null;
};

export type SquadSnapshot = {
  id: string;
  slot_id: string;
  squad_id: string;
  revision: number;
  parent_snapshot_id: string | null;
  uploader_user_id: number;
  fencing_token: number;
  branch_type: SquadSnapshotBranch;
  retention_tier: string;
  format: string;
  sha256: string;
  size: number;
  file_count: number | null;
  game: { version: string | null; build: number | null };
  save: { map_name: string | null; wave: number | null; playtime_seconds: number | null };
  mods: { count: number; manifest_hash: string | null };
  reason: string;
  pinned: boolean;
  is_head: boolean;
  created_at: string;
};

export type SquadSnapshotList = {
  slot: SquadSlot;
  snapshots: SquadSnapshot[];
};

export type SquadSlotDetail = {
  slot: SquadSlot;
  head: SquadSnapshot | null;
  lease: {
    holder_user_id: number;
    holder_client_id: string;
    fencing_token: number;
    expires_at: string;
    multiplayer_session_id: string | null;
  } | null;
  pinned_count: number;
};

export type SquadSnapshotManifest = {
  format: string;
  snapshot_id: string;
  revision: number;
  branch_type: SquadSnapshotBranch;
  sha256: string;
  size: number;
  files: Array<{ path: string; size: number; sha256: string }>;
  game: { version: string | null; build: number | null };
  save: { map_name: string | null; wave: number | null; playtime_seconds: number | null };
  mods: unknown[];
  created_at: string;
};

export type SquadBlobDownloadGrant = {
  downloads: Array<{
    path: string;
    size: number;
    sha256: string;
    download: {
      method: 'GET';
      url: string;
      headers: Record<string, string>;
      size: number;
      sha256: string;
      expires_at: string | null;
      reusable: boolean;
    };
  }>;
};

export type CreateSquadSlotOptions = {
  game_version?: string;
  mods?: unknown[];
};

const squadPath = (squadId: string) => `/squads/${encodeURIComponent(squadId)}`;
const slotPath = (squadId: string, slotId: string) =>
  `${squadPath(squadId)}/slots/${encodeURIComponent(slotId)}`;

function encodeSnapshotsPath(squadId: string, slotId: string, snapshotId: string): string {
  return `${slotPath(squadId, slotId)}/snapshots/${encodeURIComponent(snapshotId)}`;
}

// --------------------------------------------------------------- squads

export const listSquads = () => fetchV1<SquadSummary[]>('/squads');

export const listSquadInvitations = () => fetchV1<SquadInvitation[]>('/squads/invitations');

export const createSquad = (name: string) =>
  requestV1<SquadSummary>('/squads', { method: 'POST', body: JSON.stringify({ name }) });

export const getSquad = (squadId: string) =>
  fetchV1<SquadDetail>(squadPath(squadId));

export const renameSquad = (squadId: string, name: string) =>
  requestV1<{ id: string; name: string }>(squadPath(squadId), {
    method: 'PATCH', body: JSON.stringify({ name }),
  });

export const deleteSquad = (squadId: string) =>
  requestV1<{ id: string; deleted: boolean }>(squadPath(squadId), { method: 'DELETE' });

// --------------------------------------------------------------- members

export const inviteSquadMember = (squadId: string, userId: number) =>
  requestV1<{ squad_id: string; user_id: number; status: 'invited'; already_invited: boolean }>(
    `${squadPath(squadId)}/members`,
    { method: 'POST', body: JSON.stringify({ user_id: userId }) },
  );

export const acceptSquadInvitation = (squadId: string) =>
  requestV1<{ squad_id: string; status: 'active'; role: SquadRole }>(
    `${squadPath(squadId)}/members/accept`, { method: 'POST', body: '{}' },
  );

export const declineSquadInvitation = (squadId: string) =>
  requestV1<{ squad_id: string; status: 'declined' }>(
    `${squadPath(squadId)}/members/decline`, { method: 'POST', body: '{}' },
  );

export const setSquadMemberRole = (squadId: string, userId: number, role: 'admin' | 'member') =>
  requestV1<{ squad_id: string; user_id: number; role: 'admin' | 'member' }>(
    `${squadPath(squadId)}/members/${encodeURIComponent(String(userId))}`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
  );

export const removeSquadMember = (squadId: string, userId: number) =>
  requestV1<{ squad_id: string; user_id: number; status: 'left' | 'kicked' }>(
    `${squadPath(squadId)}/members/${encodeURIComponent(String(userId))}`,
    { method: 'DELETE' },
  );

// ----------------------------------------------------- ownership transfer

export const createOwnershipTransfer = (squadId: string, targetUserId: number) =>
  requestV1<SquadOwnershipTransfer & { squad_id: string; status: 'pending' }>(
    `${squadPath(squadId)}/ownership-transfer`,
    { method: 'POST', body: JSON.stringify({ target_user_id: targetUserId }) },
  );

export const acceptOwnershipTransfer = (squadId: string) =>
  requestV1<{
    transfer_id: string; squad_id: string; owner_user_id: number; from_user_id: number;
    squad_bytes: number; usage_after: { personal_bytes: number; owned_squads_bytes: number; pending_bytes: number };
  }>(`${squadPath(squadId)}/ownership-transfer/accept`, { method: 'POST', body: '{}' });

export const declineOwnershipTransfer = (squadId: string) =>
  requestV1<{ transfer_id: string; squad_id: string; status: 'declined' }>(
    `${squadPath(squadId)}/ownership-transfer/decline`, { method: 'POST', body: '{}' },
  );

export const cancelOwnershipTransfer = (squadId: string) =>
  requestV1<{ transfer_id: string; squad_id: string; status: 'cancelled' }>(
    `${squadPath(squadId)}/ownership-transfer/cancel`, { method: 'POST', body: '{}' },
  );

// ----------------------------------------------------------------- slots

export const listSquadSlots = (squadId: string) =>
  fetchV1<SquadSlotSummary[]>(`${squadPath(squadId)}/slots`);

export const createSquadSlot = (squadId: string, name: string, options?: CreateSquadSlotOptions) =>
  requestV1<{ id: string; squad_id: string; name: string; head_snapshot_id: null; created_by_user_id: number }>(
    `${squadPath(squadId)}/slots`,
    { method: 'POST', body: JSON.stringify({ name, ...options }) },
  );

export const getSquadSlot = (squadId: string, slotId: string) =>
  fetchV1<SquadSlotDetail>(slotPath(squadId, slotId));

export const renameSquadSlot = (squadId: string, slotId: string, name: string) =>
  requestV1<{ id: string; name: string }>(slotPath(squadId, slotId), {
    method: 'PATCH', body: JSON.stringify({ name }),
  });

export const deleteSquadSlot = (squadId: string, slotId: string) =>
  requestV1<{ id: string; deleted: boolean }>(slotPath(squadId, slotId), { method: 'DELETE' });

// ----------------------------------------------------------------- lease

export const getSquadLease = (squadId: string, slotId: string) =>
  fetchV1<SquadLeaseStatus>(`${slotPath(squadId, slotId)}/lease`);

export const acquireSquadLease = (squadId: string, slotId: string, force = false) =>
  requestV1<AcquireSquadLeaseResult>(`${slotPath(squadId, slotId)}/lease/acquire`, {
    method: 'POST', body: JSON.stringify(force ? { force_takeover: true } : {}),
  });

export const renewSquadLease = (squadId: string, slotId: string, fencingToken: number) =>
  requestV1<RenewSquadLeaseResult>(`${slotPath(squadId, slotId)}/lease/renew`, {
    method: 'POST', body: JSON.stringify({ fencing_token: fencingToken }),
  });

export const releaseSquadLease = (squadId: string, slotId: string, fencingToken?: number) =>
  requestV1<ReleaseSquadLeaseResult>(`${slotPath(squadId, slotId)}/lease`, {
    method: 'DELETE',
    body: JSON.stringify(fencingToken == null ? {} : { fencing_token: fencingToken }),
  });

// ------------------------------------------------------------- snapshots

export const listSquadSnapshots = (squadId: string, slotId: string) =>
  fetchV1<SquadSnapshotList>(`${slotPath(squadId, slotId)}/snapshots`);

export const restoreSquadSnapshot = (
  squadId: string,
  slotId: string,
  snapshotId: string,
  fencingToken: number,
  confirmHeadSnapshotId: string | null,
) => requestV1<{ snapshot: SquadSnapshot; pruned_snapshot_ids: string[] }>(
  `${encodeSnapshotsPath(squadId, slotId, snapshotId)}/restore`,
  {
    method: 'POST',
    body: JSON.stringify({
      fencing_token: fencingToken,
      confirm_head_snapshot_id: confirmHeadSnapshotId,
    }),
  },
);

export const pinSquadSnapshot = (squadId: string, slotId: string, snapshotId: string, pinned: boolean) =>
  requestV1<{ id: string; pinned: boolean; retention_tier: string }>(
    encodeSnapshotsPath(squadId, slotId, snapshotId),
    { method: 'PATCH', body: JSON.stringify({ pinned }) },
  );

export const deleteSquadSnapshot = (squadId: string, slotId: string, snapshotId: string) =>
  requestV1<{ id: string; deleted: boolean }>(
    encodeSnapshotsPath(squadId, slotId, snapshotId), { method: 'DELETE' },
  );

export const getSquadSnapshotManifest = (squadId: string, slotId: string, snapshotId: string) =>
  fetchV1<SquadSnapshotManifest>(`${encodeSnapshotsPath(squadId, slotId, snapshotId)}/manifest`);

/**
 * Ask the server for same-origin download URLs for the given files of a
 * snapshot. Uploads are handled by the launcher; the web page only needs the
 * restore-side grants.
 */
export const createSquadBlobDownload = (
  squadId: string,
  slotId: string,
  snapshotId: string,
  sha256: string | string[],
) => requestV1<SquadBlobDownloadGrant>(
  `${encodeSnapshotsPath(squadId, slotId, snapshotId)}/blobs/download`,
  {
    method: 'POST',
    body: JSON.stringify({ sha256: Array.isArray(sha256) ? sha256 : [sha256] }),
  },
);