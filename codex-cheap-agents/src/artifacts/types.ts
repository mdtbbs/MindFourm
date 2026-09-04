export interface TaskMetadata {
  taskId: string;
  createdAt: string;
  workspace: string;
  task: string;
  mode: string;
  qwenRequests: number;
  glmRequests: number;
  reworks: number;
  filesInspected: number;
  durationMs?: number;
  solContextBytes?: number;
  providerInputTokens?: number;
  providerOutputTokens?: number;
}

export interface ArtifactRef { taskId: string; directory: string; files: string[]; }
