import AppDataSource from '../database/data-source';
import { extractTiptapText, markdownToTiptapDocument, renderTiptapDocument } from '../common/utils/tiptap-content.util';

const BATCH_SIZE = 250;

async function backfillTable(tableName: 'posts' | 'replies' | 'resources'): Promise<number[]> {
  let lastId = 0;
  let updated = 0;
  let failed = 0;
  const failedIds: number[] = [];
  for (;;) {
    const rows: Array<{ id: number; content: string }> = await AppDataSource.query(
      `SELECT id, content FROM ${tableName} WHERE id > ? AND content_json IS NULL AND content IS NOT NULL ORDER BY id ASC LIMIT ${BATCH_SIZE}`,
      [lastId],
    );
    if (!rows.length) break;
    for (const row of rows) {
      lastId = row.id;
      try {
        const document = markdownToTiptapDocument(row.content || '');
        const contentHtml = renderTiptapDocument(document);
        const contentText = extractTiptapText(document);
        await AppDataSource.query(
          `UPDATE ${tableName} SET content_json = ?, content_html = ?, content_text = ? WHERE id = ? AND content_json IS NULL`,
          [JSON.stringify(document), contentHtml, contentText, row.id],
        );
        updated += 1;
      } catch (error) {
        // Continue the bounded keyset scan so every malformed row is discoverable.
        // Never include user content in logs; operators can repair IDs and rerun.
        failed += 1;
        failedIds.push(row.id);
      }
    }
    console.info(`[content-json] ${tableName}: migrated ${updated}, failed ${failed}, through id ${lastId}`);
  }
  console.info(`[content-json] ${tableName}: complete (${updated} migrated, ${failed} failed)`);
  return failedIds;
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    const failedPosts = await backfillTable('posts');
    const failedReplies = await backfillTable('replies');
    const failedResources = await backfillTable('resources');
    if (failedPosts.length || failedReplies.length || failedResources.length) {
      const details = [
        failedPosts.length ? `posts=[${failedPosts.join(',')}]` : '',
        failedReplies.length ? `replies=[${failedReplies.join(',')}]` : '',
        failedResources.length ? `resources=[${failedResources.join(',')}]` : '',
      ].filter(Boolean).join(' ');
      throw new Error(`Markdown to Tiptap conversion failed: ${details}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(`[content-json] ${error.message}`);
  process.exitCode = 1;
});
