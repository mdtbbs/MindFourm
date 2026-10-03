'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmDialog } from '@/store/interaction-dialog-store';
import { useI18n } from '@/i18n/provider';
import {
  getGuardedInternalHref,
  navigateWithUnsavedChanges,
  registerUnsavedChangesConfirmation,
} from '@/lib/admin/unsaved-navigation';

export type SettingsSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function cloneValues<T extends object>(values: T): T {
  return JSON.parse(JSON.stringify(values)) as T;
}

export function useUnsavedChanges<T extends object>(values: T) {
  const { t } = useI18n();
  const router = useRouter();
  const baselineRef = useRef<T | null>(null);
  const isDirtyRef = useRef(false);
  const pendingNavigationRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [baselineSnapshot, setBaselineSnapshot] = useState<string | null>(null);
  const [status, setStatus] = useState<SettingsSaveStatus>('idle');
  const [error, setErrorMessage] = useState<string | null>(null);
  const currentSnapshot = JSON.stringify(values);
  const isDirty = baselineSnapshot !== null && currentSnapshot !== baselineSnapshot;
  isDirtyRef.current = isDirty;

  const clearSavedTimer = useCallback(() => {
    if (savedTimerRef.current !== null) {
      clearTimeout(savedTimerRef.current);
      savedTimerRef.current = null;
    }
  }, []);

  const clearStatus = useCallback(() => {
    clearSavedTimer();
    setStatus('idle');
    setErrorMessage(null);
  }, [clearSavedTimer]);

  const initialize = useCallback((nextValues: T) => {
    baselineRef.current = cloneValues(nextValues);
    setBaselineSnapshot(JSON.stringify(nextValues));
    clearSavedTimer();
    setStatus('idle');
    setErrorMessage(null);
  }, [clearSavedTimer]);

  const markSaved = useCallback((savedValues: T) => {
    baselineRef.current = cloneValues(savedValues);
    setBaselineSnapshot(JSON.stringify(savedValues));
    setStatus('saved');
    setErrorMessage(null);
    clearSavedTimer();
    savedTimerRef.current = setTimeout(() => {
      setStatus('idle');
      savedTimerRef.current = null;
    }, 3000);
  }, [clearSavedTimer]);

  const markFieldSaved = useCallback((key: string, value: string) => {
    const baseline = baselineRef.current;
    if (!baseline) return;

    clearSavedTimer();
    const nextBaseline = { ...(baseline as Record<string, unknown>), [key]: value } as T;
    baselineRef.current = nextBaseline;
    setBaselineSnapshot(JSON.stringify(nextBaseline));
    setStatus('idle');
    setErrorMessage(null);
  }, [clearSavedTimer]);

  const discard = useCallback(() => {
    clearStatus();
    return baselineRef.current ? cloneValues(baselineRef.current) : null;
  }, [clearStatus]);

  const setSaving = useCallback(() => {
    clearSavedTimer();
    setStatus('saving');
    setErrorMessage(null);
  }, [clearSavedTimer]);

  const setError = useCallback((message: string) => {
    clearSavedTimer();
    setStatus('error');
    setErrorMessage(message);
  }, [clearSavedTimer]);

  const confirmLeave = useCallback(() => {
    if (!isDirtyRef.current) return null;
    return confirmDialog({
      title: t('adminShell.unsavedChangesTitle'),
      message: t('adminShell.unsavedChangesMessage'),
      confirmLabel: t('adminShell.leavePage'),
      cancelLabel: t('adminShell.stayOnPage'),
    });
  }, [t]);

  useEffect(() => registerUnsavedChangesConfirmation(confirmLeave), [confirmLeave]);

  useEffect(() => {
    if (!isDirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const guardInternalLink = (event: MouseEvent) => {
      if (!isDirtyRef.current || event.defaultPrevented) return;
      const target = event.target;
      if (!target || typeof (target as Element).closest !== 'function') return;
      const anchor = (target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!anchor) return;

      const href = getGuardedInternalHref({
        href: anchor.href,
        target: anchor.getAttribute('target'),
        download: anchor.hasAttribute('download'),
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      }, window.location.href);
      if (!href) return;

      event.preventDefault();
      event.stopPropagation();
      if (pendingNavigationRef.current) return;
      pendingNavigationRef.current = true;

      void navigateWithUnsavedChanges(
        href,
        (destination) => router.push(destination),
      ).finally(() => {
        pendingNavigationRef.current = false;
      });
    };

    document.addEventListener('click', guardInternalLink, true);
    return () => document.removeEventListener('click', guardInternalLink, true);
  }, [router]);

  useEffect(() => clearSavedTimer, [clearSavedTimer]);

  return {
    isDirty,
    isSaving: status === 'saving',
    isSaved: status === 'saved',
    status,
    error,
    initialize,
    markSaved,
    markFieldSaved,
    discard,
    setSaving,
    setError,
    clearStatus,
  };
}
