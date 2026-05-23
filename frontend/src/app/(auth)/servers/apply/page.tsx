import { redirect } from 'next/navigation';

export default function ApplyServerRedirect() {
  redirect('/servers?section=apply');
}
