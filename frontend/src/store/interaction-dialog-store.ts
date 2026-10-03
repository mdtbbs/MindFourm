import { create } from 'zustand';

type RequestBase = {
  id: number;
  title: string;
  message?: string;
};

export type ConfirmationOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type TextPromptOptions = {
  title: string;
  message?: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: 'text' | 'url' | 'email' | 'number' | 'password';
  maxLength?: number;
  required?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null;
};

type ConfirmRequest = RequestBase & ConfirmationOptions & {
  kind: 'confirm';
  resolve: (value: boolean) => void;
};

type PromptRequest = RequestBase & TextPromptOptions & {
  kind: 'prompt';
  resolve: (value: string | null) => void;
};

type AlertRequest = RequestBase & {
  kind: 'alert';
  closeLabel?: string;
  resolve: () => void;
};

export type InteractionDialogRequest = ConfirmRequest | PromptRequest | AlertRequest;

type InteractionDialogState = {
  active: InteractionDialogRequest | null;
  queue: InteractionDialogRequest[];
  enqueue: (request: InteractionDialogRequest) => void;
  settle: (id: number, result?: string | boolean | null) => void;
};

export const useInteractionDialogStore = create<InteractionDialogState>((set, get) => ({
  active: null,
  queue: [],
  enqueue: (request) => set((state) => state.active
    ? { queue: [...state.queue, request] }
    : { active: request }),
  settle: (id, result) => {
    const { active, queue } = get();
    if (!active || active.id !== id) return;
    if (active.kind === 'confirm') active.resolve(result === true);
    else if (active.kind === 'prompt') active.resolve(typeof result === 'string' ? result : null);
    else active.resolve();
    set({ active: queue[0] || null, queue: queue.slice(1) });
  },
}));

let nextRequestId = 1;

function allocateId() {
  const id = nextRequestId;
  nextRequestId += 1;
  return id;
}

export function confirmDialog(options: ConfirmationOptions | string): Promise<boolean> {
  const normalized = typeof options === 'string' ? { message: options } : options;
  return new Promise((resolve) => {
    useInteractionDialogStore.getState().enqueue({
      ...normalized,
      id: allocateId(),
      kind: 'confirm',
      title: normalized.title || '请确认操作',
      resolve,
    });
  });
}

export function promptDialog(options: TextPromptOptions): Promise<string | null> {
  return new Promise((resolve) => {
    useInteractionDialogStore.getState().enqueue({
      ...options,
      id: allocateId(),
      kind: 'prompt',
      resolve,
    });
  });
}

export function alertDialog(message: string, title = '提示'): Promise<void> {
  return new Promise((resolve) => {
    useInteractionDialogStore.getState().enqueue({
      id: allocateId(),
      kind: 'alert',
      title,
      message,
      resolve,
    });
  });
}
