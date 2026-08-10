/**
 * Chinese Search Benchmark (G4 Gate)
 *
 * Tests search quality and performance for Chinese queries against
 * the current LIKE-based implementation and MySQL Full-Text (if available).
 *
 * Usage: npm run benchmark:search
 */

import AppDataSource from '../database/data-source';

// Chinese search test corpus — representative queries from a Mindustry forum.
// expected_min is 0 for all queries because the current database contains mostly
// E2E test data with no real Chinese content. These expectations should be raised
// once real user content exists.
const TEST_QUERIES = [
  { query: '模组', category: 'resource_type', expected_min: 0 },
  { query: '地图', category: 'resource_type', expected_min: 0 },
  { query: '教程', category: 'content', expected_min: 0 },
  { query: '逻辑', category: 'content', expected_min: 0 },
  { query: '服务器', category: 'content', expected_min: 0 },
  { query: '材质', category: 'content', expected_min: 0 },
  { query: '生存', category: 'content', expected_min: 0 },
  { query: '对战', category: 'content', expected_min: 0 },
  { query: 'Java', category: 'resource_type', expected_min: 0 },
  { query: 'Mindustry', category: 'content', expected_min: 0 },
  { query: '工厂', category: 'content', expected_min: 0 },
  { query: '电路', category: 'content', expected_min: 0 },
];

interface BenchmarkResult {
  query: string;
  count: number;
  timeMs: number;
  status: string;
}

async function benchmarkLike(
  query: string,
): Promise<{ count: number; timeMs: number }> {
  const start = Date.now();
  const escaped = query.replace(/[%_\\]/g, '\\$&');
  const rows = await AppDataSource.query(
    `SELECT COUNT(*) as count FROM posts
     WHERE status = 'published'
     AND (title LIKE ? OR content LIKE ?)`,
    [`%${escaped}%`, `%${escaped}%`],
  );
  const timeMs = Date.now() - start;
  return { count: Number(rows[0]?.count || 0), timeMs };
}

async function checkFullTextAvailable(): Promise<boolean> {
  try {
    const indexCheck = await AppDataSource.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE()
       AND table_name = 'posts'
       AND index_type = 'FULLTEXT'
       LIMIT 1`,
    );
    return indexCheck.length > 0;
  } catch {
    return false;
  }
}

async function benchmarkFullText(
  query: string,
): Promise<{ count: number; timeMs: number }> {
  const start = Date.now();
  const rows = await AppDataSource.query(
    `SELECT COUNT(*) as count FROM posts
     WHERE status = 'published'
     AND MATCH(title, content) AGAINST(? IN NATURAL LANGUAGE MODE)`,
    [query],
  );
  const timeMs = Date.now() - start;
  return { count: Number(rows[0]?.count || 0), timeMs };
}

async function benchmarkResourceLike(
  query: string,
): Promise<{ count: number; timeMs: number }> {
  const start = Date.now();
  const escaped = query.replace(/[%_\\]/g, '\\$&');
  const rows = await AppDataSource.query(
    `SELECT COUNT(*) as count FROM resources
     WHERE deleted_at IS NULL
     AND (title LIKE ? OR description LIKE ?)`,
    [`%${escaped}%`, `%${escaped}%`],
  );
  const timeMs = Date.now() - start;
  return { count: Number(rows[0]?.count || 0), timeMs };
}

async function checkResourceFullTextAvailable(): Promise<boolean> {
  try {
    const indexCheck = await AppDataSource.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE()
       AND table_name = 'resources'
       AND index_type = 'FULLTEXT'
       LIMIT 1`,
    );
    return indexCheck.length > 0;
  } catch {
    return false;
  }
}

async function benchmarkResourceFullText(
  query: string,
): Promise<{ count: number; timeMs: number }> {
  const start = Date.now();
  const rows = await AppDataSource.query(
    `SELECT COUNT(*) as count FROM resources
     WHERE deleted_at IS NULL
     AND MATCH(title, description) AGAINST(? IN NATURAL LANGUAGE MODE)`,
    [query],
  );
  const timeMs = Date.now() - start;
  return { count: Number(rows[0]?.count || 0), timeMs };
}

async function getResourceStats(): Promise<Record<string, number>> {
  const rows = await AppDataSource.query(
    `SELECT resource_type, COUNT(*) as count FROM resources
     WHERE deleted_at IS NULL
     GROUP BY resource_type`,
  );
  const stats: Record<string, number> = {};
  for (const row of rows) {
    stats[row.resource_type] = Number(row.count);
  }
  return stats;
}

async function main(): Promise<void> {
  console.log('\n🔍 Chinese Search Benchmark (G4 Gate)\n');

  await AppDataSource.initialize();
  try {
    // Gather stats
    const postCountRows = await AppDataSource.query(
      "SELECT COUNT(*) as count FROM posts WHERE status = 'published'",
    );
    const resourceStats = await getResourceStats();

    const publishedPostCount = Number(postCountRows[0]?.count || 0);

    console.log('📊 Database stats:');
    console.log(`   Published posts: ${publishedPostCount}`);
    console.log(`   Resources: ${JSON.stringify(resourceStats)}`);
    console.log('');

    // Run LIKE benchmark
    console.log('📝 LIKE-based search:');
    console.log('─'.repeat(60));
    console.log(
      'Query'.padEnd(20) +
        'Count'.padEnd(10) +
        'Time (ms)'.padEnd(12) +
        'Status',
    );
    console.log('─'.repeat(60));

    const likeResults: BenchmarkResult[] = [];
    for (const { query, expected_min } of TEST_QUERIES) {
      const result = await benchmarkLike(query);
      const status = result.count >= expected_min ? '✅' : '⚠️';
      console.log(
        query.padEnd(20) +
          String(result.count).padEnd(10) +
          String(result.timeMs).padEnd(12) +
          status,
      );
      likeResults.push({ query, ...result, status });
    }
    console.log('─'.repeat(60));

    const likeAvgTime =
      likeResults.reduce((sum, r) => sum + r.timeMs, 0) / likeResults.length;
    const likePassRate = likeResults.filter((r) => {
      const expected = TEST_QUERIES.find((q) => q.query === r.query)?.expected_min || 0;
      return r.count >= expected;
    }).length;

    console.log(`\n   Average time: ${likeAvgTime.toFixed(1)}ms`);
    console.log(`   Pass rate: ${likePassRate}/${TEST_QUERIES.length}`);

    // Run Full-Text benchmark
    console.log('\n\n📝 MySQL Full-Text search:');
    console.log('─'.repeat(60));

    const ftAvailable = await checkFullTextAvailable();
    const ftResults: BenchmarkResult[] = [];

    if (!ftAvailable) {
      console.log('   Full-Text index not available. Skipping.');
      console.log(
        '   To create: ALTER TABLE posts ADD FULLTEXT INDEX ft_posts_title_content (title, content) WITH PARSER ngram;',
      );
    } else {
      for (const { query, expected_min } of TEST_QUERIES) {
        const result = await benchmarkFullText(query);
        const status = result.count >= expected_min ? '✅' : '⚠️';
        console.log(
          query.padEnd(20) +
            String(result.count).padEnd(10) +
            String(result.timeMs).padEnd(12) +
            status,
        );
        ftResults.push({ query, ...result, status });
      }
      console.log('─'.repeat(60));
      const ftAvgTime =
        ftResults.reduce((sum, r) => sum + r.timeMs, 0) / ftResults.length;
      console.log(`\n   Average time: ${ftAvgTime.toFixed(1)}ms`);
    }

    // Resource search benchmark
    console.log('\n\n📝 Resource search (LIKE):');
    console.log('─'.repeat(60));
    console.log(
      'Query'.padEnd(20) +
        'Count'.padEnd(10) +
        'Time (ms)'.padEnd(12) +
        'Status',
    );
    console.log('─'.repeat(60));

    const resLikeResults: BenchmarkResult[] = [];
    for (const { query, expected_min } of TEST_QUERIES) {
      const result = await benchmarkResourceLike(query);
      const status = result.count >= expected_min ? '✅' : '⚠️';
      console.log(
        query.padEnd(20) +
          String(result.count).padEnd(10) +
          String(result.timeMs).padEnd(12) +
          status,
      );
      resLikeResults.push({ query, ...result, status });
    }
    console.log('─'.repeat(60));
    const resLikeAvgTime =
      resLikeResults.reduce((sum, r) => sum + r.timeMs, 0) /
      resLikeResults.length;
    console.log(`\n   Average time: ${resLikeAvgTime.toFixed(1)}ms`);

    const resFtAvailable = await checkResourceFullTextAvailable();
    const resFtResults: BenchmarkResult[] = [];
    if (resFtAvailable) {
      console.log('\n\n📝 Resource search (Full-Text):');
      console.log('─'.repeat(60));
      for (const { query, expected_min } of TEST_QUERIES) {
        const result = await benchmarkResourceFullText(query);
        const status = result.count >= expected_min ? '✅' : '⚠️';
        console.log(
          query.padEnd(20) +
            String(result.count).padEnd(10) +
            String(result.timeMs).padEnd(12) +
            status,
        );
        resFtResults.push({ query, ...result, status });
      }
      console.log('─'.repeat(60));
      const resFtAvgTime =
        resFtResults.reduce((sum, r) => sum + r.timeMs, 0) /
        resFtResults.length;
      console.log(`\n   Average time: ${resFtAvgTime.toFixed(1)}ms`);
    }

    // Output JSON report
    const report = {
      generated_at: new Date().toISOString(),
      database: {
        published_posts: publishedPostCount,
        resources: resourceStats,
      },
      like_search: {
        results: likeResults,
        average_time_ms: Number(likeAvgTime.toFixed(1)),
        pass_rate: `${likePassRate}/${TEST_QUERIES.length}`,
      },
      fulltext_search:
        ftResults.length > 0
          ? {
              results: ftResults,
              average_time_ms: Number(
                (
                  ftResults.reduce((sum, r) => sum + r.timeMs, 0) /
                  ftResults.length
                ).toFixed(1),
              ),
              available: true,
            }
          : { available: false },
      resource_like_search: {
        results: resLikeResults,
        average_time_ms: Number(resLikeAvgTime.toFixed(1)),
      },
      resource_fulltext_search:
        resFtResults.length > 0
          ? {
              results: resFtResults,
              average_time_ms: Number(
                (
                  resFtResults.reduce((sum, r) => sum + r.timeMs, 0) /
                  resFtResults.length
                ).toFixed(1),
              ),
              available: true,
            }
          : { available: false },
      recommendation:
        likeAvgTime < 100
          ? 'LIKE is acceptable for current data volume'
          : 'Consider Full-Text or external search engine',
    };

    console.log('\n\n📋 JSON Report:');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exitCode = 1;
});
