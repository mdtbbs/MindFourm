import { Injectable } from '@nestjs/common';
import { SocialPolicyService } from '../social/social-policy.service';

@Injectable()
export class PresencePolicyService {
  constructor(private readonly socialPolicy: SocialPolicyService) {}

  settingsForMany(userIds: number[]) {
    return this.socialPolicy.settingsForMany(userIds);
  }

  canSeeMany(viewerId: number, targetIds: number[], key: 'presence_visibility' | 'activity_visibility') {
    return this.socialPolicy.canSeeMany(viewerId, targetIds, key);
  }

  canSeeFromManyViewers(targetId: number, viewerIds: number[], key: 'presence_visibility' | 'activity_visibility') {
    return this.socialPolicy.canSeeFromManyViewers(targetId, viewerIds, key);
  }
}
