import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A page-level `const t = (key: string) => translate(locale, key)` wrapper is a
 * silent trap: a caller that passes `{ count }` still compiles, but the
 * interpolation never happens and the UI renders the literal template
 * ("{count} 个主题"). This guards the whole frontend against that shape instead
 * of only the one page where it was noticed.
 */

const ROOT = join(__dirname, '..', '..', 'frontend', 'src');

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.next', 'dist'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectSourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/** Top-level comma count, so `{ count: f(a, b) }` is one argument, not three. */
function countTopLevelArguments(argumentList: string): number {
  let depth = 0;
  let commas = 0;
  for (const char of argumentList) {
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) commas += 1;
  }
  return argumentList.trim() ? commas + 1 : 0;
}

describe('frontend translation wrappers', () => {
  const files = collectSourceFiles(ROOT);

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('never calls a values-less t() wrapper with interpolation values', () => {
    const offences: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Wrappers that declare a single parameter and forward only `key`.
      const wrappers = [...source.matchAll(/const\s+(\w+)\s*=\s*\(\s*(\w+)\s*:\s*string\s*\)\s*=>\s*translate\(/g)]
        .map((match) => match[1]);
      if (wrappers.length === 0) continue;

      for (const wrapper of wrappers) {
        const calls = new RegExp(`\\b${wrapper}\\(([^)]*)\\)`, 'g');
        for (const call of source.matchAll(calls)) {
          if (countTopLevelArguments(call[1]) < 2) continue;
          const line = source.slice(0, call.index).split('\n').length;
          offences.push(`${file.replace(ROOT, 'frontend/src')}:${line} ${wrapper}(${call[1].trim().slice(0, 80)})`);
        }
      }
    }

    expect(offences).toEqual([]);
  });
});
