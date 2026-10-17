import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Colour-token contrast guard.
 *
 * The light theme's brand blue doubles as a fill and a foreground colour, and
 * the two need different values to satisfy WCAG AA (4.5:1 for body text). This
 * test recomputes the ratios from the real variables file so a future "nicer
 * blue" cannot silently drop the light theme back under the floor.
 */

const VARIABLES = join(__dirname, '..', '..', 'frontend', 'shared-styles', 'variables.css');

type Rgb = [number, number, number];

function readThemeBlock(source: string, selector: RegExp): string {
  const index = source.search(selector);
  if (index < 0) throw new Error(`theme block not found: ${selector}`);
  const open = source.indexOf('{', index);
  const close = source.indexOf('}', open);
  return source.slice(open + 1, close);
}

function hex(value: string): Rgb {
  const raw = value.trim().replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16));
}

function mix(base: Rgb, other: Rgb, ratio: number): Rgb {
  return base.map((channel, index) => channel * (1 - ratio) + other[index] * ratio) as Rgb;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** `declaration` reads a single `--name: value;` from a CSS block. */
function declaration(block: string, name: string): string {
  const match = new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`missing --${name}`);
  return match[1].trim();
}

/** Resolves the `color-mix(in srgb, var(--x) <pct>%, black|white)` form used here. */
function resolveColorMix(value: string, block: string): Rgb {
  const mixMatch = /color-mix\(in srgb, var\(--([\w-]+)\)\s*([\d.]+)%,\s*(black|white)\)/.exec(value);
  if (mixMatch) {
    const base = hex(declaration(block, mixMatch[1]));
    const target: Rgb = mixMatch[3] === 'black' ? [0, 0, 0] : [255, 255, 255];
    return mix(base, target, Number(mixMatch[2]) / 100);
  }
  const alias = /var\(--([\w-]+)\)/.exec(value);
  if (alias) return hex(declaration(block, alias[1]));
  return hex(value);
}

const source = readFileSync(VARIABLES, 'utf8');
const light = readThemeBlock(source, /^:root\s*\{/m);
const dark = readThemeBlock(source, /\[data-theme="dark"\]/);

describe('design token contrast (WCAG AA)', () => {
  const lightSurfaces: Array<[string, Rgb]> = [
    ['--bg', hex(declaration(light, 'bg'))],
    ['--bg-card', hex(declaration(light, 'bg-card'))],
    ['--bg-elevated', hex(declaration(light, 'bg-elevated'))],
    ['--bg-hover', hex(declaration(light, 'bg-hover'))],
  ];

  it('light-theme --primary-text clears 4.5:1 on every surface', () => {
    const text = resolveColorMix(declaration(light, 'primary-text'), light);
    for (const [name, surface] of lightSurfaces) {
      expect({ surface: name, ratio: Number(contrast(text, surface).toFixed(2)) })
        .toEqual({ surface: name, ratio: expect.any(Number) });
      expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('light-theme --primary-button keeps white labels above 4.5:1', () => {
    const button = resolveColorMix(declaration(light, 'primary-button'), light);
    expect(contrast([255, 255, 255], button)).toBeGreaterThanOrEqual(4.5);
  });

  it('light-theme --text-muted clears 4.5:1 on every surface', () => {
    const muted = hex(declaration(light, 'text-muted'));
    for (const [name, surface] of lightSurfaces) {
      expect({ surface: name, ratio: Number(contrast(muted, surface).toFixed(2)) })
        .toEqual({ surface: name, ratio: expect.any(Number) });
      expect(contrast(muted, surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('light-theme --text and --text-secondary clear 7:1 / 4.5:1', () => {
    const text = hex(declaration(light, 'text'));
    const secondary = hex(declaration(light, 'text-secondary'));
    const card = hex(declaration(light, 'bg-card'));
    expect(contrast(text, card)).toBeGreaterThanOrEqual(7);
    expect(contrast(secondary, card)).toBeGreaterThanOrEqual(4.5);
  });

  it('dark-theme text tokens clear 4.5:1 and --primary-text is not darkened', () => {
    const darkSurfaces: Array<[string, Rgb]> = [
      ['--bg', hex(declaration(dark, 'bg'))],
      ['--bg-card', hex(declaration(dark, 'bg-card'))],
      ['--bg-elevated', hex(declaration(dark, 'bg-elevated'))],
      ['--bg-hover', hex(declaration(dark, 'bg-hover'))],
    ];
    const primary = resolveColorMix(declaration(dark, 'primary-text'), dark);
    // On dark surfaces the raw brand colour is already legible; darkening it
    // further (the light-theme rule) would be wrong.
    expect(primary).toEqual(hex(declaration(dark, 'primary')));

    for (const token of ['text', 'text-secondary', 'text-muted']) {
      const value = hex(declaration(dark, token));
      for (const [name, surface] of darkSurfaces) {
        expect({ token, surface: name, ratio: Number(contrast(value, surface).toFixed(2)) })
          .toEqual({ token, surface: name, ratio: expect.any(Number) });
        expect(contrast(value, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
