import {
  Controller,
  Post,
  Body,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { Public } from '@common/decorators/public.decorator';
import { OptionalAuth } from '@common/decorators/public.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { SkipPhoneVerification } from '@common/decorators/skip-phone-verification.decorator';

interface FeedbackBody {
  type?: unknown;
  title?: unknown;
  description?: unknown;
  contact_email?: unknown;
}

@Controller('feedback')
@Public()
@OptionalAuth()
@SkipPhoneVerification()
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @RateLimit({ max: 5, window: 60 * 60 })
  async submit(@Body() body: FeedbackBody, @Req() req: any) {
    if (
      typeof body.type !== 'string' ||
      typeof body.title !== 'string' ||
      typeof body.description !== 'string'
    ) {
      throw new BadRequestException('missing required fields');
    }
    if (body.contact_email !== undefined && typeof body.contact_email !== 'string') {
      throw new BadRequestException('invalid contact_email');
    }

    const userId = req.user?.id ?? null;

    return this.feedbackService.create({
      type: body.type,
      title: body.title,
      description: body.description,
      contactEmail: typeof body.contact_email === 'string' ? body.contact_email : undefined,
      userId,
    });
  }
}
