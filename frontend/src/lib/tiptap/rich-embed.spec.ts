import { parseRichEmbed } from './rich-embed';

describe('parseRichEmbed', () => {
  it('recognizes configured video providers and direct HTTPS media', () => {
    expect(parseRichEmbed('https://www.bilibili.com/video/BV1xx411c7mD', {
      videoProviders: ['bilibili'],
    })).toEqual({ type: 'video', attrs: { provider: 'bilibili', videoId: 'BV1xx411c7mD', title: '' } });

    expect(parseRichEmbed('https://cdn.example.org/clips/intro.webm?quality=720p', {
      videoProviders: ['direct'],
    })).toEqual({ type: 'video', attrs: { provider: 'direct', src: 'https://cdn.example.org/clips/intro.webm?quality=720p', title: '' } });
  });

  it('rejects lookalike hosts, disabled providers, credentials and non-HTTPS video URLs', () => {
    expect(parseRichEmbed('https://bilibili.com.attacker.test/video/BV1xx411c7mD', { videoProviders: ['bilibili'] })).toBeNull();
    expect(parseRichEmbed('https://www.bilibili.com/video/BV1xx411c7mD', { videoProviders: [] })).toBeNull();
    expect(parseRichEmbed('https://user:secret@cdn.example.org/clip.mp4', { videoProviders: ['direct'] })).toBeNull();
    expect(parseRichEmbed('http://cdn.example.org/clip.mp4', { videoProviders: ['direct'] })).toBeNull();
  });

  it('creates quotes only from forum hosts and safe positive ids', () => {
    expect(parseRichEmbed('https://www.mdtbbs.cn/posts/42#reply-9', {
      domain: 'mdtbbs.cn',
      currentHostname: 'localhost',
      videoProviders: [],
    })).toEqual({ type: 'replyQuote', attrs: { postId: 42, replyId: 9 } });
    expect(parseRichEmbed('https://forum.attacker.test/posts/42', {
      domain: 'mdtbbs.cn',
      currentHostname: 'localhost',
      videoProviders: [],
    })).toBeNull();
    expect(parseRichEmbed('https://mdtbbs.cn/posts/9007199254740992', {
      domain: 'mdtbbs.cn',
      currentHostname: 'localhost',
      videoProviders: [],
    })).toBeNull();
  });
});
