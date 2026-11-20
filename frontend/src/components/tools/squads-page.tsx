'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft, Clock3, Crown, HardDrive, KeyRound, LoaderCircle, Lock, LogOut,
  Pin, RefreshCw, RotateCcw, Shield, Trash2, UserMinus, UserPlus, Users,
} from 'lucide-react';
import { fetchV1, V1ApiError } from '@/lib/api/v1/transport';
import {
  acceptOwnershipTransfer, acceptSquadInvitation, acquireSquadLease, cancelOwnershipTransfer,
  createOwnershipTransfer, createSquad, createSquadSlot, declineOwnershipTransfer,
  declineSquadInvitation, deleteSquadSlot, deleteSquadSnapshot, getSquad, getSquadLease,
  inviteSquadMember, listSquadInvitations, listSquadSnapshots, listSquads, pinSquadSnapshot,
  releaseSquadLease, removeSquadMember, renewSquadLease, restoreSquadSnapshot,
  setSquadMemberRole, type SquadDetail, type SquadInvitation, type SquadLeaseStatus,
  type SquadMember, type SquadSnapshot, type SquadSnapshotList, type SquadSummary,
} from '@/lib/api/v1/squads';
import { useI18n } from '@/i18n/provider';
import { useUserStore } from '@/store/user-store';
import { confirmDialog, promptDialog } from '@/store/interaction-dialog-store';

type Capability = { squad_saves_v1: boolean };
type LeaseHeldInfo = {
  holder_user_id: number | null;
  fencing_token: number | null;
  expires_at: string | null;
  lanlink_room_code: string | null;
};

export default function SquadsPage() {
  const { t } = useI18n();
  const userId = useUserStore((state) => state.user?.id ?? null);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [squads, setSquads] = useState<SquadSummary[]>([]);
  const [invitations, setInvitations] = useState<SquadInvitation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SquadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [snapshotList, setSnapshotList] = useState<SquadSnapshotList | null>(null);
  const [leaseStatus, setLeaseStatus] = useState<SquadLeaseStatus | null>(null);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [inviteUserId, setInviteUserId] = useState('');
  const [transferTarget, setTransferTarget] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [leaseHeld, setLeaseHeld] = useState<LeaseHeldInfo | null>(null);

  const selectedIdRef = useRef<string | null>(null);
  const selectedSlotIdRef = useRef<string | null>(null);
  const slotLoadToken = useRef(0);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { selectedSlotIdRef.current = selectedSlotId; }, [selectedSlotId]);

  const selectedSquad = useMemo(
    () => squads.find((squad) => squad.id === selectedId) || null,
    [squads, selectedId],
  );
  const selectedSlot = useMemo(
    () => detail?.slots.find((slot) => slot.id === selectedSlotId) || null,
    [detail, selectedSlotId],
  );
  const currentLease = leaseStatus?.lease || null;
  const heldByMe = Boolean(leaseStatus?.held_by_me && currentLease);
  const fencingToken = heldByMe && currentLease ? currentLease.fencing_token : null;
  const isManager = detail?.my_role === 'owner' || detail?.my_role === 'admin';
  const isOwner = detail?.my_role === 'owner';

  const loadAll = useCallback(async (preferredId?: string | null) => {
    setError('');
    setLoading(true);
    try {
      const capability = await fetchV1<Capability>('/capabilities');
      setEnabled(Boolean(capability.squad_saves_v1));
      if (!capability.squad_saves_v1) return;
      const [nextSquads, nextInvitations] = await Promise.all([listSquads(), listSquadInvitations()]);
      setSquads(nextSquads);
      setInvitations(nextInvitations);
      const previous = selectedIdRef.current;
      const nextId = preferredId && nextSquads.some((squad) => squad.id === preferredId)
        ? preferredId
        : previous && nextSquads.some((squad) => squad.id === previous) ? previous : nextSquads[0]?.id || null;
      selectedIdRef.current = nextId;
      setSelectedId(nextId);
      if (!nextId || nextId !== previous) {
        selectedSlotIdRef.current = null;
        setSelectedSlotId(null);
        setDetail(null);
        setSnapshotList(null);
        setLeaseStatus(null);
        setLeaseHeld(null);
      }
    } catch (cause) {
      setError(errorMessage(cause, t('squads.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadDetail = useCallback(async (squadId: string, preferredSlotId?: string | null) => {
    setDetailLoading(true);
    setError('');
    try {
      const next = await getSquad(squadId);
      if (selectedIdRef.current !== squadId) return;
      setDetail(next);
      const previousSlot = preferredSlotId === undefined ? selectedSlotIdRef.current : preferredSlotId;
      const nextSlotId = previousSlot && next.slots.some((slot) => slot.id === previousSlot)
        ? previousSlot
        : next.slots[0]?.id || null;
      selectedSlotIdRef.current = nextSlotId;
      setSelectedSlotId(nextSlotId);
      if (!nextSlotId) {
        setSnapshotList(null);
        setLeaseStatus(null);
      }
    } catch (cause) {
      setError(errorMessage(cause, t('squads.loadFailed')));
    } finally {
      setDetailLoading(false);
    }
  }, [t]);

  const loadSlot = useCallback(async (squadId: string, slotId: string) => {
    const token = ++slotLoadToken.current;
    setSnapshotsLoading(true);
    setError('');
    try {
      const [nextSnapshots, nextLease] = await Promise.all([
        listSquadSnapshots(squadId, slotId),
        getSquadLease(squadId, slotId),
      ]);
      if (slotLoadToken.current !== token) return;
      setSnapshotList(nextSnapshots);
      setLeaseStatus(nextLease);
    } catch (cause) {
      if (slotLoadToken.current !== token) return;
      setSnapshotList(null);
      setLeaseStatus(null);
      setError(errorMessage(cause, t('squads.loadFailed')));
    } finally {
      if (slotLoadToken.current === token) setSnapshotsLoading(false);
    }
  }, [t]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!selectedId || !selectedSlotId) {
      setSnapshotList(null);
      setLeaseStatus(null);
      setLeaseHeld(null);
      return;
    }
    setLeaseHeld(null);
    void loadSlot(selectedId, selectedSlotId);
  }, [selectedId, selectedSlotId, loadSlot]);

  const refresh = useCallback(async () => {
    const squadId = selectedIdRef.current;
    await loadAll(squadId);
    if (!squadId) return;
    const slotId = selectedSlotIdRef.current;
    await loadDetail(squadId, slotId);
    if (slotId) await loadSlot(squadId, slotId);
  }, [loadAll, loadDetail, loadSlot]);

  const selectSquad = (squadId: string) => {
    selectedIdRef.current = squadId;
    selectedSlotIdRef.current = null;
    setSelectedId(squadId);
    setSelectedSlotId(null);
    setDetail(null);
    setSnapshotList(null);
    setLeaseStatus(null);
    setLeaseHeld(null);
    setError('');
  };

  const selectSlot = (slotId: string) => {
    selectedSlotIdRef.current = slotId;
    setSelectedSlotId(slotId);
    setError('');
  };

  const create = async () => {
    const name = await promptDialog({
      title: t('squads.create'),
      label: t('squads.createPrompt'),
      required: true,
      maxLength: 80,
      cancelLabel: t('squads.cancel'),
      submitLabel: t('squads.confirmLabel'),
    });
    const trimmed = name?.trim();
    if (!trimmed) return;
    setBusy('create-squad');
    setError('');
    try {
      const created = await createSquad(trimmed);
      await loadAll(created.id);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const acceptInvitation = async (invitation: SquadInvitation) => {
    setBusy(`accept-invitation:${invitation.squad_id}`);
    setError('');
    try {
      await acceptSquadInvitation(invitation.squad_id);
      await loadAll(invitation.squad_id);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const declineInvitation = async (invitation: SquadInvitation) => {
    setBusy(`decline-invitation:${invitation.squad_id}`);
    setError('');
    try {
      await declineSquadInvitation(invitation.squad_id);
      await loadAll(selectedIdRef.current);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const invite = async () => {
    if (!selectedId) return;
    const target = parseUserId(inviteUserId);
    if (!target) {
      setError(t('squads.invalidUserId'));
      return;
    }
    setBusy('invite-member');
    setError('');
    try {
      await inviteSquadMember(selectedId, target);
      setInviteUserId('');
      await loadDetail(selectedId, selectedSlotIdRef.current);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const changeRole = async (member: SquadMember, role: 'admin' | 'member') => {
    if (!selectedId) return;
    setBusy(`role:${member.user_id}`);
    setError('');
    try {
      await setSquadMemberRole(selectedId, member.user_id, role);
      await loadDetail(selectedId, selectedSlotIdRef.current);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const removeMember = async (member: SquadMember) => {
    if (!selectedId) return;
    const self = member.user_id === userId;
    const label = member.username || t('squads.unknownUser', { id: member.user_id });
    const message = self ? t('squads.leaveConfirm') : t('squads.removeConfirm', { name: label });
    if (!await confirmDialog({ message, confirmLabel: t('squads.confirmLabel'), destructive: true })) return;
    setBusy(`remove-member:${member.user_id}`);
    setError('');
    try {
      await removeSquadMember(selectedId, member.user_id);
      if (self) {
        await loadAll(null);
      } else {
        await loadDetail(selectedId, selectedSlotIdRef.current);
      }
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const requestTransfer = async () => {
    if (!selectedId) return;
    const target = parseUserId(transferTarget);
    if (!target) {
      setError(t('squads.invalidUserId'));
      return;
    }
    setBusy('create-transfer');
    setError('');
    try {
      await createOwnershipTransfer(selectedId, target);
      setTransferTarget('');
      await loadDetail(selectedId, selectedSlotIdRef.current);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const resolveTransfer = async (action: 'accept' | 'decline' | 'cancel') => {
    if (!selectedId) return;
    setBusy(`transfer:${action}`);
    setError('');
    try {
      if (action === 'accept') await acceptOwnershipTransfer(selectedId);
      else if (action === 'decline') await declineOwnershipTransfer(selectedId);
      else await cancelOwnershipTransfer(selectedId);
      await loadDetail(selectedId, selectedSlotIdRef.current);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const createSlot = async () => {
    if (!selectedId) return;
    const name = await promptDialog({
      title: t('squads.createSlot'),
      label: t('squads.slotNamePrompt'),
      required: true,
      maxLength: 100,
      cancelLabel: t('squads.cancel'),
      submitLabel: t('squads.confirmLabel'),
    });
    const trimmed = name?.trim();
    if (!trimmed) return;
    setBusy('create-slot');
    setError('');
    try {
      const created = await createSquadSlot(selectedId, trimmed);
      await loadDetail(selectedId, created.id);
      selectSlot(created.id);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const removeSlot = async (slot: { id: string; name: string }) => {
    if (!selectedId) return;
    if (!await confirmDialog({
      message: t('squads.deleteSlotConfirm'),
      confirmLabel: t('squads.confirmLabel'),
      cancelLabel: t('squads.cancel'),
      destructive: true,
    })) return;
    setBusy(`delete-slot:${slot.id}`);
    setError('');
    try {
      await deleteSquadSlot(selectedId, slot.id);
      if (selectedSlotIdRef.current === slot.id) {
        selectedSlotIdRef.current = null;
        setSelectedSlotId(null);
      }
      await loadDetail(selectedId, null);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const acquireLease = async (force = false) => {
    if (!selectedId || !selectedSlotId) return;
    if (force && !await confirmDialog({
      message: t('squads.forceTakeoverConfirm'),
      confirmLabel: t('squads.confirmLabel'),
      cancelLabel: t('squads.cancel'),
      destructive: true,
    })) return;
    setBusy(force ? 'force-lease' : 'acquire-lease');
    setError('');
    setLeaseHeld(null);
    try {
      await acquireSquadLease(selectedId, selectedSlotId, force);
      await loadSlot(selectedId, selectedSlotId);
      await loadDetail(selectedId, selectedSlotId);
    } catch (cause) {
      if (!force && cause instanceof V1ApiError && cause.code === 'SQUAD_SAVE_LEASE_HELD') {
        const info = parseLeaseHeld(cause.details);
        setLeaseHeld(info);
        setError(t('squads.leaseHeld', { id: info?.holder_user_id ?? '—' }));
      } else {
        setError(errorMessage(cause, t('squads.actionFailed')));
      }
    } finally {
      setBusy(null);
    }
  };

  const renewLease = async () => {
    if (!selectedId || !selectedSlotId || fencingToken == null) return;
    setBusy('renew-lease');
    setError('');
    try {
      await renewSquadLease(selectedId, selectedSlotId, fencingToken);
      await loadSlot(selectedId, selectedSlotId);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const releaseLease = async () => {
    if (!selectedId || !selectedSlotId) return;
    setBusy('release-lease');
    setError('');
    try {
      await releaseSquadLease(selectedId, selectedSlotId, fencingToken ?? undefined);
      await loadSlot(selectedId, selectedSlotId);
      await loadDetail(selectedId, selectedSlotId);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const togglePin = async (snapshot: SquadSnapshot) => {
    if (!selectedId || !selectedSlotId) return;
    setBusy(`pin:${snapshot.id}`);
    setError('');
    try {
      await pinSquadSnapshot(selectedId, selectedSlotId, snapshot.id, !snapshot.pinned);
      await loadSlot(selectedId, selectedSlotId);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const restore = async (snapshot: SquadSnapshot) => {
    if (!selectedId || !selectedSlotId || fencingToken == null) return;
    if (!await confirmDialog({
      message: t('squads.restoreConfirm', { revision: snapshot.revision }),
      confirmLabel: t('squads.confirmLabel'),
      cancelLabel: t('squads.cancel'),
      destructive: true,
    })) return;
    setBusy(`restore:${snapshot.id}`);
    setError('');
    try {
      const headId = snapshotList?.slot.head_snapshot_id ?? null;
      await restoreSquadSnapshot(selectedId, selectedSlotId, snapshot.id, fencingToken, headId);
      await loadSlot(selectedId, selectedSlotId);
      await loadDetail(selectedId, selectedSlotId);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  const removeSnapshot = async (snapshot: SquadSnapshot) => {
    if (!selectedId || !selectedSlotId) return;
    if (!await confirmDialog({
      message: t('squads.deleteSnapshotConfirm', { revision: snapshot.revision }),
      confirmLabel: t('squads.confirmLabel'),
      cancelLabel: t('squads.cancel'),
      destructive: true,
    })) return;
    setBusy(`delete-snapshot:${snapshot.id}`);
    setError('');
    try {
      await deleteSquadSnapshot(selectedId, selectedSlotId, snapshot.id);
      await loadSlot(selectedId, selectedSlotId);
      await loadDetail(selectedId, selectedSlotId);
    } catch (cause) {
      setError(errorMessage(cause, t('squads.actionFailed')));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto flex max-w-6xl items-center justify-center px-4 py-16" aria-live="polite">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        <span className="ml-2">{t('squads.loading')}</span>
      </main>
    );
  }

  if (enabled === null) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold">{t('squads.title')}</h1>
        <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
          {error || t('squads.loadFailed')}
        </p>
        <div className="mt-4 flex items-center gap-4">
          <button type="button" onClick={() => void loadAll()} className="min-h-10 rounded border border-[var(--border)] px-3 py-2 text-sm">
            {t('squads.refresh')}
          </button>
          <Link className="text-sm text-primary hover:underline" href="/tools">{t('squads.backToTools')}</Link>
        </div>
      </main>
    );
  }

  if (enabled === false) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-semibold">{t('squads.title')}</h1>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('squads.disabled')}</p>
        <Link className="mt-5 inline-block text-sm text-primary hover:underline" href="/tools">
          {t('squads.backToTools')}
        </Link>
      </main>
    );
  }

  const activeMembers = detail?.members.filter((member) => member.status === 'active') || [];
  const invitedMembers = detail?.members.filter((member) => member.status === 'invited') || [];
  const pendingTransfer = detail?.ownership_transfer || null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-7 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav className="mb-3 flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Link href="/tools" className="hover:text-[var(--text)]">{t('tools.title')}</Link>
            <span>/</span>
            <span>{t('squads.title')}</span>
          </nav>
          <h1 className="text-2xl font-semibold text-[var(--text)]">{t('squads.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{t('squads.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={Boolean(busy)}
          aria-label={t('squads.refresh')}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[var(--border)] px-3 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
        >
          <RefreshCw className="h-4 w-4" />{t('squads.refresh')}
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-md border border-red-300/50 bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      {leaseHeld && (
        <div className="mb-4 rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p>{t('squads.leaseHeld', { id: leaseHeld.holder_user_id ?? '—' })}</p>
          {leaseHeld.expires_at && <p className="mt-1 text-xs">{t('squads.leaseExpires', { date: formatDate(leaseHeld.expires_at) })}</p>}
          {leaseHeld.fencing_token != null && <p className="mt-1 text-xs">{t('squads.leaseToken', { token: leaseHeld.fencing_token })}</p>}
          {isManager && (
            <button
              type="button"
              onClick={() => void acquireLease(true)}
              disabled={Boolean(busy)}
              className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded border border-amber-400/60 px-2.5 text-xs hover:bg-amber-100 dark:hover:bg-amber-900/40"
            >
              <Shield className="h-3.5 w-3.5" />{t('squads.forceTakeover')}
            </button>
          )}
        </div>
      )}

      {invitations.length > 0 && (
        <section aria-label={t('squads.invitations')} className="mb-6 border-y border-[var(--border)] py-4">
          <h2 className="text-base font-semibold">{t('squads.invitations')}</h2>
          <ul className="mt-3 divide-y divide-[var(--border)]">
            {invitations.map((invitation) => (
              <li key={invitation.squad_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-sm font-medium">{t('squads.invitationFrom', { name: invitation.squad_name })}</p>
                  {invitation.invited_by_username && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">{invitation.invited_by_username}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => void acceptInvitation(invitation)}
                    disabled={Boolean(busy)}
                    aria-label={`${t('squads.accept')}: ${invitation.squad_name}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                  >
                    {t('squads.accept')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void declineInvitation(invitation)}
                    disabled={Boolean(busy)}
                    aria-label={`${t('squads.decline')}: ${invitation.squad_name}`}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    {t('squads.decline')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-7 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.7fr)]">
        <section aria-label={t('squads.squads')}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">{t('squads.squads')}</h2>
            <button
              type="button"
              onClick={() => void create()}
              disabled={Boolean(busy)}
              className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
            >
              <UserPlus className="h-3.5 w-3.5" />{t('squads.create')}
            </button>
          </div>
          {squads.length === 0 ? (
            <div className="border-y border-[var(--border)] py-8 text-sm text-[var(--text-secondary)]">{t('squads.empty')}</div>
          ) : (
            <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
              {squads.map((squad) => (
                <li key={squad.id}>
                  <button
                    type="button"
                    onClick={() => selectSquad(squad.id)}
                    disabled={Boolean(busy)}
                    aria-current={selectedId === squad.id ? 'true' : undefined}
                    className={`block w-full px-3 py-3 text-left transition-colors disabled:opacity-60 ${selectedId === squad.id ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-elevated)]/60'}`}
                  >
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                      <span className="truncate font-medium text-[var(--text)]">{squad.name}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--text-muted)]">
                      <span>{roleLabel(squad.my_role, t)}</span>
                      <span>· {squad.member_count}/{squad.max_members}</span>
                      <span>· {squad.slot_count}/{squad.max_slots}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label={t('squads.members')} className="min-w-0">
          {!selectedSquad || !detail ? (
            <div className="border-y border-[var(--border)] py-10 text-sm text-[var(--text-secondary)]">
              {detailLoading ? <span className="inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" />{t('squads.loading')}</span> : t('squads.noSquadSelected')}
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="break-words text-base font-semibold">{detail.name}</h2>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {roleLabel(detail.my_role, t)} · {activeMembers.length}/{detail.max_members}
                  </p>
                </div>
              </div>

              <div className="border-y border-[var(--border)] py-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" />{t('squads.members')}</h3>
                <ul className="mt-3 divide-y divide-[var(--border)]">
                  {activeMembers.length === 0 && <li className="py-3 text-sm text-[var(--text-secondary)]">{t('squads.noMembers')}</li>}
                  {[...activeMembers, ...invitedMembers].map((member) => {
                    const self = member.user_id === userId;
                    const label = member.username || t('squads.unknownUser', { id: member.user_id });
                    const isInvited = member.status === 'invited';
                    return (
                      <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium">{label}</span>
                            <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                              {roleLabel(member.role, t)}
                            </span>
                            {isInvited && <span className="text-[11px] text-amber-700 dark:text-amber-300">{t('squads.statusInvited')}</span>}
                            {!isInvited && <span className="text-[11px] text-[var(--text-muted)]">{t('squads.statusActive')}</span>}
                          </div>
                          {member.joined_at && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t('squads.memberJoined', { date: formatDate(member.joined_at) })}</p>}
                        </div>
                        <div className="flex flex-wrap shrink-0 gap-1">
                          {isOwner && !isInvited && member.role !== 'owner' && !self && (
                            <button
                              type="button"
                              onClick={() => void changeRole(member, member.role === 'admin' ? 'member' : 'admin')}
                              disabled={Boolean(busy)}
                              aria-label={`${member.role === 'admin' ? t('squads.setMember') : t('squads.setAdmin')}: ${label}`}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                            >
                              <Shield className="h-3.5 w-3.5" />{member.role === 'admin' ? t('squads.setMember') : t('squads.setAdmin')}
                            </button>
                          )}
                          {!isInvited && member.role !== 'owner' && (self || (isManager && (isOwner || member.role === 'member'))) && (
                            <button
                              type="button"
                              onClick={() => void removeMember(member)}
                              disabled={Boolean(busy)}
                              aria-label={`${self ? t('squads.leave') : t('squads.remove')}: ${label}`}
                              className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              {self ? <LogOut className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />}
                              {self ? t('squads.leave') : t('squads.remove')}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {isManager && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-3">
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[var(--text-muted)]">
                    <span>{t('squads.invite')}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      value={inviteUserId}
                      onChange={(event) => setInviteUserId(event.target.value)}
                      aria-label={t('squads.invitePrompt')}
                      placeholder={t('squads.invitePrompt')}
                      className="min-h-9 w-full rounded border border-[var(--border)] bg-transparent px-2 text-sm text-[var(--text)]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void invite()}
                    disabled={Boolean(busy)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                  >
                    <UserPlus className="h-3.5 w-3.5" />{t('squads.invite')}
                  </button>
                </div>
              )}
              {isManager && <p className="mt-2 text-xs text-[var(--text-muted)]">{t('squads.inviteHint')}</p>}
              </div>

              {(isOwner || pendingTransfer?.to_user_id === userId) && (
                <div className="border-b border-[var(--border)] py-4">
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><ArrowRightLeft className="h-4 w-4" />{t('squads.transfer')}</h3>
                  {pendingTransfer ? (
                    <div className="mt-2">
                      <p className="text-sm text-[var(--text-secondary)]">
                        {t('squads.transferPending')} #{pendingTransfer.from_user_id} → #{pendingTransfer.to_user_id}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t('squads.leaseExpires', { date: formatDate(pendingTransfer.expires_at) })}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {pendingTransfer.to_user_id === userId && (
                          <>
                            <button
                              type="button"
                              onClick={() => void resolveTransfer('accept')}
                              disabled={Boolean(busy)}
                              className="inline-flex min-h-9 items-center rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                            >
                              {t('squads.acceptTransfer')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void resolveTransfer('decline')}
                              disabled={Boolean(busy)}
                              className="inline-flex min-h-9 items-center rounded border border-[var(--border)] px-2.5 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              {t('squads.declineTransfer')}
                            </button>
                          </>
                        )}
                        {pendingTransfer.from_user_id === userId && (
                          <button
                            type="button"
                            onClick={() => void resolveTransfer('cancel')}
                            disabled={Boolean(busy)}
                            className="inline-flex min-h-9 items-center rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                          >
                            {t('squads.cancelTransfer')}
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[var(--text-muted)]">
                        <span>{t('squads.transferTarget')}</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={transferTarget}
                          onChange={(event) => setTransferTarget(event.target.value)}
                          aria-label={t('squads.transferTarget')}
                          className="min-h-9 w-full rounded border border-[var(--border)] bg-transparent px-2 text-sm text-[var(--text)]"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void requestTransfer()}
                        disabled={Boolean(busy)}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                      >
                        <Crown className="h-3.5 w-3.5" />{t('squads.transfer')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="border-b border-[var(--border)] py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-semibold"><HardDrive className="h-4 w-4" />{t('squads.slots')}</h3>
                  <button
                    type="button"
                    onClick={() => void createSlot()}
                    disabled={Boolean(busy)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                  >
                    <UserPlus className="h-3.5 w-3.5" />{t('squads.createSlot')}
                  </button>
                </div>
                {detail.slots.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--text-secondary)]">{t('squads.emptySnapshots')}</p>
                ) : (
                  <ul className="mt-3 divide-y divide-[var(--border)]">
                    {detail.slots.map((slot) => (
                      <li key={slot.id} className="flex items-center gap-1 py-1">
                        <button
                          type="button"
                          onClick={() => selectSlot(slot.id)}
                          disabled={Boolean(busy)}
                          aria-current={selectedSlotId === slot.id ? 'true' : undefined}
                          className={`min-h-9 flex-1 rounded px-2 py-1.5 text-left text-sm transition-colors disabled:opacity-60 ${selectedSlotId === slot.id ? 'bg-[var(--bg-elevated)]' : 'hover:bg-[var(--bg-elevated)]/60'}`}
                        >
                          <span className="block truncate font-medium">{slot.name}</span>
                          <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                            {t('squads.updatedAt', { date: formatDate(slot.updated_at) })}
                            {slot.lease ? ` · ${t('squads.leaseHolder', { name: slot.lease.holder_username || `#${slot.lease.holder_user_id}`, id: slot.lease.holder_user_id })}` : ` · ${t('squads.noLease')}`}
                          </span>
                        </button>
                        {isManager && (
                          <button
                            type="button"
                            onClick={() => void removeSlot(slot)}
                            disabled={Boolean(busy)}
                            aria-label={`${t('squads.deleteSlot')}: ${slot.name}`}
                            title={t('squads.deleteSlot')}
                            className="inline-flex min-h-9 w-9 shrink-0 items-center justify-center rounded border border-[var(--border)] text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {!selectedSlotId ? (
                <p className="py-8 text-sm text-[var(--text-secondary)]">{t('squads.chooseSlot')}</p>
              ) : (
                <>
                  <div className="border-b border-[var(--border)] py-4">
                    <h3 className="flex items-center gap-2 text-sm font-semibold"><Lock className="h-4 w-4" />{t('squads.lease')}</h3>
                    {currentLease ? (
                      <div className="mt-2">
                        <p className="text-sm">
                          {t('squads.leaseHolder', {
                            name: selectedSlot?.lease?.holder_username || `#${currentLease.holder_user_id}`,
                            id: currentLease.holder_user_id,
                          })}
                        </p>
                        <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--text-muted)]">
                          <span className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" />{t('squads.leaseToken', { token: currentLease.fencing_token })}</span>
                          <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{t('squads.leaseExpires', { date: formatDate(currentLease.expires_at) })}</span>
                        </p>
                        {heldByMe && <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">{t('squads.youHoldLease')}</p>}
                        <div className="mt-2 flex flex-wrap gap-1">
                          {heldByMe ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void renewLease()}
                                disabled={Boolean(busy)}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />{t('squads.renewLease')}
                              </button>
                              <button
                                type="button"
                                onClick={() => void releaseLease()}
                                disabled={Boolean(busy)}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                              >
                                <LogOut className="h-3.5 w-3.5" />{t('squads.releaseLease')}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => void acquireLease(false)}
                                disabled={Boolean(busy)}
                                className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                              >
                                <KeyRound className="h-3.5 w-3.5" />{t('squads.acquireLease')}
                              </button>
                              {isManager && (
                                <button
                                  type="button"
                                  onClick={() => void acquireLease(true)}
                                  disabled={Boolean(busy)}
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded border border-amber-400/60 px-2.5 text-xs text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-950/30"
                                >
                                  <Shield className="h-3.5 w-3.5" />{t('squads.forceTakeover')}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="text-sm text-[var(--text-secondary)]">{t('squads.noLease')}</p>
                        <button
                          type="button"
                          onClick={() => void acquireLease(false)}
                          disabled={Boolean(busy)}
                          className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                        >
                          <KeyRound className="h-3.5 w-3.5" />{t('squads.acquireLease')}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-sm font-semibold"><HardDrive className="h-4 w-4" />{t('squads.snapshots')}</h3>
                      <span className="text-xs text-[var(--text-muted)]">{snapshotList?.slot.name || selectedSlot?.name || ''}</span>
                    </div>
                    {snapshotsLoading ? (
                      <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
                        <LoaderCircle className="h-4 w-4 animate-spin" />{t('squads.snapshotsLoading')}
                      </div>
                    ) : !snapshotList || snapshotList.snapshots.length === 0 ? (
                      <p className="py-8 text-sm text-[var(--text-secondary)]">{t('squads.emptySnapshots')}</p>
                    ) : (
                      <ol className="mt-3 divide-y divide-[var(--border)] border-y border-[var(--border)]">
                        {snapshotList.snapshots.map((snapshot) => {
                          const conflict = snapshot.branch_type === 'conflict';
                          return (
                            <li key={snapshot.id} className="py-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <strong className="text-sm">{t('squads.revision', { revision: snapshot.revision })}</strong>
                                    {snapshot.is_head && (
                                      <span className="rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--primary-text)]">{t('squads.head')}</span>
                                    )}
                                    {conflict && (
                                      <span className="rounded border border-amber-400/70 bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                                        {t('squads.conflictBranch')}
                                      </span>
                                    )}
                                    {snapshot.pinned && (
                                      <span className="inline-flex items-center gap-1 rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">
                                        <Pin className="h-3 w-3" />{t('squads.pinned')}
                                      </span>
                                    )}
                                    <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)]">{snapshot.retention_tier}</span>
                                  </div>
                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                                    <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatDate(snapshot.created_at)}</span>
                                    <span>{formatBytes(snapshot.size)}</span>
                                    {snapshot.file_count != null && <span>{t('squads.files', { count: snapshot.file_count })}</span>}
                                    <span>{t('squads.uploader', { id: snapshot.uploader_user_id })}</span>
                                    {snapshot.game.version && <span>{snapshot.game.version}</span>}
                                    {snapshot.save.map_name && <span>{snapshot.save.map_name}</span>}
                                  </div>
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-1">
                                  <button
                                    type="button"
                                    onClick={() => void togglePin(snapshot)}
                                    disabled={Boolean(busy)}
                                    aria-label={`${snapshot.pinned ? t('squads.unpin') : t('squads.pin')}: ${t('squads.revision', { revision: snapshot.revision })}`}
                                    className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)]"
                                  >
                                    <Pin className="h-3.5 w-3.5" />{snapshot.pinned ? t('squads.unpin') : t('squads.pin')}
                                  </button>
                                  {!snapshot.is_head && (
                                    <button
                                      type="button"
                                      onClick={() => void restore(snapshot)}
                                      disabled={Boolean(busy) || fencingToken == null}
                                      title={fencingToken == null ? t('squads.restoreNeedsLease') : t('squads.restore')}
                                      aria-label={`${t('squads.restore')}: ${t('squads.revision', { revision: snapshot.revision })}`}
                                      className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />{t('squads.restore')}
                                    </button>
                                  )}
                                  {isManager && !snapshot.is_head && (
                                    <button
                                      type="button"
                                      onClick={() => void removeSnapshot(snapshot)}
                                      disabled={Boolean(busy)}
                                      title={t('squads.deleteSnapshot')}
                                      aria-label={`${t('squads.deleteSnapshot')}: ${t('squads.revision', { revision: snapshot.revision })}`}
                                      className="inline-flex min-h-9 items-center gap-1.5 rounded border border-[var(--border)] px-2.5 text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/30"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />{t('squads.deleteSnapshot')}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function roleLabel(role: string, t: (key: string) => string): string {
  if (role === 'owner') return t('squads.roleOwner');
  if (role === 'admin') return t('squads.roleAdmin');
  return t('squads.roleMember');
}

function parseUserId(value: string): number | null {
  const id = Number(value.trim());
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseLeaseHeld(details: unknown[]): LeaseHeldInfo | null {
  const first = details.find((detail): detail is Record<string, unknown> => Boolean(detail) && typeof detail === 'object');
  if (!first) return null;
  const holder = Number(first.holder_user_id);
  const token = Number(first.fencing_token);
  return {
    holder_user_id: Number.isSafeInteger(holder) && holder > 0 ? holder : null,
    fencing_token: Number.isSafeInteger(token) && token > 0 ? token : null,
    expires_at: typeof first.expires_at === 'string' ? first.expires_at : null,
    lanlink_room_code: typeof first.lanlink_room_code === 'string' ? first.lanlink_room_code : null,
  };
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let amount = value / 1024;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index++; }
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(amount)} ${units[index]}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof V1ApiError ? error.message : error instanceof Error ? error.message : fallback;
}
