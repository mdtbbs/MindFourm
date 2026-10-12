import { uploadImage, importRemoteImage, type UploadImageResult } from './upload-image';
import { HTML_DOCUMENT_MAX_LENGTH } from '../../../../src/common/utils/html-document-policy';

export const HTML_IMPORT_MAX_LENGTH = 8 * 1024 * 1024;
export const HTML_IMPORT_MAX_IMAGES = 100;
const CSS_URL = /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^)]*))\s*\)/gi;
const cssUrlValue = (a: string, b: string, c: string) => (a ?? b ?? c ?? '').trim()
  .replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\r\f ])?|\\([^\r\n\f])/gi, (_match, hex, char) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 0xfffd, 0x10ffff)) : char);

type ImageTask = { key: string; remote?: string; file?: File };

/** Import external and embedded images before saving, preserving their HTML/CSS layout. */
export async function importHtmlDocument(
  html: string,
  upload = uploadImage,
  importRemote = importRemoteImage,
  siteOrigin = globalThis.location?.origin || 'https://html-import.invalid',
): Promise<string> {
  if (html.length > HTML_IMPORT_MAX_LENGTH) throw new Error('HTML 文件过大，最大支持 8MB');
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let base = siteOrigin + '/';
  const declaredBase = doc.querySelector('base[href]')?.getAttribute('href');
  if (declaredBase) {
    try { base = new URL(declaredBase, base).href; } catch { throw new Error('HTML 中的 base 地址无效'); }
  }
  const tasks = new Map<string, ImageTask>();
  const sources = new Map<string, string>();
  const images = Array.from(doc.querySelectorAll('img[src]')).map((image) => ({ image, src: image.getAttribute('src') || '' }));
  const styles = [
    ...Array.from(doc.querySelectorAll('style')).map((element) => ({ css: element.textContent || '', apply: (css: string) => { element.textContent = css; } })),
    ...Array.from(doc.querySelectorAll('[style]')).map((element) => ({ css: element.getAttribute('style') || '', apply: (css: string) => { element.setAttribute('style', css); } })),
  ];
  const register = (raw: string) => {
    const src = raw.trim();
    if (!src || src.startsWith('#') || sources.has(src)) return;
    if (/^data:/i.test(src)) {
      const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(src);
      if (!match) throw new Error('内嵌图片仅支持 Base64 PNG、JPEG、GIF、WebP');
      let bytes: string;
      try { bytes = atob(match[2].replace(/\s/g, '')); } catch { throw new Error('内嵌图片的 Base64 数据无效'); }
      if (bytes.length > 2 * 1024 * 1024) throw new Error('内嵌图片超过 2MB');
      const data = Uint8Array.from(bytes, (char) => char.charCodeAt(0));
      tasks.set(src, { key: src, file: new File([data], `html-image-${tasks.size + 1}.${match[1].split('/')[1]}`, { type: match[1].toLowerCase() }) });
      sources.set(src, src);
      return;
    }
    let url: URL;
    try { url = new URL(src, base); } catch { throw new Error(`图片地址无效：${src}`); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`图片地址仅支持 HTTP(S)：${src}`);
    if (url.origin === siteOrigin) {
      sources.set(src, url.pathname + url.search + url.hash);
      return;
    }
    url.hash = '';
    tasks.set(url.href, { key: url.href, remote: url.href });
    sources.set(src, url.href);
  };
  for (const { src } of images) register(src);
  for (const { css } of styles) {
    for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(new RegExp(CSS_URL))) register(cssUrlValue(match[1], match[2], match[3]));
  }
  if (tasks.size > HTML_IMPORT_MAX_IMAGES) throw new Error(`HTML 中需要导入的图片最多支持 ${HTML_IMPORT_MAX_IMAGES} 张`);
  const rewrite = (urls: Map<string, string>) => {
    const replacement = (src: string) => {
      const key = sources.get(src.trim());
      return key ? urls.get(key) || key : src;
    };
    for (const { image, src } of images) image.setAttribute('src', replacement(src));
    for (const { css, apply } of styles) apply(css.replace(CSS_URL, (original, a, b, c) => {
      const src = cssUrlValue(a, b, c);
      const next = replacement(src);
      return next === src ? original : `url("${next}")`;
    }));
  };
  // Preflight the post-import markup before performing any uploads.
  rewrite(new Map(Array.from(tasks.keys(), (key) => [key, '/uploads/public-images/import-placeholder.png'])));
  if (doc.documentElement.outerHTML.length > HTML_DOCUMENT_MAX_LENGTH) throw new Error('HTML 排版和文字超过 200000 字符，请精简内容');
  const queue = Array.from(tasks.values());
  const imported = new Map<string, string>();
  let cursor = 0;
  let failure: Error | undefined;
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (!failure && cursor < queue.length) {
      const task = queue[cursor++];
      try {
        const result: UploadImageResult = task.file ? await upload(task.file) : await importRemote(task.remote!);
        if (!result.url.startsWith('/') || result.url.startsWith('//')) throw new Error('导入接口未返回站内图片链接');
        imported.set(task.key, result.url);
      } catch (error) {
        const detail = error instanceof Error ? error.message : '请重试';
        failure ||= new Error(`图片导入失败${task.remote ? `（${task.remote}）` : ''}：${detail}`);
      }
    }
  }));
  if (failure) throw failure;
  rewrite(imported);
  const changed = tasks.size > 0 || Array.from(sources).some(([src, target]) => src !== target);
  return changed ? '<!doctype html>\n' + doc.documentElement.outerHTML : html;
}
