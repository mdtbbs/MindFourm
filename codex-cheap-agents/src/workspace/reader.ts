import { readFile, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export const insideWorkspace = (workspace: string, target: string): boolean => {
  const rel = relative(resolve(workspace), resolve(target));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.includes(`${sep}..${sep}`));
};

export const readText = async (workspace: string, relativePath: string, maxBytes = 16_000): Promise<string | undefined> => {
  const target = resolve(workspace, relativePath);
  if (!insideWorkspace(workspace, target)) return undefined;
  try {
    if (!(await stat(target)).isFile()) return undefined;
    return (await readFile(target, 'utf8')).slice(0, maxBytes);
  } catch { return undefined; }
};
