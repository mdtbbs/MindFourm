'use client';

import Button from '@/components/ui/button';
import { useI18n } from '@/i18n/provider';

interface SettingsUnsavedChangesBarProps {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onDiscard: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
}

export default function SettingsUnsavedChangesBar({
  dirty,
  saving,
  saved,
  error,
  onDiscard,
  onSave,
  saveDisabled = false,
}: SettingsUnsavedChangesBarProps) {
  const { t } = useI18n();
  if (!dirty && !saving && !saved && !error) return null;

  const statusText = saving
    ? t('adminShell.savingSettings')
    : error
      ? t('adminShell.saveFailed')
      : dirty
        ? t('adminShell.unsavedChanges')
        : t('adminShell.settingsSaved');

  return (
    <div className="admin-settings-unsaved-bar fixed right-0 bottom-0 z-[60] border-t border-surface-200 bg-white/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur dark:bg-surface-950/95">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="min-w-0" aria-live="polite">
          <p className="text-sm font-medium text-surface-800">{statusText}</p>
          {error ? <p className="mt-0.5 text-xs text-red-700" role="alert">{error}</p> : null}
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDiscard} disabled={!dirty || saving}>
            {t('adminShell.discardChanges')}
          </Button>
          <Button type="button" onClick={onSave} disabled={!dirty || saving || saveDisabled}>
            {saving ? t('adminShell.saving') : t('adminShell.saveChanges')}
          </Button>
        </div>
      </div>
    </div>
  );
}
