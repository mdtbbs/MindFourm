export function joinMindAuthApiUrl(baseUrl: string | undefined, path: string): string {
  const normalizedBase = (baseUrl || 'http://localhost:4001').replace(/\/+$/, '').replace(/\/api$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}/api${normalizedPath}`;
}
