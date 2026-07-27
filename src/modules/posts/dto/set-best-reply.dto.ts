import { IsInt, Min, ValidateIf } from 'class-validator';

export class SetBestReplyDto {
  /**
   * The reply to accept, or an explicit `null` to clear the mark.
   *
   * `@ValidateIf` rather than `@IsOptional()`: the latter skips validation for
   * `undefined` as well as `null`, which would turn a request that simply forgot the
   * field into "unmark the accepted answer". Here `null` passes and a missing field
   * fails `@IsInt`, so clearing the mark has to be asked for.
   */
  @ValidateIf((dto: SetBestReplyDto) => dto.reply_id !== null)
  @IsInt()
  @Min(1)
  reply_id: number | null;
}
