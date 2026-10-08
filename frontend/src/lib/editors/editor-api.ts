import { requestV1, requestV1Blob, fetchV1 } from '@/lib/api/v1/transport';

export type EditorKind = 'schematic' | 'map';
export type EditorStatus = {
  schematic: { enabled: boolean; reason: string | null; full_logic: boolean };
  map: { enabled: boolean; reason: string | null };
  wave: { enabled: boolean; reason: string | null };
};

export type EditorContentEntry = {
  internal_name: string;
  display_name: string;
  icon: string | null;
  size?: number;
  size_offset?: number;
  category?: string;
  category_name?: string;
  placeable?: boolean;
  has_config?: boolean;
  config_types?: Array<{ type: string; content_type?: string }>;
  logic?: boolean;
  floor?: boolean;
  overlay?: boolean;
  ore?: boolean;
  liquid_floor?: boolean;
  color?: string;
  id?: number;
  core?: boolean;
  spawn?: boolean;
  rotatable?: boolean;
};

export type EditorContentCatalog = {
  blocks: EditorContentEntry[];
  items: EditorContentEntry[];
  liquids: EditorContentEntry[];
  units: EditorContentEntry[];
  statuses: EditorContentEntry[];
  teams: EditorContentEntry[];
  rule_defaults?: Record<string, unknown>;
};

export type EditorAnalysis = {
  resource_kind: EditorKind;
  file_name: string;
  sha256: string;
  parser_version: string | null;
  renderer_metadata: Record<string, unknown>;
};

export async function getEditorStatus(): Promise<EditorStatus> {
  return fetchV1<EditorStatus>('/editor-tools/status');
}

export async function getEditorContentCatalog(): Promise<EditorContentCatalog> {
  return fetchV1<EditorContentCatalog>('/editor-tools/content-catalog');
}

export async function createBlankEditorFile(
  kind: EditorKind,
  input: { width: number; height: number; name: string; floor?: string; template?: 'survival' | 'sandbox' | 'attack' | 'pvp' | 'custom' },
): Promise<Blob> {
  return requestV1Blob(`/editor-tools/${kind}/create`, { method: 'POST', body: JSON.stringify(input) });
}

export async function analyzeEditorFile(kind: EditorKind, file: File): Promise<EditorAnalysis> {
  const form = new FormData();
  form.append('file', file);
  return requestV1<EditorAnalysis>(`/editor-tools/${kind}/analyze`, { method: 'POST', body: form });
}

export async function exportEditorFile(kind: EditorKind, file: File, operations: Record<string, unknown>): Promise<Blob> {
  const form = new FormData();
  form.append('file', file);
  form.append('operations', JSON.stringify(operations));
  return requestV1Blob(`/editor-tools/${kind}/export`, { method: 'POST', body: form });
}
