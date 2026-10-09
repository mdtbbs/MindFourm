import type { ResourceV2MapTransformInput, ResourceV2SchematicBlock, ResourceV2SchematicTransformInput } from '@/lib/api/v1/resources';

export type EditorSource = {
  metadata: Record<string, unknown>;
  blocks: ResourceV2SchematicBlock[];
  exportFile: (operations: ResourceV2SchematicTransformInput | ResourceV2MapTransformInput) => Promise<Blob>;
  loadRegion?: (x: number, y: number) => Promise<{ terrain: Array<{ x: number; y: number; floor: string; overlay: string }> }>;
  publishFile: (file: File, title?: string) => Promise<void>;
};

export type EditorContext = { resource: { public_id: string; title: string } };

export function downloadEditorFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
