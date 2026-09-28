import { ApiV1Exception } from '../../common/exceptions/api-v1.exception';
import { RedisService } from '../../database/redis.service';
import { CommunityChallengeService } from './community-challenge.service';

function createService(provider: string, environment = 'development', extra: Record<string, unknown> = {}) {
  const configValues: Record<string, unknown> = {
    'communityChallenge.provider': provider,
    'app.env': environment,
    ...extra,
  };
  const config = { get: (key: string) => configValues[key] };
  const settings = {
    getBoolean: jest.fn().mockResolvedValue(true),
    getNumber: jest.fn().mockResolvedValue(null),
  };
  const redis = new RedisService({ get: jest.fn() } as any);
  return { service: new CommunityChallengeService(config as any, settings as any, redis), redis, settings };
}

function challengeDetails(error: ApiV1Exception) {
  const response = error.getResponse() as { details: Array<{ challenge: { token: string; left?: number; right?: number; action: string; provider: string } }> };
  return response.details[0].challenge;
}

describe('CommunityChallengeService', () => {
  const repeatedPost = 'A repeated discussion body that is long enough for the duplicate risk rule.';

  it('leaves ordinary requests alone when the provider is disabled', async () => {
    const { service, settings } = createService('disabled');
    await expect(service.enforceContentAction({ action: 'forum.post.create', text: repeatedPost, actorId: 7 })).resolves.toBeUndefined();
    expect(settings.getBoolean).not.toHaveBeenCalled();
  });

  it('issues an action-bound development ticket and consumes it exactly once', async () => {
    const { service } = createService('development');
    await service.enforceContentAction({ action: 'forum.post.create', text: repeatedPost, actorId: 7 });
    let required: ApiV1Exception | undefined;
    try {
      await service.enforceContentAction({ action: 'forum.post.create', text: repeatedPost, actorId: 7 });
    } catch (error) { required = error as ApiV1Exception; }
    expect(required?.code).toBe('CHALLENGE_REQUIRED');
    const challenge = challengeDetails(required!);
    expect(challenge.action).toBe('forum.post.create');
    expect(challenge.provider).toBe('development');
    const proof = { token: challenge.token, response: String((challenge.left || 0) + (challenge.right || 0)) };
    await expect(service.enforceContentAction({ action: 'forum.post.create', text: repeatedPost, actorId: 7, proof })).resolves.toBeUndefined();
    await expect(service.enforceContentAction({ action: 'forum.post.create', text: repeatedPost, actorId: 7, proof }))
      .rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' });
  });

  it('rejects a ticket when the action or actor does not match', async () => {
    const { service } = createService('development');
    await service.enforceContentAction({ action: 'forum.post.create', text: repeatedPost, actorId: 7 });
    let required: ApiV1Exception | undefined;
    try { await service.enforceContentAction({ action: 'forum.post.create', text: repeatedPost, actorId: 7 }); }
    catch (error) { required = error as ApiV1Exception; }
    const challenge = challengeDetails(required!);
    await expect(service.enforceContentAction({ action: 'forum.reply.create', text: 'reply', actorId: 7,
      proof: { token: challenge.token, response: String((challenge.left || 0) + (challenge.right || 0)) } }))
      .rejects.toMatchObject({ code: 'CHALLENGE_INVALID' });
  });

  it('rejects the development provider in production', () => {
    expect(() => createService('development', 'production')).toThrow(/cannot run in production/i);
  });

  it('returns only a public site key for Turnstile challenges', async () => {
    const { service } = createService('turnstile', 'production', {
      'communityChallenge.turnstile.siteKey': 'public-site-key',
      'communityChallenge.turnstile.secretKey': 'server-only-secret',
    });
    const links = 'https://one.test https://two.test https://three.test https://four.test';
    let required: ApiV1Exception | undefined;
    try { await service.enforceContentAction({ action: 'forum.post.create', text: links, actorId: 11 }); }
    catch (error) { required = error as ApiV1Exception; }
    expect(required?.code).toBe('CHALLENGE_REQUIRED');
    const challenge = challengeDetails(required!);
    expect(challenge).toMatchObject({ provider: 'turnstile', site_key: 'public-site-key' });
    expect(JSON.stringify(challenge)).not.toContain('server-only-secret');
  });
});
