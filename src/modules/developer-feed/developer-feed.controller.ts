import { Body, Controller, ForbiddenException, Get, Headers, Post, Query, Req } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ApiV1 } from '@common/decorators/api-v1.decorator';
import { Public } from '@common/decorators/public.decorator';
import { DeveloperFeedService } from './developer-feed.service';
@ApiV1() @Public() @Controller('v1/developer-feed')
export class DeveloperFeedController { constructor(private readonly feed: DeveloperFeedService) {} @Get() list(@Query('limit') limit?: string) { return this.feed.list(Number(limit) || 30); }
  @Post('github') async github(@Body() body: any, @Headers('x-hub-signature-256') signature: string, @Req() req: any) { const secret = process.env.GITHUB_WEBHOOK_SECRET; const expected = secret ? `sha256=${createHmac('sha256', secret).update(req.rawBody || '').digest('hex')}` : ''; if (!secret || signature !== expected) throw new ForbiddenException('Invalid GitHub signature'); const pr = body.pull_request; const issue = pr || body.issue; return this.feed.upsertGithub({ repository: body.repository?.full_name, itemType: pr ? 'pull_request' : 'issue', externalId: String(issue?.number), state: pr?.merged ? 'merged' : issue?.state, title: issue?.title, url: issue?.html_url, author: { login: issue?.user?.login, name: issue?.user?.login, avatarUrl: issue?.user?.avatar_url }, openedAt: issue?.created_at ? new Date(issue.created_at) : undefined, closedAt: issue?.closed_at ? new Date(issue.closed_at) : undefined, mergedAt: pr?.merged_at ? new Date(pr.merged_at) : undefined }); } }
