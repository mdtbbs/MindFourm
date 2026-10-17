import EditorToolWorkspace from '@/components/tools/editor-tool-workspace';

export default async function WaveEditorPage({ searchParams }: { searchParams: Promise<{ resource?: string; version?: string }> }) {
  const query = await searchParams;
  return <EditorToolWorkspace id="wave-editor" resourceId={query.resource} versionId={query.version} />;
}
