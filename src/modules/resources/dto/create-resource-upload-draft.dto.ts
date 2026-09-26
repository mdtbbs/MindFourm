import { IsIn } from 'class-validator';
import { RESOURCE_KIND_VALUES } from '../resource-kind-registry';

export class CreateResourceUploadDraftDto {
  @IsIn(RESOURCE_KIND_VALUES)
  resource_kind: string;
}
