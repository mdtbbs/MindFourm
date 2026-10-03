import { detectContentLanguage, prioritizeContentLanguage } from './content-language';

describe('content language', () => {
  it('detects the supported scripts and uses the default for Latin text', () => {
    expect(detectContentLanguage('Blueprint для Mindustry')).toBe('ru');
    expect(detectContentLanguage('マインドストリーの設計図')).toBe('ja');
    expect(detectContentLanguage('分享一个地图')).toBe('zh-CN');
    expect(detectContentLanguage('Mindustry map')).toBe('en');
  });

  it('keeps other languages visible and preserves order within language groups', () => {
    const items = [
      { id: 1, content_language: 'ru' },
      { id: 2, content_language: 'en' },
      { id: 3, content_language: 'en' },
      { id: 4, content_language: 'ja' },
    ];
    expect(prioritizeContentLanguage(items, 'en').map(({ id }) => id)).toEqual([2, 3, 1, 4]);
    expect(prioritizeContentLanguage(items, null).map(({ id }) => id)).toEqual([1, 2, 3, 4]);
  });
});
