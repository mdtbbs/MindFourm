#!/usr/bin/env node
'use strict';

/**
 * Documentation link check for the runtime API guides.
 *
 * The developer-doc renderer rewrites `](file.md)` links to served guide slugs,
 * so only files listed in MARKDOWN_GUIDES become `/api/v1/docs/<slug>`. Any other
 * `*.md` link is published verbatim and therefore has to resolve as a repository
 * path instead. Both cases are checked here, together with the `#anchor` part:
 * a guide the renderer cannot resolve is a dead link on the developer site, and
 * a heading anchor that no longer exists is a dead link inside a working page.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const apiDir = path.join(root, 'docs', 'api');
const rendererPath = path.join(root, 'src', 'developer-docs', 'register-developer-docs.ts');

function guideSlugs() {
  const source = fs.readFileSync(rendererPath, 'utf8');
  const block = source.match(/const MARKDOWN_GUIDES: Record<string, string> = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error('Could not read MARKDOWN_GUIDES from register-developer-docs.ts');
  const byFile = new Map();
  for (const line of block[1].split('\n')) {
    const match = line.match(/^\s*'?([\w-]+)'?:\s*'([\w.-]+\.md)'/);
    if (match) byFile.set(match[2], match[1]);
  }
  const productBlock = source.match(/const PRODUCT_GUIDES: Record<string, string> = \{([\s\S]*?)\n\};/);
  if (productBlock) {
    for (const line of productBlock[1].split('\n')) {
      const match = line.match(/^\s*'?([\w-]+)'?:\s*'([\w.-]+\.md)'/);
      if (match) byFile.set(`product/${match[2]}`, match[1]);
    }
  }
  return byFile;
}

function anchorId(label) {
  return label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

function headingIds(markdown) {
  const ids = new Map();
  const seen = new Map();
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = line.match(/^\s{0,3}(#{2,3})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const label = match[2]
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/[\*_~]/g, '')
      .trim();
    const base = anchorId(label) || 'section';
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    ids.set(count === 1 ? base : `${base}-${count}`, label);
  }
  return ids;
}

function decode(anchor) {
  try { return decodeURIComponent(anchor); } catch { return anchor; }
}

function main() {
  const byFile = guideSlugs();
  const servedFiles = [...byFile.keys()];
  const problems = [];
  const checked = new Set();

  for (const file of servedFiles) {
    const isProduct = file.startsWith('product/');
    const filePath = path.join(root, 'docs', isProduct ? 'product' : 'api', path.basename(file));
    if (!fs.existsSync(filePath)) {
      problems.push(`${file}: guide file is missing on disk (${path.relative(root, filePath)})`);
      continue;
    }
    const markdown = fs.readFileSync(filePath, 'utf8');
    const linkPattern = /\]\(([^)\s]+\.md)(#[^)\s]*)?\)/g;
    let match;
    while ((match = linkPattern.exec(markdown))) {
      const target = match[1];
      const anchor = match[2] || '';
      if (/^[a-z][a-z\d+.-]*:/i.test(target)) continue; // external URL
      const key = `${file} -> ${target}${anchor}`;
      if (checked.has(key)) continue;
      checked.add(key);

      const name = path.basename(target);
      const servedSlug = byFile.get(name) || byFile.get(`product/${name}`);
      if (servedSlug) {
        const targetPath = path.join(root, 'docs', isProduct ? 'product' : 'api', name);
        const targetMarkdown = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;
        if (!targetMarkdown) {
          problems.push(`${key}: served guide ${name} is not readable at ${path.relative(root, targetPath)}`);
        } else if (anchor && !headingIds(targetMarkdown).has(decode(anchor.slice(1)))) {
          problems.push(`${key}: anchor #${decode(anchor.slice(1))} does not exist in ${name}`);
        }
        continue;
      }

      const resolved = path.resolve(apiDir, target);
      if (!fs.existsSync(resolved)) {
        problems.push(`${key}: repository file does not exist (${path.relative(root, resolved)})`);
        continue;
      }
      if (anchor) {
        const targetMarkdown = fs.readFileSync(resolved, 'utf8');
        if (!headingIds(targetMarkdown).has(decode(anchor.slice(1)))) {
          problems.push(`${key}: anchor #${decode(anchor.slice(1))} does not exist in ${target}`);
        }
      }
    }
  }

  if (problems.length) {
    console.error('Documentation link check failed:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log(`Documentation link check passed (${checked.size} links across ${servedFiles.length} runtime guides).`);
}

main();
