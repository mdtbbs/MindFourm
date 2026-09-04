import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ServiceAccountSelectorDto } from './service-account-selector.dto';

export class ServiceCreateReplyDto extends ServiceAccountSelectorDto {
  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsNumber()
  parent_reply_id?: number;
}
