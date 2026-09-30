import { ApiExtraModels, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ApiExtraModels()
export class TiptapMarkDto {
  @ApiProperty({ enum: ['bold', 'italic', 'strike', 'underline', 'code', 'link', 'textColor', 'highlight', 'fontSize', 'fontFamily', 'superscript', 'subscript'] })
  type: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Attributes are strictly validated per mark. Color accepts canonical HEX; highlight, font size, and font family use fixed enums.' })
  attrs?: Record<string, unknown>;
}

@ApiExtraModels(TiptapMarkDto)
export class TiptapNodeDto {
  @ApiProperty({ enum: ['doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'codeBlock', 'horizontalRule', 'table', 'tableRow', 'tableHeader', 'tableCell', 'text', 'hardBreak', 'image', 'spoiler', 'mention', 'customEmoji', 'video', 'attachment', 'postQuote', 'replyQuote'] })
  type: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Only attributes defined by the named node type are accepted. v2 includes bounded image dimensions, list tight flags, task state, safe table alignment, spoiler state, mention IDs, emoji IDs, configured videos, attachment references, and quote IDs.' })
  attrs?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'string', description: 'Text for a text node.' })
  text?: string;

  @ApiPropertyOptional({ type: () => [TiptapNodeDto], description: 'Child nodes in Rich Content Schema v2. Unknown nodes and attrs are rejected with a path-specific error.' })
  content?: TiptapNodeDto[];

  @ApiPropertyOptional({ type: () => [TiptapMarkDto] })
  marks?: TiptapMarkDto[];
}

@ApiExtraModels(TiptapNodeDto, TiptapMarkDto)
export class TiptapDocumentDto {
  @ApiProperty({ enum: ['doc'] })
  type: 'doc';

  @ApiProperty({ type: () => [TiptapNodeDto], description: 'Canonical Rich Content Schema v2 document. Markdown is a compatibility/search projection, not the source of truth.' })
  content: TiptapNodeDto[];
}
