"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  lanlinkClient,
  type PublicRoom,
  type RoomModSummaryMod,
} from "@/lib/api/lanlinkClient";
import { siteProfile } from "@/config/site-profile";
import Badge from "@/components/ui/badge";
import { useI18n } from "@/i18n/provider";

const POLL_INTERVAL = 15_000;
const FILTER_TITLE_ID = "room-mod-filter-title";
export const ROOM_MOD_DIALOG_TITLE_ID = "room-mod-dialog-title";

export type RoomKindFilter = "all" | "vanilla" | "modded";

type Translate = (key: string, values?: Record<string, string | number>) => string;

function present(value: string | number | null | undefined, fallback: string): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function forumUserId(room: PublicRoom, fallback: string): string {
  return present(room.owner.forum_user_id ?? room.owner.id, fallback);
}

function forumUserName(room: PublicRoom, fallback: string): string {
  return present(
    room.owner.forum_display_name ??
      room.owner.display_name ??
      room.owner.forum_username ??
      room.owner.username,
    fallback,
  );
}

function gamePlayerId(room: PublicRoom, fallback: string): string {
  return present(
    room.owner.game_player_id ??
      room.owner.player_id ??
      room.game_player_id ??
      room.player_id,
    fallback,
  );
}

function gamePlayerName(room: PublicRoom, fallback: string): string {
  return present(room.owner.game_name ?? room.game_name, fallback);
}

function formatUpdatedAt(value: PublicRoom["updated_at"], locale: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  const normalized =
    typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(locale, { hour12: false });
}

/** The mod list of a room, tolerating legacy rooms and malformed payloads. */
function roomMods(room: PublicRoom): RoomModSummaryMod[] {
  const mods = room.mod_summary?.mods;
  if (!Array.isArray(mods)) return [];
  return mods.filter((mod) => Boolean(mod) && typeof mod === "object");
}

/** Legacy rooms have no `mod_summary` and are treated as vanilla. */
export function isModdedRoom(room: PublicRoom): boolean {
  if (room.mod_summary?.modded === true) return true;
  return roomMods(room).length > 0;
}

export function modCountOf(room: PublicRoom): number {
  const declared = room.mod_summary?.mod_count;
  const listed = roomMods(room).length;
  if (typeof declared === "number" && Number.isFinite(declared)) {
    return Math.max(0, declared, listed);
  }
  return listed;
}

export function syncableCountOf(room: PublicRoom): number {
  const declared = room.mod_summary?.syncable_count;
  if (typeof declared === "number" && Number.isFinite(declared)) {
    return Math.max(0, declared);
  }
  return roomMods(room).filter((mod) => mod.syncable === true).length;
}

export interface RoomModFilterOption {
  id: string;
  label: string;
}

/** Deduplicated by `mod_id` (case-insensitive), labelled by display name. */
export function collectModOptions(rooms: PublicRoom[]): RoomModFilterOption[] {
  const seen = new Map<string, RoomModFilterOption>();
  for (const room of rooms) {
    for (const mod of roomMods(room)) {
      const id = textValue(mod.mod_id).trim();
      if (!id) continue;
      const key = id.toLowerCase();
      if (seen.has(key)) continue;
      const displayName = textValue(mod.display_name).trim();
      seen.set(key, { id, label: displayName || id });
    }
  }
  return Array.from(seen.values()).sort((a, b) => {
    const left = a.label.toLowerCase();
    const right = b.label.toLowerCase();
    if (left !== right) return left < right ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function filterRooms(
  rooms: PublicRoom[],
  kind: RoomKindFilter,
  modId: string,
): PublicRoom[] {
  const target = modId.trim().toLowerCase();
  return rooms.filter((room) => {
    const modded = isModdedRoom(room);
    if (kind === "vanilla" && modded) return false;
    if (kind === "modded" && !modded) return false;
    if (!target) return true;
    return roomMods(room).some(
      (mod) => textValue(mod.mod_id).trim().toLowerCase() === target,
    );
  });
}

export function RoomModBadges({ room, t }: { room: PublicRoom; t: Translate }) {
  const modded = isModdedRoom(room);
  const modCount = modCountOf(room);
  const syncableCount = syncableCountOf(room);
  if (!modded && syncableCount === 0) return null;
  return (
    <>
      {modded && (
        <Badge variant="primary">{t("lanlink.modCountBadge", { count: modCount })}</Badge>
      )}
      {syncableCount > 0 && (
        <Badge variant="success">{t("lanlink.syncableBadge", { count: syncableCount })}</Badge>
      )}
    </>
  );
}

export function RoomModFilters({
  rooms,
  kind,
  modId,
  onKindChange,
  onModChange,
  t,
}: {
  rooms: PublicRoom[];
  kind: RoomKindFilter;
  modId: string;
  onKindChange: (kind: RoomKindFilter) => void;
  onModChange: (modId: string) => void;
  t: Translate;
}) {
  const options = useMemo(() => collectModOptions(rooms), [rooms]);
  const target = modId.trim().toLowerCase();
  const selectedOption = target
    ? options.find((option) => option.id.toLowerCase() === target)
    : undefined;
  // Keep the current selection visible while polling replaces the room list.
  const selectOptions =
    selectedOption || !target ? options : [{ id: modId, label: modId }, ...options];
  const selectValue = selectedOption ? selectedOption.id : modId;
  const kinds: Array<{ value: RoomKindFilter; label: string }> = [
    { value: "all", label: t("lanlink.filterAll") },
    { value: "vanilla", label: t("lanlink.filterVanilla") },
    { value: "modded", label: t("lanlink.filterModded") },
  ];

  return (
    <div className="card space-y-2 p-3">
      <p id={FILTER_TITLE_ID} className="text-sm font-medium">
        {t("lanlink.modFiltersTitle")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-labelledby={FILTER_TITLE_ID}
          className="flex flex-wrap items-center gap-2"
        >
          {kinds.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={kind === item.value}
              onClick={() => onKindChange(item.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                kind === item.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          <span>{t("lanlink.modFilterLabel")}</span>
          <select
            value={selectValue}
            onChange={(event) => onModChange(event.target.value)}
            className="rounded-lg border border-border bg-[var(--bg)] px-2 py-1.5 text-sm text-[var(--text)]"
          >
            <option value="">{t("lanlink.modFilterPlaceholder")}</option>
            {selectOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function RoomCard({
  room,
  locale,
  copiedCode,
  onCopy,
  onShowMods,
  modSyncEnabled,
  t,
}: {
  room: PublicRoom;
  locale: string;
  copiedCode: string | null;
  onCopy: (code: string) => void;
  onShowMods: (room: PublicRoom, trigger: HTMLButtonElement) => void;
  modSyncEnabled: boolean;
  t: Translate;
}) {
  const lastUpdated = formatUpdatedAt(room.updated_at, locale);
  const nodeName = room.node_name ?? room.node?.name ?? room.node?.id;
  const hasPlayerCount = typeof room.players === "number";
  const modded = isModdedRoom(room);
  const syncableCount = syncableCountOf(room);

  return (
    <article className="card flex min-w-0 flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">
            {room.name || room.display_name || t("lanlink.unnamedRoom")}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {nodeName && <span>{t("lanlink.node", { name: nodeName })}</span>}
            {hasPlayerCount && (
              <span>
                {t("lanlink.playersOnline", { count: room.players ?? 0 })}
                {typeof room.max_players === "number" ? ` / ${room.max_players}` : ""}
              </span>
            )}
          </div>
        </div>
        <Badge variant="success">{t("lanlink.online")}</Badge>
      </div>

      {modSyncEnabled && (modded || syncableCount > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <RoomModBadges room={room} t={t} />
          {modded && (
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={(event) => onShowMods(room, event.currentTarget)}
              className="rounded-lg border border-border px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            >
              {t("lanlink.viewMods")}
            </button>
          )}
        </div>
      )}

      <div className="rounded-lg bg-muted/60 p-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {t("lanlink.roomMotd")}
        </p>
        <p className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-sm">
          {room.motd || room.display_name || t("lanlink.roomMotdEmpty")}
        </p>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
        <dt className="text-muted-foreground">{t("lanlink.forumUser")}</dt>
        <dd className="min-w-0 break-all font-medium">
          {forumUserName(room, t("lanlink.notProvided"))}
        </dd>
        <dt className="text-muted-foreground">{t("lanlink.forumId")}</dt>
        <dd className="min-w-0 break-all font-mono">
          {forumUserId(room, t("lanlink.notProvided"))}
        </dd>
        <dt className="text-muted-foreground">{t("lanlink.gameName")}</dt>
        <dd className="min-w-0 break-all font-medium">
          {gamePlayerName(room, t("lanlink.notProvided"))}
        </dd>
        <dt className="text-muted-foreground">{t("lanlink.gamePlayerId")}</dt>
        <dd className="min-w-0 break-all font-mono text-xs">
          {gamePlayerId(room, t("lanlink.notProvided"))}
        </dd>
      </dl>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <p className="text-xs text-muted-foreground">{t("lanlink.roomCode")}</p>
          <code className="font-bold text-primary">{room.code}</code>
        </div>
        <button
          type="button"
          onClick={() => onCopy(room.code)}
          className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          {copiedCode === room.code ? t("lanlink.copied") : t("lanlink.copyCode")}
        </button>
        {lastUpdated && (
          <p className="w-full text-right text-[11px] text-muted-foreground">
            {t("lanlink.lastUpdated", { time: lastUpdated })}
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * Accessible, read-only mod list for one room. Content is rendered as React
 * text only; no `dangerouslySetInnerHTML` is used for untrusted fields.
 */
export function RoomModsDialog({
  room,
  onClose,
  returnFocusRef,
  t,
}: {
  room: PublicRoom;
  onClose: () => void;
  returnFocusRef?: MutableRefObject<HTMLElement | null>;
  t: Translate;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    // Captured at mount: the trigger already exists when the dialog opens.
    const trigger = returnFocusRef?.current;
    return () => {
      if (trigger && trigger.isConnected) trigger.focus();
    };
  }, [returnFocusRef]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const summary = room.mod_summary;
  const mods = roomMods(room);
  const packTitle = textValue(summary?.pack?.title);
  const sessionId = textValue(room.multiplayer_session_id).trim();
  const roomName = room.name || room.display_name || t("lanlink.unnamedRoom");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={ROOM_MOD_DIALOG_TITLE_ID}
        className="card max-h-[85vh] w-full max-w-lg overflow-y-auto p-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={ROOM_MOD_DIALOG_TITLE_ID} className="text-lg font-bold">
              {t("lanlink.modDialogTitle")}
            </h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {t("lanlink.modDialogSubtitle", { room: roomName })}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t("lanlink.modDialogClose")}
            className="rounded-lg border border-border px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {packTitle && (
          <p className="mt-4 break-words rounded-lg bg-muted/60 p-3 text-sm">
            {t("lanlink.modPackTitle", { title: packTitle })}
          </p>
        )}

        {sessionId && (
          <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("lanlink.sessionId")}</dt>
            <dd className="min-w-0 break-all font-mono">{sessionId}</dd>
          </dl>
        )}

        {mods.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("lanlink.noMods")}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {mods.map((mod, index) => {
              const modId = textValue(mod.mod_id);
              const displayName = textValue(mod.display_name) || modId;
              const version = textValue(mod.version);
              return (
                <li
                  key={`${modId || "mod"}-${index}`}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-all font-medium">
                      {displayName || t("lanlink.notProvided")}
                    </p>
                    <Badge variant={mod.syncable === true ? "success" : "default"}>
                      {mod.syncable === true
                        ? t("lanlink.modSyncable")
                        : t("lanlink.modManual")}
                    </Badge>
                  </div>
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    <dt className="text-muted-foreground">{t("lanlink.modId")}</dt>
                    <dd className="min-w-0 break-all font-mono">
                      {modId || t("lanlink.notProvided")}
                    </dd>
                    <dt className="text-muted-foreground">{t("lanlink.modVersion")}</dt>
                    <dd className="min-w-0 break-all font-mono">
                      {version || t("lanlink.notProvided")}
                    </dd>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function RoomList() {
  const { locale, t } = useI18n();
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [roomKind, setRoomKind] = useState<RoomKindFilter>("all");
  const [modFilter, setModFilter] = useState("");
  const [modRoom, setModRoom] = useState<PublicRoom | null>(null);
  const modTriggerRef = useRef<HTMLElement | null>(null);
  const modSyncEnabled = siteProfile.features.multiplayerModSync === true;

  const fetchRooms = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const data = await lanlinkClient.getPublicRooms();
      // Defence in depth: never render a room unless the host explicitly opted
      // in to forum visibility in the Mod, even if the upstream endpoint
      // accidentally includes a private room.
      setRooms(
        Array.isArray(data.rooms)
          ? data.rooms.filter((room) => room.public === true)
          : [],
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lanlink.roomListFailed"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    let timer: number | undefined;
    const stopPolling = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const startPolling = () => {
      stopPolling();
      if (document.hidden) return;
      void fetchRooms();
      timer = window.setInterval(() => void fetchRooms(), POLL_INTERVAL);
    };
    const handleVisibilityChange = () => startPolling();

    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchRooms]);

  const copyRoomCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode(null), 2_000);
    } catch {
      setError(t("lanlink.clipboardFailed"));
    }
  };

  const visibleRooms = useMemo(
    () => (modSyncEnabled ? filterRooms(rooms, roomKind, modFilter) : rooms),
    [modSyncEnabled, rooms, roomKind, modFilter],
  );

  const openMods = useCallback((room: PublicRoom, trigger: HTMLElement) => {
    modTriggerRef.current = trigger;
    setModRoom(room);
  }, []);

  const closeMods = useCallback(() => setModRoom(null), []);

  if (loading) {
    return (
      <div className="card py-12 text-center text-muted-foreground">
        {t("lanlink.loadingRooms")}
      </div>
    );
  }

  return (
    <section aria-labelledby="online-rooms-title" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full bg-green-500"
            aria-hidden="true"
          />
          <h2 id="online-rooms-title" className="text-xl font-bold">
            {t("lanlink.publicRooms")}
          </h2>
          <Badge variant="success">{t("lanlink.onlineCount", { count: rooms.length })}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {t("lanlink.autoRefreshNote")}
          </span>
          <button
            type="button"
            onClick={() => void fetchRooms(true)}
            disabled={refreshing}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {refreshing ? t("lanlink.refreshing") : t("lanlink.refreshNow")}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {modSyncEnabled && rooms.length > 0 && (
        <RoomModFilters
          rooms={rooms}
          kind={roomKind}
          modId={modFilter}
          onKindChange={setRoomKind}
          onModChange={setModFilter}
          t={t}
        />
      )}

      {rooms.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="font-medium">{t("lanlink.noRooms")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("lanlink.noRoomsHint")}
          </p>
        </div>
      ) : visibleRooms.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="font-medium">{t("lanlink.filterNoResults")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("lanlink.filterNoResultsHint")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleRooms.map((room) => (
            <RoomCard
              key={room.code}
              room={room}
              locale={locale}
              copiedCode={copiedCode}
              onCopy={(code) => void copyRoomCode(code)}
              onShowMods={openMods}
              modSyncEnabled={modSyncEnabled}
              t={t}
            />
          ))}
        </div>
      )}

      {modSyncEnabled && modRoom && (
        <RoomModsDialog
          room={modRoom}
          onClose={closeMods}
          returnFocusRef={modTriggerRef}
          t={t}
        />
      )}
    </section>
  );
}
