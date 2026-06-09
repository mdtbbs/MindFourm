import { IsNumber } from 'class-validator';

export class LinkPostServerDto {
  @IsNumber()
  postId: number;

  @IsNumber()
  serverId: number;
}