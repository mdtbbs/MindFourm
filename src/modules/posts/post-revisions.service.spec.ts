const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  JoinColumn: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
}));

jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));
jest.mock('@entities/post-revision.entity', () => ({ PostRevision: class PostRevision {} }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PostRevisionsService } from './post-revisions.service';

const AUTHOR = { id: 7, role: 'user' };
const STRANGER = { id: 8, role: 'user' };
const MODERATOR = { id: 99, role: 'moderator' };

const REVISION = {
  id: 3,
  post_id: 88,
  title: 'Original title',
  content: 'Original body',
  created_at: new Date('2026-07-01T00:00:00Z'),
  editor: {
    id: 7,
    username: 'author',
    role: 'user',
    // Private columns the relation would carry out of the API if nothing stripped them.
    email: 'author@example.com',
    mindauth_id: 4242,
  },
};

function createService(overrides: {
  post?: unknown;
  revisions?: [unknown[], number];
  revision?: unknown;
} = {}) {
  const postRepository = {
    findOne: jest.fn().mockResolvedValue(
      overrides.post === undefined ? { id: 88, user_id: AUTHOR.id } : overrides.post,
    ),
  };
  const revisionRepository = {
    findAndCount: jest.fn().mockResolvedValue(overrides.revisions ?? [[REVISION], 1]),
    findOne: jest.fn().mockResolvedValue(
      overrides.revision === undefined ? REVISION : overrides.revision,
    ),
  };

  const service = new PostRevisionsService(
    revisionRepository as any,
    postRepository as any,
  );

  return { service, postRepository, revisionRepository };
}

describe('PostRevisionsService.list', () => {
  it('returns the history to the post author', async () => {
    const { service } = createService();

    const result = await service.list(88, AUTHOR);

    expect(result.data).toEqual([
      expect.objectContaining({ id: 3, post_id: 88, title: 'Original title' }),
    ]);
  });

  it('returns the history to a moderator who does not own the post', async () => {
    const { service } = createService();

    await expect(service.list(88, MODERATOR)).resolves.toMatchObject({
      data: [expect.objectContaining({ id: 3 })],
    });
  });

  it('refuses a logged-in reader who neither wrote the post nor holds staff rank', async () => {
    // Stricter than reading the post itself on purpose: a revision preserves text that
    // was edited away, which is where secrets and moderated content end up.
    const { service } = createService();

    await expect(service.list(88, STRANGER)).rejects.toThrow(ForbiddenException);
  });

  it('refuses an unauthenticated reader rather than treating a missing viewer as staff', async () => {
    const { service } = createService();

    await expect(service.list(88, undefined)).rejects.toThrow(ForbiddenException);
  });

  it('reports a missing post as 404 rather than an empty history', async () => {
    const { service } = createService({ post: null });

    await expect(service.list(88, AUTHOR)).rejects.toThrow(NotFoundException);
  });

  it('omits the revision body from the list projection', async () => {
    const { service, revisionRepository } = createService();

    const result = await service.list(88, AUTHOR);

    expect(revisionRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { post_id: 88 },
        select: expect.not.objectContaining({ content: true }),
      }),
    );
    expect(result.data[0]).not.toHaveProperty('content');
  });

  it('strips the editor s private columns from the embedded user', async () => {
    const { service } = createService();

    const result = await service.list(88, AUTHOR);

    expect(result.data[0].editor).toMatchObject({ id: 7, username: 'author' });
    expect(result.data[0].editor).not.toHaveProperty('email');
    expect(result.data[0].editor).not.toHaveProperty('mindauth_id');
  });

  it('returns all four pagination fields, which the web client requires to render a page at all', async () => {
    const { service, revisionRepository } = createService({ revisions: [[REVISION], 7] });

    const result = await service.list(88, AUTHOR, 2, 3);

    expect(revisionRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 3, take: 3 }),
    );
    expect(result.pagination).toEqual({ page: 2, limit: 3, total: 7, totalPages: 3 });
  });

  it('clamps a non-positive page or limit instead of computing a negative offset', async () => {
    const { service, revisionRepository } = createService();

    const result = await service.list(88, AUTHOR, 0, 0);

    expect(revisionRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 1 }),
    );
    expect(result.pagination).toMatchObject({ page: 1, limit: 1 });
  });
});

describe('PostRevisionsService.get', () => {
  it('returns the full stored body for the post author', async () => {
    const { service } = createService();

    await expect(service.get(88, 3, AUTHOR)).resolves.toMatchObject({
      id: 3,
      title: 'Original title',
      content: 'Original body',
    });
  });

  it('refuses a reader who is neither the post author nor staff', async () => {
    const { service, revisionRepository } = createService();

    await expect(service.get(88, 3, STRANGER)).rejects.toThrow(ForbiddenException);
    // The permission check runs before the row is read, so an unauthorised caller
    // cannot even provoke the lookup.
    expect(revisionRepository.findOne).not.toHaveBeenCalled();
  });

  it('scopes the lookup by post_id, so a revision of another post is not readable here', async () => {
    const { service, revisionRepository } = createService({ revision: null });

    await expect(service.get(88, 999, AUTHOR)).rejects.toThrow(NotFoundException);
    expect(revisionRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 999, post_id: 88 } }),
    );
  });
});
