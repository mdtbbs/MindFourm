import { EventBusService } from './event-bus.service';

describe('EventBusService.register / execute', () => {
  let bus: EventBusService;

  beforeEach(() => {
    bus = new EventBusService();
  });

  it('runs hooks of multiple plugins for the same hook name in priority order', async () => {
    const calls: string[] = [];

    bus.register('post.create.before', 'slow-plugin', async (ctx: any) => {
      calls.push('slow');
      return ctx;
    }, 100);
    bus.register('post.create.before', 'fast-plugin', async (ctx: any) => {
      calls.push('fast');
      return ctx;
    }, 1);
    bus.register('post.create.before', 'mid-plugin', async (ctx: any) => {
      calls.push('mid');
      return ctx;
    }, 50);

    await bus.execute('post.create.before', { title: 'x' });

    // Lower priority number runs first, regardless of registration order.
    expect(calls).toEqual(['fast', 'mid', 'slow']);
  });

  it('keeps registration order for hooks sharing the same priority', async () => {
    const calls: string[] = [];
    bus.register('h', 'a', async () => { calls.push('a'); }, 0);
    bus.register('h', 'b', async () => { calls.push('b'); }, 0);
    bus.register('h', 'c', async () => { calls.push('c'); }, 0);

    await bus.execute('h', {});

    expect(calls).toEqual(['a', 'b', 'c']);
  });

  it('defaults priority to 0', async () => {
    const calls: string[] = [];
    bus.register('h', 'later', async () => { calls.push('later'); }, 5);
    bus.register('h', 'default', async () => { calls.push('default'); });

    await bus.execute('h', {});

    expect(calls).toEqual(['default', 'later']);
  });

  it('threads the context through filter hooks', async () => {
    bus.register('post.filter', 'p1', async (ctx: any) => ({ ...ctx, seen: (ctx.seen || 0) + 1 }), 0);
    bus.register('post.filter', 'p2', async (ctx: any) => ({ ...ctx, seen: ctx.seen + 10 }), 1);

    await expect(bus.execute('post.filter', { seen: 0 })).resolves.toEqual({ seen: 11 });
  });

  it('keeps the previous context when a hook returns undefined or null', async () => {
    bus.register('h', 'void-hook', async () => undefined, 0);
    bus.register('h', 'null-hook', async () => null, 1);
    bus.register('h', 'no-return', () => { /* side effect only */ }, 2);

    const context = { title: 'kept' };
    await expect(bus.execute('h', context)).resolves.toBe(context);
  });

  it('supports synchronous hook functions', async () => {
    bus.register('h', 'p', (ctx: any) => ({ ...ctx, sync: true }), 0);

    await expect(bus.execute('h', {})).resolves.toEqual({ sync: true });
  });

  it('returns the untouched context for an unknown hook name', async () => {
    const context = { a: 1 };
    await expect(bus.execute('never-registered', context)).resolves.toBe(context);
  });
});

describe('EventBusService hook error isolation', () => {
  it('continues with the remaining hooks and keeps the last good context', async () => {
    const bus = new EventBusService();
    const calls: string[] = [];

    bus.register('h', 'ok-1', async (ctx: any) => ({ ...ctx, steps: ['ok-1'] }), 0);
    bus.register('h', 'boom', async () => { throw new Error('hook exploded'); }, 1);
    bus.register('h', 'ok-2', async (ctx: any) => {
      calls.push('ok-2');
      return { ...ctx, steps: [...ctx.steps, 'ok-2'] };
    }, 2);

    const result = await bus.execute('h', { steps: [] });

    expect(calls).toEqual(['ok-2']);
    expect(result.steps).toEqual(['ok-1', 'ok-2']);
  });

  it('isolates a rejected promise the same way as a thrown error', async () => {
    const bus = new EventBusService();
    const after = jest.fn().mockResolvedValue({ ok: true });

    bus.register('h', 'failing', () => Promise.reject(new Error('async boom')), 0);
    bus.register('h', 'after', after, 1);

    await expect(bus.execute('h', { ok: false })).resolves.toEqual({ ok: true });
    expect(after).toHaveBeenCalledWith({ ok: false });
  });

  it('resolves even when every hook fails', async () => {
    const bus = new EventBusService();
    bus.register('h', 'a', async () => { throw new Error('a'); }, 0);
    bus.register('h', 'b', async () => { throw new Error('b'); }, 1);

    const context = { unchanged: true };
    await expect(bus.execute('h', context)).resolves.toBe(context);
  });

  it('does not leak a failed hook into other hook names', async () => {
    const bus = new EventBusService();
    bus.register('first', 'bad', async () => { throw new Error('nope'); }, 0);
    const other = jest.fn().mockResolvedValue({ ok: 1 });
    bus.register('second', 'good', other, 0);

    await bus.execute('first', {});
    await expect(bus.execute('second', {})).resolves.toEqual({ ok: 1 });
    expect(other).toHaveBeenCalled();
  });
});

describe('EventBusService.unregister', () => {
  let bus: EventBusService;

  beforeEach(() => {
    bus = new EventBusService();
  });

  it('removes only the hooks belonging to the given plugin', async () => {
    const keep = jest.fn().mockResolvedValue(undefined);
    const drop = jest.fn().mockResolvedValue(undefined);

    bus.register('h', 'plugin-a', drop, 0);
    bus.register('h', 'plugin-b', keep, 1);

    bus.unregister('plugin-a');

    expect(bus.getRegisteredHooks()).toEqual([{ hookName: 'h', count: 1 }]);
    expect(bus.getPluginHooks('plugin-a')).toEqual([]);
    expect(bus.getPluginHooks('plugin-b')).toEqual(['h']);

    await bus.execute('h', {});
    expect(drop).not.toHaveBeenCalled();
    expect(keep).toHaveBeenCalledTimes(1);
  });

  it('removes the plugin from every hook name it registered on', () => {
    bus.register('a', 'p', jest.fn(), 0);
    bus.register('b', 'p', jest.fn(), 0);
    bus.register('b', 'other', jest.fn(), 0);

    bus.unregister('p');

    expect(bus.getPluginHooks('p')).toEqual([]);
    // 'a' keeps an empty bucket: unregister only replaces the array in place.
    expect(bus.getRegisteredHooks()).toEqual([
      { hookName: 'a', count: 0 },
      { hookName: 'b', count: 1 },
    ]);
    expect(bus.getPluginHooks('other')).toEqual(['b']);
  });

  it('is a no-op for an unknown plugin', () => {
    bus.register('h', 'known', jest.fn(), 0);

    bus.unregister('unknown');

    expect(bus.getRegisteredHooks()).toEqual([{ hookName: 'h', count: 1 }]);
  });

  it('can be called twice without affecting other plugins', () => {
    bus.register('h', 'p', jest.fn(), 0);
    bus.register('h', 'q', jest.fn(), 0);

    bus.unregister('p');
    bus.unregister('p');

    expect(bus.getRegisteredHooks()).toEqual([{ hookName: 'h', count: 1 }]);
  });
});

describe('EventBusService introspection', () => {
  let bus: EventBusService;

  beforeEach(() => {
    bus = new EventBusService();
  });

  it('counts every registration per hook name', () => {
    bus.register('post.create.before', 'a', jest.fn(), 0);
    bus.register('post.create.before', 'b', jest.fn(), 1);
    bus.register('post.create.after', 'a', jest.fn(), 0);

    expect(bus.getRegisteredHooks()).toEqual([
      { hookName: 'post.create.before', count: 2 },
      { hookName: 'post.create.after', count: 1 },
    ]);
  });

  it('returns an empty list when nothing is registered', () => {
    expect(bus.getRegisteredHooks()).toEqual([]);
    expect(bus.getPluginHooks('anything')).toEqual([]);
  });

  it('lists each hook name once per plugin', () => {
    bus.register('h1', 'p', jest.fn(), 0);
    bus.register('h1', 'p', jest.fn(), 1);
    bus.register('h2', 'p', jest.fn(), 0);
    bus.register('h2', 'other', jest.fn(), 0);

    expect(bus.getPluginHooks('p').sort()).toEqual(['h1', 'h2']);
    expect(bus.getPluginHooks('other')).toEqual(['h2']);
  });

  it('clear drops all hooks', async () => {
    bus.register('h', 'p', jest.fn(), 0);
    await bus.execute('h', {});

    bus.clear();

    expect(bus.getRegisteredHooks()).toEqual([]);
    expect(bus.getPluginHooks('p')).toEqual([]);
    const context = { c: 1 };
    await expect(bus.execute('h', context)).resolves.toBe(context);
  });

  it('accepts new registrations after clear', () => {
    bus.register('h', 'p', jest.fn(), 0);
    bus.clear();
    bus.register('h', 'q', jest.fn(), 0);

    expect(bus.getRegisteredHooks()).toEqual([{ hookName: 'h', count: 1 }]);
    expect(bus.getPluginHooks('q')).toEqual(['h']);
  });
});
