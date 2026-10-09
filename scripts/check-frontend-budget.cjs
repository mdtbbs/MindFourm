#!/usr/bin/env node
/**
 * First-load budget for the JavaScript every page ships before it renders.
 *
 * Why this exists: a code block on a post or resource page used to drag
 * `lowlight/common` (highlight.js grammars, ~167 KB minified) onto that page's
 * initial load through a single module-scope `import`. Nothing in CI noticed —
 * the build stayed green, lint stayed green, and the only symptom was a slower
 * page. This check turns the route-level chunk list into a number that CI can
 * fail on, using Next.js's own build manifests so it measures what a browser
 * actually downloads.
 *
 * The budgets below are headroom, not targets. Raise them deliberately, in a
 * commit that says why.
 *
 * Usage: npm run check:frontend-budget   (must run after `next build`)
 */
const fs = require('fs');
const path = require('path');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const NEXT_DIR = path.join(FRONTEND, '.next');

/** Routes whose initial JS is budgeted, in KB (minified, before gzip). */
const ROUTE_BUDGETS_KB = {
  '/(public)/layout': 1300, // the shell: React, router, i18n catalogs, header, sidebar
  '/(public)/posts/[id]/page': 200, // content page on top of the shell
  '/(public)/resources/[id]/page': 150,
};

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sizeKb(relativeFile) {
  return fs.statSync(path.join(NEXT_DIR, relativeFile)).size / 1024;
}

function chunksFor(manifest, page, layoutChunks) {
  const files = manifest.pages[page];
  if (!files) {
    console.error(`[budget] No build manifest entry for ${page}. Did the route move?`);
    process.exit(1);
  }
  // Routes inherit the layout's chunks; counting them again would double the shell.
  return files.filter((file) => !layoutChunks.has(file));
}

function main() {
  const appManifestPath = path.join(NEXT_DIR, 'app-build-manifest.json');
  if (!fs.existsSync(appManifestPath)) {
    console.error('[budget] frontend/.next/app-build-manifest.json is missing. Run `npm run build` first.');
    process.exit(1);
  }

  const manifest = readJson(appManifestPath);
  // The root layout's chunks are the true baseline: React, the router, and every
  // provider in app/layout.tsx. `/(public)/layout` adds the header, sidebar and
  // footer on top of it, and its own budget covers that shell.
  const rootChunks = new Set(manifest.pages['/layout'] || []);
  const publicLayoutChunks = new Set(manifest.pages['/(public)/layout'] || []);
  const failures = [];

  for (const [page, budgetKb] of Object.entries(ROUTE_BUDGETS_KB)) {
    // Route budgets exclude the shell; the shell budget is measured against the
    // root layout instead, so it reports the real provider/framework weight.
    const chunks = chunksFor(
      manifest,
      page,
      page === '/(public)/layout' ? rootChunks : publicLayoutChunks,
    );
    const totalKb = chunks.reduce((sum, file) => sum + sizeKb(file), 0);
    const label = page === '/(public)/layout' ? 'site shell (layout + /_app)' : `shell + ${page}`;
    const status = totalKb > budgetKb ? 'FAIL' : 'ok';
    console.log(`[budget] ${status}  ${label}: ${totalKb.toFixed(1)} KB / ${budgetKb} KB`);
    if (totalKb > budgetKb) {
      failures.push({ label, totalKb, budgetKb, chunks });
    }
  }

  if (failures.length) {
    console.error('');
    for (const failure of failures) {
      console.error(`[budget] ${failure.label} exceeds its budget by ${(failure.totalKb - failure.budgetKb).toFixed(1)} KB.`);
      const sorted = failure.chunks
        .map((file) => [file, sizeKb(file)])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      console.error('[budget] Largest chunks pulled in by this route:');
      for (const [file, kb] of sorted) console.error(`  ${kb.toFixed(1).padStart(7)} KB  ${file}`);
      console.error('[budget] Move the library behind `next/dynamic`/`import()` if the page rarely needs it,');
      console.error('[budget] or raise the budget in ROUTE_BUDGETS_KB with a reason.');
      console.error('');
    }
    process.exit(1);
  }

  console.log('[budget] All first-load budgets are within limits.');
}

main();
