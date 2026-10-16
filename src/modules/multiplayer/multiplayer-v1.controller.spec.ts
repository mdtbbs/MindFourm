import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MultiplayerV1Controller } from './multiplayer-v1.controller';
import { CreateMultiplayerSessionDto, JoinMultiplayerSessionDto } from './dto/multiplayer.dto';

/**
 * Issue #96 requires the docs to promise that `client_id` is server-derived.
 * These tests pin that promise to the code: the controller reads it from the
 * authenticated OAuth context, and a body carrying one is rejected outright.
 */
describe('MultiplayerV1Controller client identity', () => {
  const build = () => {
    const multiplayer: any = {
      createSession: jest.fn().mockResolvedValue({}),
      createJoinRequest: jest.fn().mockResolvedValue({}),
      consumeJoinIntent: jest.fn().mockResolvedValue({}),
    };
    return { multiplayer, controller: new MultiplayerV1Controller(multiplayer) };
  };

  it('takes the OAuth client_id from the auth context, not from the request body', async () => {
    const { multiplayer, controller } = build();
    const request = { user: { id: 7 }, authContext: { source: 'mindauth_oauth', clientId: 'approved-app', partyType: 'third_party' } };
    const body = { game_id: 'mindustry', client_id: 'spoofed-app' } as CreateMultiplayerSessionDto;

    await controller.createSession(body, request);

    expect(multiplayer.createSession).toHaveBeenCalledWith(7, 'approved-app', body);
    expect(multiplayer.createSession).not.toHaveBeenCalledWith(7, 'spoofed-app', expect.anything());
  });

  it('falls back to the first-party client label only when no OAuth client is present', async () => {
    const { multiplayer, controller } = build();
    await controller.createSession({ game_id: 'mindustry' } as CreateMultiplayerSessionDto, { user: { id: 7 } });
    expect(multiplayer.createSession).toHaveBeenCalledWith(7, 'forum_web', expect.anything());
  });

  it('binds join requests and join intents to the authenticated OAuth client', async () => {
    const { multiplayer, controller } = build();
    const request = { user: { id: 7 }, authContext: { source: 'mindauth_oauth', clientId: 'approved-app', partyType: 'third_party' } };

    await controller.requestJoin('ses_AbCdEf0123456789_-wxyz', request);
    await controller.consumeJoinIntent('jnt_AbCdEf0123456789_-wxyz', {} as any, request);

    expect(multiplayer.createJoinRequest).toHaveBeenCalledWith(7, 'ses_AbCdEf0123456789_-wxyz', 'approved-app');
    expect(multiplayer.consumeJoinIntent).toHaveBeenCalledWith(7, 'approved-app', 'jnt_AbCdEf0123456789_-wxyz', undefined);
  });

  it.each([
    ['session', CreateMultiplayerSessionDto, { game_id: 'mindustry' }],
    ['join', JoinMultiplayerSessionDto, {}],
  ])('rejects an injected client_id on the %s request body', async (_name, type: any, valid: Record<string, unknown>) => {
    // Mirrors the global ValidationPipe options in `src/main.ts`.
    const options = { whitelist: true, forbidNonWhitelisted: true };
    const clean = await validate(plainToInstance(type, valid), options);
    expect(clean).toHaveLength(0);

    const injected = await validate(plainToInstance(type, { ...valid, client_id: 'spoofed-app' }), options);
    expect(injected.length).toBeGreaterThan(0);
  });
});
