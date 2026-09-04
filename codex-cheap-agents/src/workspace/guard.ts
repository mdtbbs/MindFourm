import { realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { parse, resolve } from 'node:path';

/** Refuse broad targets even if a caller accidentally supplies one. */
export const safeWorkspace = async (candidate: string): Promise<string> => {
  const workspace = await realpath(resolve(candidate)).catch(() => { throw new Error('Workspace does not exist or cannot be resolved'); });
  if (!(await stat(workspace)).isDirectory()) throw new Error('Workspace must be a directory');
  if (workspace === parse(workspace).root || workspace === resolve(homedir())) throw new Error('Refusing filesystem root or home directory as a workspace');
  return workspace;
};
