import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddGroupChatMemberDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  user_id: number;

  @IsOptional()
  @IsIn(['member', 'admin'])
  role?: string;
}
