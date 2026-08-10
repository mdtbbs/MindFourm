import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Feedback } from '@entities/feedback.entity';

const ALLOWED_TYPES = ['bug', 'suggestion', 'other'] as const;

@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepo: Repository<Feedback>,
  ) {}

  async create(data: {
    type: string;
    title: string;
    description: string;
    contactEmail?: string;
    userId?: number | null;
  }): Promise<Feedback> {
    if (!ALLOWED_TYPES.includes(data.type as any)) {
      throw new BadRequestException('invalid feedback type');
    }
    const title = data.title.trim();
    const description = data.description.trim();
    if (!title || title.length > 255) {
      throw new BadRequestException('invalid title');
    }
    if (!description || description.length > 10000) {
      throw new BadRequestException('invalid description');
    }

    const feedback = this.feedbackRepo.create({
      type: data.type,
      title,
      description,
      contact_email: data.contactEmail || null,
      user_id: data.userId ?? null,
      status: 'pending',
    });
    return this.feedbackRepo.save(feedback);
  }
}
