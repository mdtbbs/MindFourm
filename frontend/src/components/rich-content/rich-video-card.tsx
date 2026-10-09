'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { siteProfile } from '@/config/site-profile';
import { safeUrl, safeVideoEmbed } from '@/lib/tiptap/presentation-url';

/** A stable video frame; editing never loads third-party players. */
export function RichVideoCard({ attrs, editing = false }: { attrs: Record<string, any>; editing?: boolean }) {
  const [activated, setActivated] = useState(false);
  const provider = String(attrs.provider || '');
  const title = String(attrs.title || `${provider} 视频`);
  const source = provider === 'direct' && siteProfile.videoProviders.includes('direct') ? safeUrl(attrs.src, true) : null;
  const direct = source && /\.(?:mp4|webm)(?:$|[?#])/i.test(source) ? source : null;
  const embed = safeVideoEmbed({ attrs });
  const supported = Boolean(direct || embed);
  return <figure className="rich-video-card" data-rich-video-provider={provider}>
    <div className="rich-video-stage">
      {!editing && direct ? <video controls preload="none" src={direct} aria-label={title} />
        : !editing && activated && embed && provider !== 'douyin' ? <iframe data-testid="rich-video-frame" src={embed} title={title} loading="lazy" sandbox="allow-scripts allow-same-origin allow-presentation" allow="fullscreen; picture-in-picture" referrerPolicy="strict-origin-when-cross-origin" />
        : editing || !supported ? <span className="rich-video-poster"><Play size={24} aria-hidden="true" />{supported ? '发布后可播放' : '此视频来源在当前站点不可用。'}</span>
        : provider === 'douyin' && activated ? <a className="rich-video-poster" href={embed || undefined} target="_blank" rel="noopener noreferrer">在抖音打开视频 ↗</a>
        : <button type="button" className="rich-video-poster" data-testid="rich-video-activate" onClick={() => setActivated(true)}><Play size={24} aria-hidden="true" />点击加载视频</button>}
    </div>
    <figcaption>{title} · {provider}</figcaption>
  </figure>;
}
