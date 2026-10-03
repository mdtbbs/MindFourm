import { toPublicResource, RESOURCE_CARD_COLUMNS } from './resource-public.dto';

describe('public resource boundary', () => {
  const resource = {
    id: 1, status: 'approved', title: 'Map', is_public: 1, use_mfl: 0,
    description: 'x'.repeat(10000), content_json: { big: 'private document' },
    file_path: '/srv/private/map.msav', renderer_preview_key: '/private/preview.png',
    reject_reason: 'moderation note', duplicate_note: 'internal',
    user: { id: 2, username: 'Author', email: 'private@example.test', mindauth_id: 90, role: 'user', avatar_url: null, phone: 'private' },
    renderer_metadata_json: { blocks: Array(1000).fill('wall') },
    metadata_json: { tags: ['map'], private: 'secret' },
  } as any;
  it('never serializes private user, storage, or moderation columns', () => {
    const detail = toPublicResource(resource);
    expect(detail.user).toEqual({ id: 2, username: 'Author', avatar_url: null, role: 'user' });
    for (const key of ['file_path', 'renderer_preview_key', 'reject_reason', 'duplicate_note', 'metadata_json']) expect(detail).not.toHaveProperty(key);
    expect(detail.metadata).not.toHaveProperty('private');
  });
  it('omits full documents and renderer graphs from cards, bounds descriptions', () => {
    const card = toPublicResource(resource, true);
    expect(card.description).toHaveLength(360);
    expect(card).not.toHaveProperty('content_json');
    expect(card).not.toHaveProperty('renderer_metadata');
    for (const column of ['resource.content', 'resource.content_json', 'resource.description', 'user.email', 'user.phone', 'resource.file_path']) expect(RESOURCE_CARD_COLUMNS).not.toContain(column);
    expect(RESOURCE_CARD_COLUMNS).toContain('resource.rating_average');
  });
  it('retains rejection feedback for an authorized nonpublic read', () => {
    expect(toPublicResource({ ...resource, status: 'rejected' })).toHaveProperty('reject_reason', 'moderation note');
  });
});
