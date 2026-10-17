import { CommunityCoreModule } from './community-core.module';

import { PostsModule } from '../posts/posts.module';
import { RepliesModule } from '../replies/replies.module';
import { UsersModule } from '../users/users.module';
import { CategoriesModule } from '../categories/categories.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SecurityAccessLogsModule } from '../security-access-logs/security-access-logs.module';
import { MultiplayerModule } from '../multiplayer/multiplayer.module';
import { RealtimeGatewayModule } from '../realtime/realtime-gateway.module';

// Nest reads the module graph from the `imports` metadata that `@Module()` writes
// onto the class. CommunityCoreModule is a pure aggregator, so its imports list is
// the only behaviour it has — these assertions are what keeps it honest.
const getImports = (): unknown[] => Reflect.getMetadata('imports', CommunityCoreModule) ?? [];

const moduleName = (entry: unknown): string =>
  typeof entry === 'function' ? (entry as { name: string }).name : String(entry);

describe('CommunityCoreModule', () => {
  it('declares a non-empty imports array', () => {
    const imports = getImports();

    expect(Array.isArray(imports)).toBe(true);
    expect(imports.length).toBeGreaterThan(0);
  });

  it('imports only Nest modules', () => {
    const imports = getImports();

    // `@Module()` on a class always writes at least one of these keys; a plain
    // class (or an entity accidentally pasted into the list) carries none, so
    // Nest fails at bootstrap with a much less obvious error.
    const metadataKeys = ['imports', 'providers', 'controllers', 'exports'];
    const nonModules = imports.filter((entry) => {
      if (typeof entry !== 'function') {
        return false; // dynamic modules (`forFeature(...)`) are objects, not classes
      }
      return !metadataKeys.some((key) => Reflect.getMetadata(key, entry) !== undefined);
    });

    expect(nonModules.map(moduleName)).toEqual([]);
  });

  it('aggregates the core forum modules', () => {
    const imports = getImports();

    for (const module of [
      PostsModule,
      RepliesModule,
      UsersModule,
      CategoriesModule,
      NotificationsModule,
      SecurityAccessLogsModule,
      MultiplayerModule,
      RealtimeGatewayModule,
    ]) {
      expect(imports).toContain(module);
    }
  });

  it('keeps the aggregate list large enough to be the community core', () => {
    // The concrete list is intentionally not pinned: adding a module is fine,
    // silently gutting the aggregator is not.
    expect(getImports().length).toBeGreaterThanOrEqual(40);
  });

  it('contains no duplicate module', () => {
    const imports = getImports();

    // Nest registers every entry, so the same class twice means duplicate
    // providers/controllers. Distinct classes that merely share a name are just
    // as confusing to debug, so both views are asserted.
    const names = imports.map(moduleName);

    expect(new Set(imports).size).toBe(imports.length);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('CommunityCoreModule wiring', () => {
  it('is wired into AppModule', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AppModule } = require('../../app.module');
    const appImports = (Reflect.getMetadata('imports', AppModule) ?? []) as unknown[];

    expect(appImports).toContain(CommunityCoreModule);
  });

  it('is an aggregate module with no controllers of its own', () => {
    expect(Reflect.getMetadata('controllers', CommunityCoreModule)).toBeUndefined();
  });
});
