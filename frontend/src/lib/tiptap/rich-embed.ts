import { siteProfile } from '@/config/site-profile';

export type RichEmbed =
  | { type: 'video'; attrs: { provider: 'direct'; src: string; title: string } }
  | { type: 'video'; attrs: { provider: 'youtube' | 'bilibili' | 'douyin'; videoId: string; title: string } }
  | { type: 'postQuote'; attrs: { postId: number } }
  | { type: 'replyQuote'; attrs: { postId: number; replyId: number } };

export type RichEmbedPolicy = {
  domain?: string;
  currentHostname?: string;
  videoProviders?: readonly string[];
};

const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com']);

function isDomainOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** Parse only known video providers and same-site post/reply links into rich cards. */
export function parseRichEmbed(raw: string, policy: RichEmbedPolicy = {}): RichEmbed | null {
  if (!raw || raw.length > 4096 || /[\u0000-\u001f\u007f\\]/.test(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  const providers = policy.videoProviders || siteProfile.videoProviders;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');

  if (providers.includes('direct') && /\.(?:mp4|webm)$/i.test(url.pathname)) {
    return { type: 'video', attrs: { provider: 'direct', src: url.href, title: '' } };
  }

  if (providers.includes('youtube') && YOUTUBE_HOSTS.has(host)) {
    const id = host === 'youtu.be'
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') || url.pathname.match(/\/embed\/([A-Za-z0-9_-]{11})(?:\/|$)/)?.[1];
    if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
      return { type: 'video', attrs: { provider: 'youtube', videoId: id, title: '' } };
    }
  }

  if (providers.includes('bilibili') && isDomainOrSubdomain(host, 'bilibili.com')) {
    const id = url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10}|av[1-9][0-9]{0,14})(?:\/|$)/)?.[1]
      || url.searchParams.get('bvid');
    if (id && /^(?:BV[0-9A-Za-z]{10}|av[1-9][0-9]{0,14})$/.test(id)) {
      return { type: 'video', attrs: { provider: 'bilibili', videoId: id, title: '' } };
    }
  }

  if (providers.includes('douyin') && isDomainOrSubdomain(host, 'douyin.com')) {
    const id = url.pathname.match(/\/video\/(\d{5,32})(?:\/|$)/)?.[1];
    if (id) return { type: 'video', attrs: { provider: 'douyin', videoId: id, title: '' } };
  }

  const currentHostname = (policy.currentHostname || (typeof window === 'undefined' ? '' : window.location.hostname)).toLowerCase();
  const siteDomain = (policy.domain || siteProfile.domain).toLowerCase();
  const isForumHost = url.hostname === currentHostname
    || url.hostname === siteDomain
    || url.hostname === `www.${siteDomain}`;
  if (!isForumHost) return null;

  const postId = Number(url.pathname.match(/^\/posts\/(\d+)(?:\/|$)/)?.[1]);
  if (!Number.isSafeInteger(postId) || postId < 1) return null;
  const replyId = Number(url.hash.match(/^#reply-(\d+)$/)?.[1]);
  if (Number.isSafeInteger(replyId) && replyId > 0) {
    return { type: 'replyQuote', attrs: { postId, replyId } };
  }
  return { type: 'postQuote', attrs: { postId } };
}
