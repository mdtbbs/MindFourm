import { redirect } from 'next/navigation';

/** Keep the community's stable developer entry at a short URL. */
export default function DevelopersPage() {
  redirect('/api/v1');
}
