import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { API_V1_VERSION } from './api-version';

/**
 * The committed OpenAPI documents are what clients read; the constant is what the
 * server reports. When a DTO changes without `npm run openapi:export`, the two
 * disagree silently and the drift is only caught by `openapi:check` — this is the
 * cheaper, always-on half of that check.
 */
describe('published contract version', () => {
  it('matches the version in every committed OpenAPI document', () => {
    for (const file of ['openapi-public-v1.json', 'openapi-internal-v1.json', 'openapi-v1.json']) {
      const document = JSON.parse(readFileSync(join(__dirname, '../../', file), 'utf8'));
      expect([file, document.info.version]).toEqual([file, API_V1_VERSION]);
    }
  });

  it('never goes backwards past the versions already published', () => {
    // The blobs contract shipped as 1.5.0; additive changes only move it forward.
    const [major, minor] = API_V1_VERSION.split('.').map(Number);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1005);
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(1007);
  });
});
