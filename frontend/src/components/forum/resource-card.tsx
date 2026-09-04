import type { Resource } from '@/types';
import ResourceRow from './resource-row';

export default function ResourceCard({ resource }: { resource: Resource }) {
  return <ResourceRow resource={resource} />;
}
