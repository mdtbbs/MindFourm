"use client";

import { useCallback, useEffect, useState } from "react";
import { lanlinkClient, type PublicRoom } from "@/lib/api/lanlinkClient";
import Badge from "@/components/ui/badge";
import { useI18n } from "@/i18n/provider";

const POLL_INTERVAL = 15_000;

function present(value: string | number | null | undefined, fallback: string): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
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

export default function RoomList() {
  const { locale, t } = useI18n();
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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

      {rooms.length === 0 ? (
        <div className="card py-12 text-center">
          <p className="font-medium">{t("lanlink.noRooms")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("lanlink.noRoomsHint")}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rooms.map((room) => {
            const lastUpdated = formatUpdatedAt(room.updated_at, locale);
            const nodeName = room.node_name ?? room.node?.name ?? room.node?.id;
            const hasPlayerCount = typeof room.players === "number";

            return (
              <article
                key={room.code}
                className="card flex min-w-0 flex-col gap-4 p-5"
              >
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
                          {typeof room.max_players === "number"
                            ? ` / ${room.max_players}`
                            : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <Badge variant="success">{t("lanlink.online")}</Badge>
                </div>

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
                    onClick={() => void copyRoomCode(room.code)}
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
          })}
        </div>
      )}
    </section>
  );
}
