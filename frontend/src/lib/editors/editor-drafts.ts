import type { EditorKind } from './editor-api';

export type StoredEditorDraft<T = Record<string, unknown>> = {
  id: string;
  kind: EditorKind;
  title: string;
  file_name: string;
  source: Blob;
  source_hash: string;
  resource_public_id?: string;
  version_public_id?: string;
  operations: T;
  updated_at: number;
};

const DATABASE = 'mindfourm-editor-drafts';
const STORE = 'drafts';
const DATABASE_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('本地草稿存储不可用')); return; }
    const request = indexedDB.open(DATABASE, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地草稿存储打开失败'));
  });
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      let result!: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error || new Error('本地草稿读取失败'));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('本地草稿事务失败'));
      transaction.onabort = () => reject(transaction.error || new Error('本地草稿保存失败'));
    });
  } finally { database.close(); }
}

export async function hashEditorSource(source: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await source.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function editorDraftId(kind: EditorKind, sourceHash: string): string {
  return `${kind}:${sourceHash}`;
}

export async function saveEditorDraft<T>(draft: StoredEditorDraft<T>): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      store.put(draft);
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result as StoredEditorDraft[];
        const sameKind = all.filter((item) => item.kind === draft.kind)
          .sort((left, right) => right.updated_at - left.updated_at);
        const stale = sameKind.slice(10).map((item) => item.id);
        for (const id of stale) store.delete(id);
      };
      request.onerror = () => reject(request.error || new Error('本地草稿清理失败'));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('本地草稿保存失败'));
      transaction.onabort = () => reject(transaction.error || new Error('本地草稿保存失败'));
    });
  } finally { database.close(); }
}

export async function getEditorDraft(id: string): Promise<StoredEditorDraft | null> {
  return (await transact<StoredEditorDraft | undefined>('readonly', (store) => store.get(id))) || null;
}

export async function getLatestEditorDraft(kind: EditorKind): Promise<StoredEditorDraft | null> {
  const drafts = await transact<StoredEditorDraft[]>('readonly', (store) => store.getAll());
  return drafts.filter((draft) => draft.kind === kind).sort((left, right) => right.updated_at - left.updated_at)[0] || null;
}

export async function deleteEditorDraft(id: string): Promise<void> {
  await transact('readwrite', (store) => store.delete(id));
}
