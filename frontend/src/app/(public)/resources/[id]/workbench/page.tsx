import ResourceWorkbenchV2 from '@/components/forum/resources/workbench/resource-workbench-v2';

export default async function ResourceWorkbenchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: publicId } = await params;
  return <ResourceWorkbenchV2 publicId={publicId} />;
}
