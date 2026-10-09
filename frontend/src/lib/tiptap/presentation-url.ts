import { siteProfile } from '@/config/site-profile';

export function safeUrl(value: unknown, image = false): string | null {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u001f\\]/.test(value)) return null;
  if (value.startsWith('/') && !value.startsWith('//') && !value.split('/').includes('..')) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:' || (!image && url.protocol === 'mailto:')) return value;
  } catch { /* Only absolute http(s) and safe root-relative paths render. */ }
  return null;
}

export function safeVideoEmbed(node: { attrs?: Record<string, any> }): string | null {
  const provider = node.attrs?.provider;
  const id = String(node.attrs?.videoId || '');
  if (!siteProfile.videoProviders.includes(provider)) return null;
  if (provider === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(id)) return 'https://www.youtube-nocookie.com/embed/' + id;
  if (provider === 'bilibili' && /^BV[0-9A-Za-z]{10}$/.test(id)) return 'https://player.bilibili.com/player.html?bvid=' + encodeURIComponent(id) + '&autoplay=0';
  if (provider === 'bilibili' && /^av[1-9][0-9]{0,14}$/.test(id)) return 'https://player.bilibili.com/player.html?aid=' + encodeURIComponent(id.slice(2)) + '&autoplay=0';
  if (provider === 'douyin' && /^[0-9]{5,32}$/.test(id)) return 'https://www.douyin.com/video/' + encodeURIComponent(id);
  return null;
}

