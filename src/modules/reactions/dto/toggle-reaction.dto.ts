import { IsIn, IsString } from 'class-validator';
import { REACTION_EMOJIS } from '../reaction-emojis';

export class ToggleReactionDto {
  // Duplicated in the service on purpose: the DTO only guards the HTTP edge, and the
  // whitelist has to hold for any caller of `toggle`.
  @IsString()
  @IsIn(REACTION_EMOJIS as readonly string[])
  emoji: string;
}
