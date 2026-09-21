import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Input accepted by the private map/blueprint preflight endpoint. */
export class CreateResourcePreviewDraftDto {
  @IsIn(['map', 'schematic'])
  resource_kind: 'map' | 'schematic';

  /** Mindustry clipboard schematic code; files use the multipart `file` field. */
  @IsOptional()
  @IsString()
  @MaxLength(28 * 1024 * 1024)
  schematic_code?: string;
}
