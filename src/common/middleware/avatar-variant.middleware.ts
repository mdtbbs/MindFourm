import { createHash, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { NextFunction, Request, Response } from 'express';
import sharp from 'sharp';

const AVATAR_ROOT = path.resolve(process.cwd(), 'uploads', 'avatars');
const AVATAR_CACHE_ROOT = path.resolve(process.cwd(), 'uploads', 'avatar-cache');
const ALLOWED_SIZES = new Set([32, 64, 128]);

/**
 * Serves cached WebP avatar thumbnails for `/uploads/avatars/{file}?size=N`.
 * Requests without a supported size pass through to the existing static mount.
 */
export function avatarVariantMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  let url: URL;
  try {
    url = new URL(req.originalUrl, 'http://localhost');
  } catch {
    return next();
  }
  const sizeValue = url.searchParams.get('size');
  if (sizeValue === null) return next();

  const size = Number(sizeValue);
  if (!Number.isInteger(size) || !ALLOWED_SIZES.has(size)) {
    res.status(400).type('text/plain').send('size must be 32, 64, or 128');
    return;
  }

  const prefix = '/uploads/avatars/';
  if (!url.pathname.startsWith(prefix)) return next();
  const filename = url.pathname.slice(prefix.length);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}\.(?:png|jpe?g|webp)$/i.test(filename)
    || path.basename(filename) !== filename) return next();

  void (async () => {
    const sourcePath = path.resolve(AVATAR_ROOT, filename);
    if (!sourcePath.startsWith(`${AVATAR_ROOT}${path.sep}`)) return next();
    let sourceStat;
    try {
      sourceStat = await fs.stat(sourcePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return next();
      throw error;
    }
    if (!sourceStat.isFile()) return next();

    const cacheKey = createHash('sha256')
      .update(`${filename}:${sourceStat.size}:${sourceStat.mtimeMs}:${size}`)
      .digest('hex');
    const cachePath = path.join(AVATAR_CACHE_ROOT, `${cacheKey}.webp`);
    let image: Buffer;
    try {
      image = await fs.readFile(cachePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      try {
        image = await sharp(sourcePath, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize({ width: size, height: size, fit: 'cover', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        // Keep the original avatar available if its image bytes cannot be decoded.
        return next();
      }
      await fs.mkdir(AVATAR_CACHE_ROOT, { recursive: true });
      const temporaryPath = `${cachePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
      try {
        await fs.writeFile(temporaryPath, image, { flag: 'wx' });
        await fs.rename(temporaryPath, cachePath);
      } catch (error) {
        await fs.unlink(temporaryPath).catch(() => undefined);
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    }

    const etag = `"${cacheKey}"`;
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('ETag', etag);
    res.setHeader('Content-Length', image.length);
    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304;
      res.end();
      return;
    }
    res.statusCode = 200;
    if (req.method === 'HEAD') res.end();
    else res.end(image);
  })().catch((error: NodeJS.ErrnoException) => {
    if (error?.code === 'ENOENT') return next();
    return next(error);
  });
}
