/**
 * Storage Provider — owns file storage operations.
 *
 * Implementations: Local, MFL, future Object Storage.
 * Each provider knows how to put, inspect, delete, and optionally hash-verify files.
 */

export type StorageMetadata = {
  sizeBytes: number;
  mimeType: string | null;
  contentHash: string | null;
  hashAlgorithm: string | null;
};

export interface IStorageProvider {
  readonly name: string;

  exists(storageKey: string): Promise<boolean>;
  getMetadata(storageKey: string): Promise<StorageMetadata | null>;
  delete(storageKey: string): Promise<void>;
}
