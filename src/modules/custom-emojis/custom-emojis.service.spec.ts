const decorator = () => () => undefined;

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

jest.mock('typeorm', () => ({
  Repository: class Repository {},
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
  In: (values: number[]) => ({ __in: values }),
}));

jest.mock('@entities/index', () => ({ CustomEmoji: class CustomEmoji {} }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CustomEmojisService } from './custom-emojis.service';

interface StubEmoji {
  id: number;
  name: string;
  shortcode: string;
  file_name?: string;
  file_path?: string;
  mime_type?: string;
  is_enabled?: number;
  sort_order?: number;
  created_by_user_id?: number;
}

interface RepositoryStub {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  remove: jest.Mock;
}

function createRepository(): RepositoryStub {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    // `create` echoes its input; `save` returns a persisted-looking row.
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: Record<string, unknown>) => ({ id: 99, ...value })),
    remove: jest.fn(async (value: unknown) => value),
  };
}

function createService(repository: RepositoryStub = createRepository()) {
  const service = new CustomEmojisService(repository as any);
  return { service, repository };
}

const baseInput = {
  name: '大笑',
  shortcode: 'Laugh',
  file_name: 'laugh.png',
  file_path: '/app/uploads/custom-emojis/1-laugh.png',
  mime_type: 'image/png',
  created_by_user_id: 7,
};

describe('CustomEmojisService.listEnabled', () => {
  it('selects only enabled emojis with the projected columns and stable ordering', async () => {
    const { service, repository } = createService();
    const rows = [
      { id: 1, name: '大笑', shortcode: 'laugh', sort_order: 0 },
      { id: 2, name: '哭', shortcode: 'cry', sort_order: 5 },
    ];
    repository.find.mockResolvedValue(rows);

    await expect(service.listEnabled()).resolves.toBe(rows);
    expect(repository.find).toHaveBeenCalledWith({
      where: { is_enabled: 1 },
      select: { id: true, name: true, shortcode: true, sort_order: true },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  });

  it('listAll has no enabled filter but keeps the same ordering', async () => {
    const { service, repository } = createService();
    repository.find.mockResolvedValue([]);

    await service.listAll();

    expect(repository.find).toHaveBeenCalledWith({ order: { sort_order: 'ASC', id: 'ASC' } });
  });
});

describe('CustomEmojisService.getEnabled', () => {
  it('filters on the enabled flag and returns the row', async () => {
    const { service, repository } = createService();
    const emoji: StubEmoji = { id: 3, name: '赞', shortcode: 'plus', is_enabled: 1 };
    repository.findOne.mockResolvedValue(emoji);

    await expect(service.getEnabled(3)).resolves.toBe(emoji);
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 3, is_enabled: 1 } });
  });

  it('throws NotFoundException when the emoji is missing or disabled', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(null);

    await expect(service.getEnabled(404)).rejects.toThrow(NotFoundException);
    await expect(service.getEnabled(404)).rejects.toThrow('表情不存在');
  });
});

describe('CustomEmojisService.create', () => {
  it('trims the name, lowercases the shortcode and forces the default flags', async () => {
    const { service, repository } = createService();

    const created = await service.create({ ...baseInput });

    expect(repository.save).toHaveBeenCalledWith({
      ...baseInput,
      name: '大笑',
      shortcode: 'laugh',
      is_enabled: 1,
      sort_order: 0,
    });
    expect(created).toMatchObject({ name: '大笑', shortcode: 'laugh', is_enabled: 1, sort_order: 0 });
  });

  it('accepts the boundary lengths of name and shortcode', async () => {
    const { service, repository } = createService();
    const name = 'x'.repeat(80);
    const shortcode = 'a'.repeat(48);

    await service.create({ ...baseInput, name: ` ${name} `, shortcode: ` ${shortcode} ` });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ name, shortcode }),
    );
  });

  it('keeps the shortcode character set limited to lowercase, digits and _+-', async () => {
    const { service } = createService();

    await expect(service.create({ ...baseInput, shortcode: 'a_1+-' })).resolves.toBeDefined();
    await expect(service.create({ ...baseInput, shortcode: 'UPPER' })).resolves.toBeDefined();
  });

  it('rejects an empty, over-long or non-string name without saving', async () => {
    const { service, repository } = createService();

    for (const name of ['', '   ', 'x'.repeat(81), undefined as unknown as string, 42 as unknown as string]) {
      await expect(service.create({ ...baseInput, name })).rejects.toThrow(BadRequestException);
      await expect(service.create({ ...baseInput, name })).rejects.toThrow('表情名称无效');
    }
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rejects an invalid shortcode without saving', async () => {
    const { service, repository } = createService();

    for (const shortcode of ['', '   ', 'has space', 'a'.repeat(49), 'emoji😀', 'UPPER CASE', undefined as unknown as string]) {
      await expect(service.create({ ...baseInput, shortcode })).rejects.toThrow(BadRequestException);
      await expect(service.create({ ...baseInput, shortcode })).rejects.toThrow('shortcode 仅允许小写字母、数字和 _+-');
    }
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('CustomEmojisService.update', () => {
  function seed(overrides: StubEmoji = {}): StubEmoji {
    return {
      id: 5,
      name: '大笑',
      shortcode: 'laugh',
      file_name: 'laugh.png',
      file_path: '/app/uploads/custom-emojis/1-laugh.png',
      mime_type: 'image/png',
      is_enabled: 1,
      sort_order: 0,
      created_by_user_id: 7,
      ...overrides,
    };
  }

  it('throws NotFoundException when the emoji does not exist', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(null);

    await expect(service.update(404, { name: '新名字' })).rejects.toThrow(NotFoundException);
    await expect(service.update(404, { name: '新名字' })).rejects.toThrow('表情不存在');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('applies only the provided fields and keeps the rest intact', async () => {
    const { service, repository } = createService();
    const emoji = seed();
    repository.findOne.mockResolvedValue(emoji);

    const updated = await service.update(5, { name: ' 欢呼 ' });

    expect(updated).toMatchObject({ name: '欢呼', shortcode: 'laugh', is_enabled: 1, sort_order: 0 });
    expect(repository.save).toHaveBeenCalledWith(emoji);
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 5 } });
  });

  it('normalizes shortcode and maps the enabled flag to a tinyint', async () => {
    const { service, repository } = createService();
    const emoji = seed();
    repository.findOne.mockResolvedValue(emoji);

    await service.update(5, { shortcode: ' Party ', is_enabled: false });
    expect(repository.save).toHaveBeenLastCalledWith(expect.objectContaining({ shortcode: 'party', is_enabled: 0 }));

    await service.update(5, { shortcode: 'party', is_enabled: true });
    expect(repository.save).toHaveBeenLastCalledWith(expect.objectContaining({ shortcode: 'party', is_enabled: 1 }));
  });

  it('accepts the sort_order boundaries and rejects anything outside them', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(seed());

    await service.update(5, { sort_order: 100000 });
    expect(repository.save).toHaveBeenLastCalledWith(expect.objectContaining({ sort_order: 100000 }));

    await service.update(5, { sort_order: -100000 });
    expect(repository.save).toHaveBeenLastCalledWith(expect.objectContaining({ sort_order: -100000 }));

    for (const sort_order of [100001, -100001, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3' as unknown as number]) {
      await expect(service.update(5, { sort_order })).rejects.toThrow(BadRequestException);
      await expect(service.update(5, { sort_order })).rejects.toThrow('sort_order 无效');
    }
    expect(repository.save).toHaveBeenCalledTimes(2);
  });

  it('re-validates name and shortcode on update', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(seed());

    await expect(service.update(5, { name: '   ' })).rejects.toThrow('表情名称无效');
    await expect(service.update(5, { shortcode: 'bad code' })).rejects.toThrow('shortcode 仅允许小写字母、数字和 _+-');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('treats an explicit false is_enabled without touching other fields', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(seed());

    const updated = await service.update(5, { is_enabled: false });

    expect(updated).toMatchObject({ name: '大笑', shortcode: 'laugh', is_enabled: 0, sort_order: 0 });
  });
});

describe('CustomEmojisService.remove', () => {
  it('deletes the row and returns the removed entity', async () => {
    const { service, repository } = createService();
    const emoji = { id: 8, name: '赞', shortcode: 'plus', file_path: '/app/uploads/custom-emojis/8.png' };
    repository.findOne.mockResolvedValue(emoji);

    await expect(service.remove(8)).resolves.toBe(emoji);
    expect(repository.remove).toHaveBeenCalledWith(emoji);
  });

  it('throws NotFoundException and removes nothing when the emoji is missing', async () => {
    const { service, repository } = createService();
    repository.findOne.mockResolvedValue(null);

    await expect(service.remove(404)).rejects.toThrow(NotFoundException);
    await expect(service.remove(404)).rejects.toThrow('表情不存在');
    expect(repository.remove).not.toHaveBeenCalled();
  });
});

describe('CustomEmojisService.canonicalizeDocument', () => {
  const doc = () => ({
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'hi ' },
        // Stale name/shortcode: the client may render a renamed emoji, so the
        // server has to rewrite the attributes from the database.
        { type: 'customEmoji', attrs: { id: 3, name: '旧名字', shortcode: 'old' } },
      ],
    }],
  });

  it('rewrites emoji attributes from the enabled rows', async () => {
    const { service, repository } = createService();
    repository.find.mockResolvedValue([{ id: 3, name: '大笑', shortcode: 'laugh', is_enabled: 1 }]);

    const result: any = await service.canonicalizeDocument(doc());

    expect(result.content[0].content[1].attrs).toEqual({ id: 3, name: '大笑', shortcode: 'laugh' });
    const where: any = repository.find.mock.calls[0][0].where;
    expect(where.is_enabled).toBe(1);
    expect(where.id.__in).toEqual([3]);
  });

  it('rejects references to unknown or disabled emojis', async () => {
    const { service, repository } = createService();
    repository.find.mockResolvedValue([]);

    await expect(service.canonicalizeDocument(doc())).rejects.toThrow(
      expect.objectContaining({ response: { code: 'INVALID_CUSTOM_EMOJI', details: { id: 3 } } }),
    );
  });

  it('does not hit the repository when the document has no emoji', async () => {
    const { service, repository } = createService();

    const result: any = await service.canonicalizeDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plain' }] }] });

    expect(result.content[0].content[0].text).toBe('plain');
    expect(repository.find).not.toHaveBeenCalled();
  });
});
