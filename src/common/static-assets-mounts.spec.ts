import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Regression guard for the static mounts declared in `src/app.module.ts`.
 *
 * @nestjs/serve-static registers two handlers per mount: `express.static` and a
 * render fallback that calls `res.sendFile(<mountRoot>/<renderPath>)`. The
 * fallback only applies to requests that are not in `exclude`. Without an
 * exclude entry every request under the mount — including a request for a file
 * that does not exist — reaches the fallback, and when the mount root has no
 * index file that call throws ENOENT. The global exception filter then answers
 * with a 500 envelope.
 *
 * That is exactly how a request for a deleted avatar (`/uploads/avatars/*`) and
 * every asset under `/public/*` turned into "服务器内部错误".
 */
const moduleSource = readFileSync(join(__dirname, '..', 'app.module.ts'), 'utf8');

// Match the whole call: the option object contains nested parentheses
// (`join(__dirname, ...)`), so a naive `[^)]*` would stop at the first one.
const mounts = [...moduleSource.matchAll(/ServeStaticModule\.forRoot\((\{[\s\S]*?\})\)/g)].map(
  (match) => match[1],
);

describe('static asset mounts', () => {
  it('declares the mounts that serve uploaded and public files', () => {
    expect(mounts.some((mount) => mount.includes("'uploads', 'avatars'"))).toBe(true);
    expect(mounts.some((mount) => mount.includes("'uploads', 'public-images'"))).toBe(true);
  });

  it.each(mounts.map((mount, index) => [index, mount] as const))(
    'mount %i excludes every request from the render fallback',
    (_index, mount) => {
      // A missing `exclude` (or one that does not cover the mount) sends missing
      // files to `res.sendFile`, which raises ENOENT and becomes a 500.
      expect(mount).toContain('exclude:');
      // Without fallthrough, express.static answers the 404 itself; with it the
      // request continues to the application's own handler.
      expect(mount).toContain('fallthrough: true');
    },
  );

  it('does not serve browser assets from the repository public directory', () => {
    // The production image does not copy a repository `public/` directory, so a
    // mount pointing at one fails closed with ENOENT instead of 404.
    expect(moduleSource).not.toContain("join(__dirname, '..', 'public')");
  });
});
