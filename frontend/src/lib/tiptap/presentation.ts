/** Presentation values for the existing Schema v2 marks; never accept arbitrary CSS. */
export const FONT_STACKS: Record<string, string> = {
  default: 'inherit',
  'serif-cn': '"Songti SC", SimSun, serif',
  'sans-cn': '"Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  kai: 'KaiTi, STKaiti, serif',
  'source-serif-cn': '"Noto Serif CJK SC", "Source Han Serif SC", serif',
  'source-sans-cn': '"Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
  monospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};
export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32];
export const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: '#FFF2CC', green: '#D9EAD3', blue: '#CFE2F3', pink: '#F4CCCC', orange: '#FCE5CD',
};
export function textColorStyle(color: unknown): Record<string, string> {
  return typeof color === 'string' && /^#[0-9A-F]{6}(?:[0-9A-F]{2})?$/.test(color) ? { color } : {};
}
export function highlightStyle(color: string): Record<string, string> {
  return HIGHLIGHT_COLORS[color] ? { backgroundColor: HIGHLIGHT_COLORS[color] } : {};
}
export function fontSizeStyle(value: unknown): Record<string, string> {
  const size = Number(String(value || '').replace(/px$/, ''));
  return FONT_SIZES.includes(size) ? { fontSize: `${size}px` } : {};
}
export function fontFamilyStyle(family: string): Record<string, string> {
  return FONT_STACKS[family] ? { fontFamily: FONT_STACKS[family] } : {};
}

export function cssStyle(style: Record<string, string>) {
  return Object.entries(style).map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}: ${value}`).join('; ');
}
