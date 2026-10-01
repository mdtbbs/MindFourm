import { fetchV1, requestV1 } from './transport';

export type GameSaveSnapshot = {
  id: string; revision: number; reason: string; size: number; sha256: string;
  game: { version: string | null; build: number | null };
  save: { map_name: string | null; wave: number | null; playtime_seconds: number | null };
  mods: { count: number; manifest_hash: string | null };
  source: { client_id: string | null; client_name: string | null; device_id: string | null };
  pinned: boolean; created_at: string;
};

export type GameSaveSlot = {
  id: string; name: string; updated_at: string;
  current_snapshot: null | {
    id: string; revision: number; sha256: string; size: number;
    game: { version: string | null; build: number | null };
    save: { map_name: string | null; wave: number | null; playtime_seconds: number | null };
    created_at: string;
  };
};

export type GameSaveQuota = {
  used_bytes: number; limit_bytes: number; max_file_size_bytes: number;
  slots: { used: number; limit: number };
  retention: { max_unpinned_versions_per_slot: number; max_unpinned_age_days: number };
};

export const getGameSaveQuota = () => fetchV1<GameSaveQuota>('/game-saves/quota');
export const listGameSaves = () => fetchV1<GameSaveSlot[]>('/game-saves?limit=100');
export const getGameSaveHistory = (slotId: string) => fetchV1<GameSaveSnapshot[]>(`/game-saves/${encodeURIComponent(slotId)}/snapshots`);
export const renameGameSave = (slotId: string, name: string) => requestV1<GameSaveSlot>(`/game-saves/${encodeURIComponent(slotId)}`, { method: 'PATCH', body: JSON.stringify({ name }) });
export const deleteGameSave = (slotId: string) => requestV1<{ deleted: boolean }>(`/game-saves/${encodeURIComponent(slotId)}`, { method: 'DELETE' });
export const pinGameSaveSnapshot = (slotId: string, snapshotId: string, pinned: boolean) => requestV1<{ pinned: boolean }>(
  `/game-saves/${encodeURIComponent(slotId)}/snapshots/${encodeURIComponent(snapshotId)}`, { method: 'PATCH', body: JSON.stringify({ pinned }) },
);
export const deleteGameSaveSnapshot = (slotId: string, snapshotId: string) => requestV1<{ deleted: boolean }>(
  `/game-saves/${encodeURIComponent(slotId)}/snapshots/${encodeURIComponent(snapshotId)}`, { method: 'DELETE' },
);
export const restoreGameSaveSnapshot = (slotId: string, snapshotId: string, currentSnapshotId: string | null) => requestV1(
  `/game-saves/${encodeURIComponent(slotId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`, {
    method: 'POST', body: JSON.stringify({ confirm_current_snapshot_id: currentSnapshotId }),
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  },
);
export const createGameSaveDownload = (slotId: string, snapshotId: string) => requestV1<{
  download: { method: 'GET'; url: string; headers: Record<string, string>; size: number; sha256: string; file_name: string };
}>(`/game-saves/${encodeURIComponent(slotId)}/snapshots/${encodeURIComponent(snapshotId)}/download`, { method: 'POST', body: '{}' });
