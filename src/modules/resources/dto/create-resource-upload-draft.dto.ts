import { IsIn } from 'class-validator';

export class CreateResourceUploadDraftDto {
  @IsIn(['mod', 'map', 'schematic', 'save', 'game_version', 'server_plugin', 'development_tool', 'texture_ui', 'other'])
  resource_kind: string;
}
