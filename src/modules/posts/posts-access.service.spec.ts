const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
  DataSource: class DataSource {},
  Brackets: class Brackets {},
  In: (value: unknown) => ({ __op: 'In', value }),
  LessThan: (value: unknown) => ({ __op: 'LessThan', value }),
  MoreThan: (value: unknown) => ({ __op: 'MoreThan', value }),
  Like: (value: unknown) => ({ __op: 'Like', value }),
  Not: (value: unknown) => ({ __op: 'Not', value }),
  Entity: decorator,
  PrimaryGeneratedColumn: decorator,
  PrimaryColumn: decorator,
  Column: decorator,
  ManyToOne: decorator,
  OneToMany: decorator,
  ManyToMany: decorator,
  OneToOne: decorator,
  JoinColumn: decorator,
  JoinTable: decorator,
  CreateDateColumn: decorator,
  UpdateDateColumn: decorator,
  DeleteDateColumn: decorator,
  Index: decorator,
  Unique: decorator,
}));

jest.mock('@entities/post.entity', () => ({ Post: class Post {} }));
jest.mock('@entities/user.entity', () => ({ User: class User {} }));
jest.mock('@entities/category.entity', () => ({ Category: class Category {} }));
jest.mock('@entities/tag.entity', () => ({ Tag: class Tag {} }));
jest.mock('@entities/post-tag.entity', () => ({ PostTag: class PostTag {} }));
jest.mock('@entities/reply.entity', () => ({ Reply: class Reply {} }));
jest.mock('@common/utils/markdown.util', () => ({ parseMarkdown: (v: string) => v }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PostsService } from './posts.service';

function createService(options: { isMember?: boolean; requiresApproval?: boolean } = {}) {
  const groupsService = {
    checkMembership: jest.fn().mockResolvedValue(options.isMember ?? false),
  };
  const settingsService = {
    getBoolean: jest.fn().mockResolvedValue(options.requiresApproval ?? true),
  };

  const service = new PostsService(
    {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    {} as any, {} as any,
    groupsService as any,
    { execute: jest.fn() } as any,
    {} as any, {} as any,
    settingsService as any,
    {} as any, {} as any,
  );

  return { service, groupsService, settingsService };
}

const STAFF = { id: 99, role: 'moderator' };
const AUTHOR = { id: 7, role: 'user' };
const STRANGER = { id: 8, role: 'user' };

describe('PostsService visibility', () => {
  async function check(
    post: Record<string, any>,
    viewer?: { id: number; role: string },
    options?: { isMember?: boolean },
  ) {
    const { service } = createService(options);
    return (service as any).assertPostVisible(post, viewer);
  }

  it('allows anyone to read a published post', async () => {
    await expect(check({ status: 'published', user_id: 7 })).resolves.toBeUndefined();
  });

  it.each(['draft', 'pending', 'deleted'])(
    'hides a %s post from anonymous readers',
    async (status) => {
      // findById applied no status filter at all, so these were readable by id —
      // including posts rejected by a moderator (which get status 'deleted').
      await expect(check({ status, user_id: 7 })).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it('hides an unpublished post from other logged-in users', async () => {
    await expect(check({ status: 'pending', user_id: 7 }, STRANGER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('lets the author read their own unpublished post', async () => {
    await expect(check({ status: 'pending', user_id: 7 }, AUTHOR)).resolves.toBeUndefined();
  });

  it('lets staff read an unpublished post', async () => {
    await expect(check({ status: 'pending', user_id: 7 }, STAFF)).resolves.toBeUndefined();
  });

  it('refuses a group-restricted post for anonymous readers', async () => {
    // The check used to be `if (userId && post.required_group_id)`, so logging out
    // bypassed it entirely.
    await expect(
      check({ status: 'published', user_id: 7, required_group_id: 3 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a group-restricted post for a non-member', async () => {
    await expect(
      check({ status: 'published', user_id: 7, required_group_id: 3 }, STRANGER, {
        isMember: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a group member through', async () => {
    await expect(
      check({ status: 'published', user_id: 7, required_group_id: 3 }, STRANGER, {
        isMember: true,
      }),
    ).resolves.toBeUndefined();
  });

  it('allows staff into a group-restricted post without membership', async () => {
    await expect(
      check({ status: 'published', user_id: 7, required_group_id: 3 }, STAFF, { isMember: false }),
    ).resolves.toBeUndefined();
  });
});

describe('PostsService.resolveStatusTransition', () => {
  async function transition(
    current: string,
    requested: string,
    isStaff: boolean,
    requiresApproval = true,
  ) {
    const { service } = createService({ requiresApproval });
    return (service as any).resolveStatusTransition(current, requested, isStaff);
  }

  it('is a no-op when the status is unchanged', async () => {
    await expect(transition('published', 'published', false)).resolves.toBeNull();
  });

  it('sends an author publishing a draft into the moderation queue', async () => {
    // The regression: `if (dto.status) updateData.status = dto.status` let an author
    // publish straight past require_post_approval.
    await expect(transition('draft', 'published', false, true)).resolves.toBe('pending');
  });

  it('publishes directly when approval is disabled', async () => {
    await expect(transition('draft', 'published', false, false)).resolves.toBe('published');
  });

  it('refuses an author republishing a pending post', async () => {
    await expect(transition('pending', 'published', false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses an author reviving a rejected post', async () => {
    await expect(transition('deleted', 'published', false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets an author pull an unpublished post back to draft', async () => {
    await expect(transition('pending', 'draft', false)).resolves.toBe('draft');
  });

  it('refuses an author unpublishing a live post', async () => {
    await expect(transition('published', 'draft', false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets staff set either status directly', async () => {
    await expect(transition('pending', 'published', true)).resolves.toBe('published');
    await expect(transition('published', 'draft', true)).resolves.toBe('draft');
  });
});
