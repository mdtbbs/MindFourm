/** State may only restore a same-site path; never turn login into an open redirect. */
export function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}
