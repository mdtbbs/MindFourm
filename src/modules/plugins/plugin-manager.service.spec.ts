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
}));

jest.mock('@entities/index', () => ({
  Plugin: class Plugin {},
  PluginHook: class PluginHook {},
  PluginConfig: class PluginConfig {},
  PluginPermission: class PluginPermission {},
}));

// The service hits the filesystem on install/uninstall and `require()`s plugin
// code on load; both are faked so the suite never touches disk.
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  rmSync: jest.fn(),
}));

import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PluginManagerService, PluginMetadata } from './plugin-manager.service';

const fsExists = fs.existsSync as jest.Mock;
const fsMkdir = fs.mkdirSync as jest.Mock;
const fsRm = fs.rmSync as jest.Mock;

const pluginsDir = path.join(process.cwd(), 'plugins');
const pluginDirOf = (s: string) => path.join(pluginsDir, s);
const indexPathOf = (s: string) => path.join(pluginDirOf(s), 'index.js');

// Every test works on its own slug: Node's require cache is per test file, so
// reusing a slug would hand a later test the plugin module loaded by an earlier one.
let slug: string;
let slugCounter = 0;

const virtualMocks: string[] = [];

// Entry points are resolved at call time and no file exists on disk, so the
// module has to be registered through `doMock` with `virtual: true`.
function mockPluginModule(targetSlug: string, exports: Record<string, any>): void {
  const indexPath = indexPathOf(targetSlug);
  jest.doMock(indexPath, () => exports, { virtual: true });
  virtualMocks.push(indexPath);
}

function makePlugin(overrides: Partial<any> = {}): any {
  return {
    id: 1,
    slug,
    name: 'Demo',
    version: '1.0.0',
    is_installed: 1,
    is_active: 0,
    config: null,
    ...overrides,
  };
}

function createService() {
  const pluginRepo = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) =>
      Array.isArray(v) ? v.map((item, i) => ({ id: i + 1, ...item })) : v,
    ),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const pluginHookRepo = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => v),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const pluginConfigRepo = {
    find: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const pluginPermissionRepo = {
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const eventBus = {
    register: jest.fn(),
    unregister: jest.fn(),
    execute: jest.fn(async (_name: string, ctx: any) => ctx),
  };

  const service = new PluginManagerService(
    pluginRepo as any,
    pluginHookRepo as any,
    pluginConfigRepo as any,
    pluginPermissionRepo as any,
    eventBus as any,
  );

  return { service, pluginRepo, pluginHookRepo, pluginConfigRepo, pluginPermissionRepo, eventBus };
}

function baseMetadata(overrides: Partial<PluginMetadata> = {}): PluginMetadata {
  return { slug, name: 'Demo Plugin', version: '1.0.0', ...overrides };
}

beforeEach(() => {
  jest.clearAllMocks();
  fsExists.mockReturnValue(true);
  slug = `demo-${++slugCounter}`;
});

afterEach(() => {
  for (const p of virtualMocks.splice(0)) {
    jest.dontMock(p);
  }
});

describe('PluginManagerService.install', () => {
  it('stores the plugin as installed but inactive with an empty config', async () => {
    const { service, pluginRepo } = createService();

    const saved = await service.install(baseMetadata());

    expect(pluginRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        slug,
        name: 'Demo Plugin',
        version: '1.0.0',
        is_installed: 1,
        is_active: 0,
        config: JSON.stringify({}),
      }),
    );
    expect(saved).toMatchObject({ id: 1, is_installed: 1, is_active: 0 });
  });

  it('rejects a slug that is already installed', async () => {
    const { service, pluginRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin());

    await expect(service.install(baseMetadata())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.install(baseMetadata())).rejects.toThrow('插件已安装');
    expect(pluginRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a missing dependency by name', async () => {
    const { service, pluginRepo } = createService();

    await expect(service.install(baseMetadata({ dependencies: ['auth-core'] }))).rejects.toThrow(
      '缺少依赖: auth-core',
    );
    expect(pluginRepo.save).not.toHaveBeenCalled();
  });

  it('checks every dependency when they all exist and stores them as JSON', async () => {
    const { service, pluginRepo } = createService();
    pluginRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.slug === slug ? null : makePlugin({ slug: where.slug }),
    );

    await service.install(baseMetadata({ dependencies: ['auth-core', 'mailer'] }));

    // one lookup for the plugin itself plus one per dependency
    expect(pluginRepo.findOne).toHaveBeenCalledTimes(3);
    expect(pluginRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ dependencies: JSON.stringify(['auth-core', 'mailer']) }),
    );
  });

  it('creates a hook row per declared hook, defaulting the priority to 0', async () => {
    const { service, pluginHookRepo } = createService();

    await service.install(
      baseMetadata({
        hooks: [
          { name: 'post.create.before', handler: 'onBeforeCreate', priority: 5 },
          { name: 'post.create.after', handler: 'onAfterCreate' },
        ],
      }),
    );

    expect(pluginHookRepo.create).toHaveBeenNthCalledWith(1, {
      plugin_id: 1,
      hook_name: 'post.create.before',
      priority: 5,
      is_active: 1,
    });
    expect(pluginHookRepo.create).toHaveBeenNthCalledWith(2, {
      plugin_id: 1,
      hook_name: 'post.create.after',
      priority: 0,
      is_active: 1,
    });
    expect(pluginHookRepo.save).toHaveBeenCalledTimes(2);
  });

  it('does not create hook rows when the metadata declares none', async () => {
    const { service, pluginHookRepo } = createService();

    await service.install(baseMetadata());

    expect(pluginHookRepo.create).not.toHaveBeenCalled();
    expect(pluginHookRepo.save).not.toHaveBeenCalled();
  });

  it('creates the plugins root and the plugin folder when they are missing', async () => {
    const { service } = createService();
    fsExists.mockReturnValue(false);

    await service.install(baseMetadata());

    expect(fsMkdir).toHaveBeenCalledWith(pluginsDir, { recursive: true });
    expect(fsMkdir).toHaveBeenCalledWith(pluginDirOf(slug), { recursive: true });
  });

  it('reuses existing directories', async () => {
    const { service } = createService();

    await service.install(baseMetadata());

    expect(fsMkdir).not.toHaveBeenCalled();
  });

  it('rejects a slug that would escape the plugins directory', async () => {
    const { service, pluginRepo } = createService();

    await expect(service.install(baseMetadata({ slug: '../evil' }))).rejects.toThrow(
      'Invalid plugin slug',
    );
    expect(pluginRepo.save).not.toHaveBeenCalled();
    expect(fsMkdir).not.toHaveBeenCalled();
  });

  it('rejects an empty slug', async () => {
    const { service } = createService();

    await expect(service.install(baseMetadata({ slug: '' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('PluginManagerService.uninstall', () => {
  it('purges hooks, configs, permissions and the plugin row, then the folder', async () => {
    const { service, pluginRepo, pluginHookRepo, pluginConfigRepo, pluginPermissionRepo } =
      createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ id: 7 }));

    await service.uninstall(slug);

    expect(pluginHookRepo.delete).toHaveBeenCalledWith({ plugin_id: 7 });
    expect(pluginConfigRepo.delete).toHaveBeenCalledWith({ plugin_id: 7 });
    expect(pluginPermissionRepo.delete).toHaveBeenCalledWith({ plugin_id: 7 });
    expect(pluginRepo.delete).toHaveBeenCalledWith(7);
    expect(fsRm).toHaveBeenCalledWith(pluginDirOf(slug), { recursive: true, force: true });
  });

  it('skips the folder removal when the directory is gone', async () => {
    const { service, pluginRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ id: 7 }));
    fsExists.mockReturnValue(false);

    await service.uninstall(slug);

    expect(fsRm).not.toHaveBeenCalled();
    expect(pluginRepo.delete).toHaveBeenCalled();
  });

  it('throws when the plugin is unknown', async () => {
    const { service, pluginRepo } = createService();

    await expect(service.uninstall(slug)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.uninstall(slug)).rejects.toThrow('插件不存在');
    expect(pluginRepo.delete).not.toHaveBeenCalled();
  });

  it('unregisters hooks and drops the loaded instance of an active plugin', async () => {
    const { service, pluginRepo, eventBus } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin());
    mockPluginModule(slug, { init: async () => ({}) });

    await service.enable(slug);
    expect((service as any).loadedPlugins.has(slug)).toBe(true);

    pluginRepo.findOne.mockResolvedValue(makePlugin({ is_active: 1 }));
    await service.uninstall(slug);

    expect(eventBus.unregister).toHaveBeenCalledWith(slug);
    expect((service as any).loadedPlugins.has(slug)).toBe(false);
  });

  it('does not touch the event bus for a plugin that was never loaded', async () => {
    const { service, pluginRepo, eventBus } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin());

    await service.uninstall(slug);

    expect(eventBus.unregister).not.toHaveBeenCalled();
  });
});

describe('PluginManagerService.enable / disable', () => {
  it('throws when enabling an unknown plugin', async () => {
    const { service } = createService();

    await expect(service.enable(slug)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to enable an already active plugin', async () => {
    const { service, pluginRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ is_active: 1 }));

    await expect(service.enable(slug)).rejects.toThrow('插件已启用');
    expect(pluginRepo.save).not.toHaveBeenCalled();
  });

  it('flips is_active and loads the plugin from disk', async () => {
    const { service, pluginRepo } = createService();
    const plugin = makePlugin({ is_active: 0, config: JSON.stringify({ greeting: 'hi' }) });
    pluginRepo.findOne.mockResolvedValue(plugin);
    mockPluginModule(slug, { init: async () => ({}) });

    await service.enable(slug);

    expect(plugin.is_active).toBe(1);
    expect(pluginRepo.save).toHaveBeenCalledWith(plugin);
    expect((service as any).loadedPlugins.get(slug)).toBeDefined();
  });

  it('throws when disabling an unknown plugin', async () => {
    const { service } = createService();

    await expect(service.disable(slug)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to disable an already disabled plugin', async () => {
    const { service, pluginRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ is_active: 0 }));

    await expect(service.disable(slug)).rejects.toThrow('插件已禁用');
    expect(pluginRepo.save).not.toHaveBeenCalled();
  });

  it('unregisters hooks and persists is_active = 0', async () => {
    const { service, pluginRepo, eventBus } = createService();
    const plugin = makePlugin({ is_active: 1 });
    pluginRepo.findOne.mockResolvedValue(plugin);

    await service.disable(slug);

    expect(eventBus.unregister).toHaveBeenCalledWith(slug);
    expect(plugin.is_active).toBe(0);
    expect(pluginRepo.save).toHaveBeenCalledWith(plugin);
  });
});

describe('PluginManagerService plugin loading', () => {
  it('registers only the hooks the instance actually implements', async () => {
    const { service, pluginRepo, pluginHookRepo, eventBus } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ id: 3 }));
    pluginHookRepo.find.mockResolvedValue([
      { hook_name: 'post.create.before', priority: 2, is_active: 1, plugin_id: 3 },
      { hook_name: 'post.delete.after', priority: 9, is_active: 1, plugin_id: 3 },
    ]);
    const implemented = async () => ({ ok: true });
    mockPluginModule(slug, { init: async () => ({ 'post.create.before': implemented }) });

    await service.enable(slug);

    expect(pluginHookRepo.find).toHaveBeenCalledWith({
      where: { plugin_id: 3, is_active: 1 },
      order: { priority: 'ASC' },
    });
    expect(eventBus.register).toHaveBeenCalledTimes(1);
    expect(eventBus.register).toHaveBeenCalledWith('post.create.before', slug, implemented, 2);
  });

  it('parses the stored config before handing it to init()', async () => {
    const { service, pluginRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(
      makePlugin({ config: JSON.stringify({ greeting: 'hi', retries: 3 }) }),
    );
    const init = jest.fn(async () => ({}));
    mockPluginModule(slug, { init });

    await service.enable(slug);

    expect(init).toHaveBeenCalledWith(
      expect.objectContaining({
        slug,
        config: { greeting: 'hi', retries: 3 },
        eventBus: expect.anything(),
      }),
    );
  });

  it('falls back to an empty config when none is stored', async () => {
    const { service, pluginRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ config: null }));
    const init = jest.fn(async () => ({}));
    mockPluginModule(slug, { init });

    await service.enable(slug);

    expect(init).toHaveBeenCalledWith(expect.objectContaining({ config: {} }));
  });

  it('skips a plugin whose directory is missing', async () => {
    const { service, pluginRepo, pluginHookRepo, eventBus } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin());
    fsExists.mockReturnValue(false);

    await expect(service.enable(slug)).resolves.toBeUndefined();

    expect(pluginHookRepo.find).not.toHaveBeenCalled();
    expect(eventBus.register).not.toHaveBeenCalled();
    expect((service as any).loadedPlugins.has(slug)).toBe(false);
  });

  it('skips a plugin without an index.js', async () => {
    const { service, pluginRepo, pluginHookRepo, eventBus } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin());
    fsExists.mockImplementation((p: string) => p === pluginDirOf(slug));

    await service.enable(slug);

    expect(fsExists).toHaveBeenCalledWith(indexPathOf(slug));
    expect(pluginHookRepo.find).not.toHaveBeenCalled();
    expect(eventBus.register).not.toHaveBeenCalled();
  });

  it('skips a module that does not export init()', async () => {
    const { service, pluginRepo, eventBus } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin());
    mockPluginModule(slug, { init: 'not-a-function' });

    await service.enable(slug);

    expect(eventBus.register).not.toHaveBeenCalled();
    expect((service as any).loadedPlugins.has(slug)).toBe(false);
  });

  it('does not register hooks the instance exposes as non-functions', async () => {
    const { service, pluginRepo, pluginHookRepo, eventBus } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin());
    pluginHookRepo.find.mockResolvedValue([
      { hook_name: 'post.create.before', priority: 0, is_active: 1, plugin_id: 1 },
    ]);
    mockPluginModule(slug, { init: async () => ({ 'post.create.before': 'nope' }) });

    await service.enable(slug);

    expect(eventBus.register).not.toHaveBeenCalled();
  });
});

describe('PluginManagerService.loadPlugins', () => {
  it('loads only installed and active plugins and counts them', async () => {
    const { service, pluginRepo, pluginHookRepo, eventBus } = createService();
    pluginRepo.find.mockResolvedValue([
      makePlugin({ id: 1, slug: 'alpha' }),
      makePlugin({ id: 2, slug: 'beta' }),
    ]);
    pluginHookRepo.find.mockResolvedValue([
      { hook_name: 'post.create.before', priority: 0, is_active: 1 },
    ]);
    const alphaHook = async () => 'alpha';
    const betaHook = async () => 'beta';
    jest.doMock(indexPathOf('alpha'), () => ({ init: async () => ({ 'post.create.before': alphaHook }) }), { virtual: true });
    jest.doMock(indexPathOf('beta'), () => ({ init: async () => ({ 'post.create.before': betaHook }) }), { virtual: true });
    virtualMocks.push(indexPathOf('alpha'), indexPathOf('beta'));

    await service.loadPlugins();

    expect(pluginRepo.find).toHaveBeenCalledWith({ where: { is_active: 1, is_installed: 1 } });
    expect(eventBus.register).toHaveBeenCalledTimes(2);
    expect(eventBus.register).toHaveBeenCalledWith('post.create.before', 'alpha', alphaHook, 0);
    expect(eventBus.register).toHaveBeenCalledWith('post.create.before', 'beta', betaHook, 0);
    expect((service as any).loadedPlugins.size).toBe(2);
  });

  it('keeps loading the remaining plugins when one of them fails', async () => {
    const { service, pluginRepo, pluginHookRepo, eventBus } = createService();
    pluginRepo.find.mockResolvedValue([
      makePlugin({ id: 1, slug: 'broken' }),
      makePlugin({ id: 2, slug: 'healthy' }),
    ]);
    pluginHookRepo.find.mockResolvedValue([
      { hook_name: 'post.create.after', priority: 4, is_active: 1 },
    ]);
    fsExists.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.includes('broken')) throw new Error('fs exploded');
      return true;
    });
    const hook = async () => 'ok';
    jest.doMock(indexPathOf('healthy'), () => ({ init: async () => ({ 'post.create.after': hook }) }), { virtual: true });
    virtualMocks.push(indexPathOf('healthy'));

    await expect(service.loadPlugins()).resolves.toBeUndefined();

    expect(eventBus.register).toHaveBeenCalledTimes(1);
    expect(eventBus.register).toHaveBeenCalledWith('post.create.after', 'healthy', hook, 4);
    expect((service as any).loadedPlugins.has('broken')).toBe(false);
    expect((service as any).loadedPlugins.has('healthy')).toBe(true);
  });

  it('does nothing when no plugin is active', async () => {
    const { service, pluginRepo, pluginHookRepo, eventBus } = createService();
    pluginRepo.find.mockResolvedValue([]);

    await service.loadPlugins();

    expect(eventBus.register).not.toHaveBeenCalled();
    expect(pluginHookRepo.find).not.toHaveBeenCalled();
    expect((service as any).loadedPlugins.size).toBe(0);
  });
});

describe('PluginManagerService.configure / getConfig', () => {
  it('serializes the new configuration', async () => {
    const { service, pluginRepo } = createService();
    const plugin = makePlugin({ config: '{"old":true}' });
    pluginRepo.findOne.mockResolvedValue(plugin);

    await service.configure(slug, { enabled: true, level: 2 });

    expect(plugin.config).toBe(JSON.stringify({ enabled: true, level: 2 }));
    expect(pluginRepo.save).toHaveBeenCalledWith(plugin);
  });

  it('throws when configuring an unknown plugin', async () => {
    const { service, pluginRepo } = createService();

    await expect(service.configure(slug, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(pluginRepo.save).not.toHaveBeenCalled();
  });

  it('parses the stored configuration', async () => {
    const { service, pluginRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ config: '{"a":1,"b":[2]}' }));

    await expect(service.getConfig(slug)).resolves.toEqual({ a: 1, b: [2] });
  });

  it('returns an empty object when no configuration is stored', async () => {
    const { service, pluginRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ config: null }));

    await expect(service.getConfig(slug)).resolves.toEqual({});
  });

  it('returns an empty object for an empty stored string', async () => {
    const { service, pluginRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ config: '' }));

    await expect(service.getConfig(slug)).resolves.toEqual({});
  });

  it('throws when reading the config of an unknown plugin', async () => {
    const { service } = createService();

    await expect(service.getConfig(slug)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PluginManagerService queries', () => {
  it('lists plugins newest first', async () => {
    const { service, pluginRepo } = createService();
    const rows = [makePlugin({ id: 2 }), makePlugin({ id: 1 })];
    pluginRepo.find.mockResolvedValue(rows);

    await expect(service.getPlugins()).resolves.toBe(rows);
    expect(pluginRepo.find).toHaveBeenCalledWith({ order: { created_at: 'DESC' } });
  });

  it('returns a single plugin by slug', async () => {
    const { service, pluginRepo } = createService();
    const plugin = makePlugin({ id: 4 });
    pluginRepo.findOne.mockResolvedValue(plugin);

    await expect(service.getPlugin(slug)).resolves.toBe(plugin);
    expect(pluginRepo.findOne).toHaveBeenCalledWith({ where: { slug } });
  });

  it('throws when the plugin does not exist', async () => {
    const { service } = createService();

    await expect(service.getPlugin(slug)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists the hooks of a plugin', async () => {
    const { service, pluginRepo, pluginHookRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ id: 5 }));
    const hooks = [{ id: 1, plugin_id: 5, hook_name: 'post.create.before' }];
    pluginHookRepo.find.mockResolvedValue(hooks);

    await expect(service.getPluginHooks(slug)).resolves.toBe(hooks);
    expect(pluginHookRepo.find).toHaveBeenCalledWith({ where: { plugin_id: 5 } });
  });

  it('throws when listing hooks of an unknown plugin', async () => {
    const { service, pluginHookRepo } = createService();

    await expect(service.getPluginHooks(slug)).rejects.toBeInstanceOf(NotFoundException);
    expect(pluginHookRepo.find).not.toHaveBeenCalled();
  });

  it('lists the config rows of a plugin', async () => {
    const { service, pluginRepo, pluginConfigRepo } = createService();
    pluginRepo.findOne.mockResolvedValue(makePlugin({ id: 6 }));
    const rows = [{ id: 1, plugin_id: 6, key: 'theme', value: 'dark' }];
    pluginConfigRepo.find.mockResolvedValue(rows);

    await expect(service.getPluginConfigs(slug)).resolves.toBe(rows);
    expect(pluginConfigRepo.find).toHaveBeenCalledWith({ where: { plugin_id: 6 } });
  });

  it('throws when listing config rows of an unknown plugin', async () => {
    const { service, pluginConfigRepo } = createService();

    await expect(service.getPluginConfigs(slug)).rejects.toBeInstanceOf(NotFoundException);
    expect(pluginConfigRepo.find).not.toHaveBeenCalled();
  });

  it('delegates hook execution to the event bus', async () => {
    const { service, eventBus } = createService();
    eventBus.execute.mockResolvedValue({ filtered: true });

    await expect(service.executeHook('post.filter', { filtered: false })).resolves.toEqual({
      filtered: true,
    });
    expect(eventBus.execute).toHaveBeenCalledWith('post.filter', { filtered: false });
  });
});
