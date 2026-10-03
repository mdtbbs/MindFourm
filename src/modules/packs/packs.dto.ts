import { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

export const packManifestSchema: SchemaObject = {
  type: 'object',
  required: ['schema_version', 'pack', 'members'],
  properties: {
    schema_version: { type: 'integer', example: 1 },
    pack: {
      type: 'object',
      required: ['public_id', 'version_public_id', 'version', 'game_version'],
      properties: {
        public_id: { type: 'string', format: 'uuid' },
        version_public_id: { type: 'string', format: 'uuid' },
        version: { type: 'string' },
        game_version: { type: 'string', nullable: true, description: 'Exact supported Mindustry game version when declared.' },
      },
    },
    members: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'resource_kind', 'resource_public_id', 'name', 'version_public_id', 'version',
          'file_name', 'size_bytes', 'sha256', 'dependencies', 'download_url',
        ],
        properties: {
          resource_kind: { type: 'string' },
          resource_public_id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          version_public_id: { type: 'string', format: 'uuid' },
          version: { type: 'string' },
          file_name: { type: 'string' },
          size_bytes: { type: 'integer', minimum: 0 },
          sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
          dependencies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                resource_public_id: { type: 'string', format: 'uuid', nullable: true },
                external_identifier: { type: 'string', nullable: true },
                version_constraint: { type: 'string', nullable: true },
                notes: { type: 'string', nullable: true },
              },
            },
          },
          download_url: { type: 'string', format: 'uri-reference' },
        },
      },
    },
  },
};

export const packDownloadGrantsSchema: SchemaObject = {
  type: 'object',
  required: ['pack_public_id', 'pack_version_public_id', 'grants'],
  properties: {
    pack_public_id: { type: 'string', format: 'uuid' },
    pack_version_public_id: { type: 'string', format: 'uuid' },
    grants: {
      type: 'array',
      items: {
        type: 'object',
        required: ['resource_public_id', 'resource_version_public_id', 'file_public_id', 'download_url', 'granted'],
        properties: {
          resource_public_id: { type: 'string', format: 'uuid' },
          resource_version_public_id: { type: 'string', format: 'uuid' },
          file_public_id: { type: 'string', format: 'uuid' },
          download_url: { type: 'string', format: 'uri-reference' },
          granted: { type: 'boolean', description: 'False when this actor already has a recent grant for the same file.' },
        },
      },
    },
  },
};
