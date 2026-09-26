import { ApiExtraModels, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ApiExtraModels()
export class TiptapMarkDto {
  @ApiProperty({ enum: ['bold', 'italic', 'strike', 'underline', 'code', 'link'] })
  type: 'bold' | 'italic' | 'strike' | 'underline' | 'code' | 'link';

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Link marks accept href and optional title.' })
  attrs?: Record<string, unknown>;
}

@ApiExtraModels(TiptapMarkDto)
export class TiptapNodeDto {
  @ApiProperty({ enum: ['doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'horizontalRule', 'table', 'tableRow', 'tableHeader', 'tableCell', 'text', 'hardBreak', 'image'] })
  type: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'Only attributes defined by the named node type are accepted.' })
  attrs?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'string', description: 'Text for a text node.' })
  text?: string;

  @ApiPropertyOptional({ type: () => [TiptapNodeDto], description: 'Child nodes in the allowlisted Tiptap schema.' })
  content?: TiptapNodeDto[];

  @ApiPropertyOptional({ type: () => [TiptapMarkDto] })
  marks?: TiptapMarkDto[];
}

@ApiExtraModels(TiptapNodeDto, TiptapMarkDto)
export class TiptapDocumentDto {
  @ApiProperty({ enum: ['doc'] })
  type: 'doc';

  @ApiProperty({ type: () => [TiptapNodeDto], description: 'Root blocks; recursive node schema is bounded and validated by MindFourm.' })
  content: TiptapNodeDto[];
}
