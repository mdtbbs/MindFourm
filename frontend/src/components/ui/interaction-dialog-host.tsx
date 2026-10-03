'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { useInteractionDialogStore } from '@/store/interaction-dialog-store';

export default function InteractionDialogHost() {
  const request = useInteractionDialogStore((state) => state.active);
  const settle = useInteractionDialogStore((state) => state.settle);
  const inputRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (request?.kind !== 'prompt') {
      setValue('');
      setError(null);
      return;
    }
    setValue(request.defaultValue || '');
    setError(null);
  }, [request]);

  if (!request) return null;

  const cancel = () => settle(request.id);
  const handlePromptSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (request.kind !== 'prompt') return;
    if (request.required && !value.trim()) {
      setError('此项为必填项');
      return;
    }
    const validationError = request.validate?.(value) || null;
    if (validationError) {
      setError(validationError);
      return;
    }
    settle(request.id, value);
  };

  const footer = request.kind === 'confirm' ? (
    <>
      <Button type="button" variant="outline" onClick={cancel}>{request.cancelLabel || '取消'}</Button>
      <Button
        type="button"
        variant={request.destructive ? 'destructive' : 'default'}
        onClick={() => settle(request.id, true)}
      >
        {request.confirmLabel || '确定'}
      </Button>
    </>
  ) : request.kind === 'prompt' ? (
    <>
      <Button type="button" variant="outline" onClick={cancel}>{request.cancelLabel || '取消'}</Button>
      <Button type="submit" form={formId}>{request.submitLabel || '确定'}</Button>
    </>
  ) : (
    <Button type="button" onClick={() => settle(request.id)}>{request.closeLabel || '知道了'}</Button>
  );

  return (
    <Dialog
      key={request.id}
      open
      onOpenChange={(open) => { if (!open) cancel(); }}
      title={request.title}
      description={request.message}
      size="sm"
      initialFocus={request.kind === 'prompt' ? inputRef : undefined}
      footer={footer}
    >
      {request.kind === 'prompt' && (
        <form id={formId} onSubmit={handlePromptSubmit} className="space-y-2">
          <label htmlFor={`${formId}-input`} className="block text-sm font-medium">{request.label}</label>
          <input
            ref={inputRef}
            id={`${formId}-input`}
            type={request.inputType || 'text'}
            value={value}
            maxLength={request.maxLength}
            aria-required={request.required || undefined}
            placeholder={request.placeholder}
            onChange={(event) => { setValue(event.target.value); setError(null); }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${formId}-error` : undefined}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/30 aria-invalid:border-[var(--error)]"
          />
          {error && <p id={`${formId}-error`} role="alert" className="text-sm text-[var(--error)]">{error}</p>}
        </form>
      )}
    </Dialog>
  );
}
