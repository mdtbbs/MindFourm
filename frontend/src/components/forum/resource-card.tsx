import type { Resource } from '@/types';
import type { Locale } from '@/i18n';
import ResourceRow from './resource-row';

export default function ResourceCard({ resource, locale }: { resource: Resource; locale?: Locale }) {
  return <ResourceRow resource={resource} locale={locale} />;
}
