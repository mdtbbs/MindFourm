import { PUBLIC_V1_OPERATION_ALLOWLIST } from '../../openapi/public-v1-operation-allowlist';
import { lookupV1ErrorCode } from '@common/contracts/v1-error-codes';
import { coreEntities } from '@entities/index';

describe('Generic Blob API wiring', () => {
  it('registers the blob operations in the public V1 allowlist', () => {
    for (const operation of [
      'GET /v1/blobs/quota',
      'GET /v1/blobs',
      'POST /v1/blobs',
      'PUT /v1/blobs/uploads/{uploadId}/content',
      'POST /v1/blobs/uploads/{uploadId}/commit',
      'DELETE /v1/blobs/uploads/{uploadId}',
      'GET /v1/blobs/{blobId}',
      'GET /v1/blobs/{blobId}/content',
      'PATCH /v1/blobs/{blobId}',
      'DELETE /v1/blobs/{blobId}',
    ]) {
      expect(PUBLIC_V1_OPERATION_ALLOWLIST).toContain(operation);
    }
  });

  it('registers every error code the blob service can raise', () => {
    for (const code of [
      'BLOBS_DISABLED', 'BLOB_NOT_FOUND', 'BLOB_KEY_INVALID', 'BLOB_KEY_CONFLICT', 'BLOB_METADATA_INVALID',
      'BLOB_INVALID_HASH', 'BLOB_FILE_TOO_LARGE', 'BLOB_QUOTA_EXCEEDED', 'BLOB_UPLOAD_NOT_FOUND',
      'BLOB_UPLOAD_EXPIRED', 'BLOB_UPLOAD_ALREADY_COMMITTED', 'BLOB_UPLOAD_OBJECT_MISSING',
      'BLOB_UPLOAD_SIZE_MISMATCH', 'BLOB_UPLOAD_CHECKSUM_MISMATCH', 'BLOB_UPLOAD_LIMIT_REACHED',
      'BLOB_STORAGE_UNAVAILABLE',
    ]) {
      expect(lookupV1ErrorCode(code)).not.toBeNull();
    }
  });

  it('keeps retryability honest for the codes a client should retry', () => {
    expect(lookupV1ErrorCode('BLOB_STORAGE_UNAVAILABLE')).toMatchObject({ httpStatus: 503, retryable: true });
    expect(lookupV1ErrorCode('BLOB_UPLOAD_LIMIT_REACHED')).toMatchObject({ httpStatus: 429, retryable: true });
    // A rejected hash is the client's own fault and will fail identically again.
    expect(lookupV1ErrorCode('BLOB_UPLOAD_CHECKSUM_MISMATCH')).toMatchObject({ httpStatus: 409, retryable: false });
    expect(lookupV1ErrorCode('BLOB_NOT_FOUND')).toMatchObject({ httpStatus: 404, retryable: false });
  });

  it('registers the blob entities so migrations and synchronize see them', () => {
    const names = (coreEntities as readonly any[]).map((entity) => entity?.name);
    for (const entity of ['BlobObject', 'BlobRecord', 'BlobUploadSession', 'BlobIdempotency']) {
      expect(names).toContain(entity);
    }
  });
});
