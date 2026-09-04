import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiTags } from '@nestjs/swagger';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { OptionalAuth } from '@common/decorators/public.decorator';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';
import { FeedbackService } from './feedback.service';

class CreateFeedbackV1Dto {
  @IsIn(['bug', 'suggestion', 'other']) type: string;
  @IsString() @MaxLength(255) title: string;
  @IsString() @MaxLength(10000) description: string;
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
  @UseGuards(JwtAuthGuard)
  @RateLimit({ max: 5, window: 60 * 60 })
  submit(@Body() dto: CreateFeedbackV1Dto, @Req() req: any) {
    return this.feedback.create({ type: dto.type, title: dto.title, description: dto.description, contactEmail: dto.contact_email, userId: req.user?.id ?? null });
  }
}
