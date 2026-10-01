import { Body, Controller, Post, Req } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OptionalAuth } from '@common/decorators/public.decorator';
import { OAuthOptionalProtected } from '@common/decorators/oauth-protected.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { FeedbackService } from './feedback.service';

class CreateFeedbackV1Dto {
  @ApiProperty({ enum: ['bug', 'suggestion', 'other'], example: 'bug', description: '反馈类型。' })
  @IsIn(['bug', 'suggestion', 'other']) type: string;
  @ApiProperty({ maxLength: 255, example: '无法打开资源页面', description: '反馈标题。' })
  @IsString() @MaxLength(255) title: string;
  @ApiProperty({ maxLength: 10000, example: '请描述复现步骤和预期结果。', description: '反馈详情。' })
  @IsString() @MaxLength(10000) description: string;
  @ApiPropertyOptional({ maxLength: 254, example: 'player@example.com', description: '可选联系邮箱。' })
  @IsOptional() @IsString() @MaxLength(254) contact_email?: string;
}

@ApiV1()
@ApiTags('v1-feedback')
@Controller('v1/feedback')
export class FeedbackV1Controller {
  constructor(private readonly feedback: FeedbackService) {}
  @Post()
  @OptionalAuth()
  @SkipPhoneVerification()
  @OAuthOptionalProtected('forum.write')
  @RateLimit({ max: 5, window: 60 * 60 })
  submit(@Body() dto: CreateFeedbackV1Dto, @Req() req: any) {
    return this.feedback.create({ type: dto.type, title: dto.title, description: dto.description, contactEmail: dto.contact_email, userId: req.user?.id ?? null });
  }
}
