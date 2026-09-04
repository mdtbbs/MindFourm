import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ArtifactRef, TaskMetadata } from './types.js';

export class ArtifactStore {
  private readonly directory: string;
  private readonly written = new Set<string>();
  readonly taskId: string;
  constructor(root: string, taskId = `task-${randomUUID()}`) { this.taskId = taskId; this.directory = join(root, taskId); }
  async initialize(metadata: TaskMetadata): Promise<void> { await mkdir(this.directory, { recursive: true, mode: 0o700 }); await this.json('metadata.json', metadata); }
  async text(name: string, content: string): Promise<void> { await writeFile(join(this.directory, name), content, { encoding: 'utf8', mode: 0o600 }); this.written.add(name); }
  async json(name: string, value: unknown): Promise<void> { await this.text(name, `${JSON.stringify(value, null, 2)}\n`); }
  ref(planned: string[] = []): ArtifactRef { return { taskId: this.taskId, directory: this.directory, files: [...new Set([...this.written, ...planned])].sort() }; }
}
