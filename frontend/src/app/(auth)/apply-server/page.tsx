import { redirect } from 'next/navigation';

export default function ApplyServerAltRedirect() {
  redirect('/servers?section=apply');
}
