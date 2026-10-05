import { ApiProperty } from '@nestjs/swagger';

export class ResourceV2ReportAttachmentDto {
  @ApiProperty({ format: 'uuid', example: 'b4b728b7-73a5-4bd6-b2a6-9009d60d6b8f' }) public_id!: string;
  @ApiProperty({ enum: ['log', 'image'], example: 'image' }) kind!: 'log' | 'image';
  @ApiProperty({ maxLength: 255, example: 'crash-report.png' }) name!: string;
  @ApiProperty({ minimum: 1, maximum: 5 * 1024 * 1024, example: 24576 }) size_bytes!: number;
  @ApiProperty({ enum: ['text/plain', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'], example: 'image/png' }) mime_type!: string;
  @ApiProperty({ pattern: '^[0-9a-f]{64}$', example: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }) sha256!: string;
  @ApiProperty({ format: 'date-time', example: '2026-10-05T10:00:00.000Z' }) created_at!: string;
  @ApiProperty({ format: 'uri-reference', example: '/api/v1/resources/mods/issue-reports/30000000-0000-4000-8000-000000000001/attachments/b4b728b7-73a5-4bd6-b2a6-9009d60d6b8f', description: 'Private authenticated download route; never a public storage URL.' }) download_url!: string;
  @ApiProperty({ description: 'True only for the report author, who may delete this attachment.' }) can_delete!: boolean;
}

export class ResourceV2ReportAttachmentListDto {
  @ApiProperty({ type: [ResourceV2ReportAttachmentDto] }) items!: ResourceV2ReportAttachmentDto[];
  @ApiProperty({ example: 10 }) max_attachments!: number;
  @ApiProperty({ example: 5 * 1024 * 1024 }) max_file_size_bytes!: number;
  @ApiProperty({ example: 20 * 1024 * 1024 }) max_total_size_bytes!: number;
}

export class ResourceV2ReportAttachmentDeleteDto {
  @ApiProperty({ format: 'uuid' }) public_id!: string;
  @ApiProperty({ example: true }) deleted!: boolean;
}
