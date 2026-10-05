import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SearchIndexMaintenanceDto {
  @ApiProperty({ enum: ['reindex', 'rebuild', 'repair'], description: 'Rebuilds one allowlisted MySQL FULLTEXT index from its source table.' })
  @IsIn(['reindex', 'rebuild', 'repair'])
  action: 'reindex' | 'rebuild' | 'repair';
}
