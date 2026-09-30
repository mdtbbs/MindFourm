# Rich Content Schema v2

New clients should write `content_schema_version: 2` and `content_json`. The JSON document is canonical; `content` Markdown is retained as a compatibility, search, notification, RSS, summary, and plain-text projection. Markdown-only legacy requests are converted to a v2 document by the server.

```json
{
  "content_schema_version": 2,
  "content_json": {
    "type": "doc",
    "content": [
      { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "Heading" }] },
      { "type": "paragraph", "content": [{ "type": "text", "text": "Important", "marks": [{ "type": "bold" }] }] },
      { "type": "bulletList", "attrs": { "tight": true }, "content": [{ "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Item" }] }] }] }
    ]
  }
}
```

The v2 block nodes are `doc`, `paragraph`, `heading`, `blockquote`, `bulletList`, `orderedList`, `listItem`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`, `tableRow`, `tableHeader`, `tableCell`, `spoiler`, `video`, `attachment`, `postQuote`, and `replyQuote`. Inline nodes are `text`, `hardBreak`, `image`, `mention`, and `customEmoji`.

Marks are `bold`, `italic`, `strike`, `underline`, `code`, `link`, `textColor`, `highlight`, `fontSize`, `fontFamily`, `superscript`, and `subscript`. Color accepts only HEX and is canonicalized to uppercase `#RRGGBB` or `#RRGGBBAA`; highlights, font sizes, and font families use fixed values.

Attributes are allow-listed per node and mark. Unknown nodes, marks, attrs, invalid URLs, unsupported site video providers, and out-of-range values are rejected with a path-specific error. The error details contain the JSON path, node/mark, attribute, and schema version without an internal stack trace.

Resource descriptions use the same schema and reject `video`, `attachment`, `postQuote`, and `replyQuote`. Attachment nodes must refer to a draft token owned by the current user or an attachment already bound to the same parent; uploads remain quarantined and moderated. Mention nodes use a user ID, are limited to 20 unique IDs, and are canonicalized to the user's current username. Mention notifications are deduplicated and respect user blocks. Quotes persist IDs only and are visibility-checked on save and read.

Video providers are selected through the deployed site profile. MDTBBS enables Bilibili, Douyin, and HTTPS MP4/WebM; Mindustry Club enables YouTube, Bilibili, and HTTPS MP4/WebM. Third-party players are loaded only after a reader activates the card.

The database migration adds `content_schema_version`, converts legacy Markdown in bounded batches, creates the custom emoji table, and adds attachment draft lifecycle columns/indexes. It preserves valid JSON and leaves Markdown unchanged. Run the migration before enabling v2 writes on a deployment.
