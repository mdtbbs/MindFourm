import { IsOptional, IsString } from 'class-validator';
import { QueryPostsDto } from '../../posts/dto/query-posts.dto';

/** Keeps the published offset read mode valid while Android migrates to cursor. */
export class QueryThreadsV1Dto extends QueryPostsDto {
  @IsOptional() @IsString() offset?: string;
  @IsOptional() @IsString() expanded?: string;
}
