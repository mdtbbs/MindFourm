import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MultiplayerV1Controller } from './multiplayer-v1.controller';
import {
  CreateMultiplayerSessionDto, ListMultiplayerSessionsDto, ModSyncPlanDto,
} from './dto/multiplayer.dto';

const options = { whitelist: true, forbidNonWhitelisted: true };
const HASH = 'a'.repeat(64);

describe('Multiplayer mod-sync contract', () => {
  it('delegates the mod sync plan to the service with the authenticated user and request context', async () => {
    const multiplayer: any = { createModSyncPlan: jest.fn().mockResolvedValue({ status: 'ready' }) };
    const controller = new MultiplayerV1Controller(multiplayer);
    const request = { user: { id: 7 }, headers: { 'user-agent': 'test' } };
    const body = { installed_mods: [{ mod_id: 'flood-driver', sha256: HASH }] };

    await controller.modSyncPlan('ses_AbCdEf0123456789_-wxyz', body as ModSyncPlanDto, request);

    expect(multiplayer.createModSyncPlan).toHaveBeenCalledWith(7, 'ses_AbCdEf0123456789_-wxyz', body, request);
  });

  it('accepts up to 64 session mods and rejects 65', async () => {
    const mods = Array.from({ length: 64 }, (_, index) => ({ mod_id: `mod-${index}`, sha256: HASH }));
    expect(await validate(plainToInstance(CreateMultiplayerSessionDto, { game_id: 'mindustry', mods }, options), options)).toHaveLength(0);

    const tooMany = [...mods, { mod_id: 'mod-64' }];
    expect(await validate(plainToInstance(CreateMultiplayerSessionDto, { game_id: 'mindustry', mods: tooMany }, options), options)).not.toHaveLength(0);
  });

  it('rejects invalid SHA-256 and unknown nested fields', async () => {
    const invalidHash = { game_id: 'mindustry', mods: [{ mod_id: 'flood-driver', sha256: 'not-a-hash' }] };
    expect(await validate(plainToInstance(CreateMultiplayerSessionDto, invalidHash, options), options)).not.toHaveLength(0);

    const unknown = { game_id: 'mindustry', mods: [{ mod_id: 'flood-driver', download_url: '/leak' }] };
    expect(await validate(plainToInstance(CreateMultiplayerSessionDto, unknown, options), options)).not.toHaveLength(0);
  });

  it('accepts a Pack ref without a pinned version and rejects oversized ids', async () => {
    expect(await validate(plainToInstance(CreateMultiplayerSessionDto, {
      game_id: 'mindustry', mod_pack_ref: { pack_public_id: 'pack-public-id' },
    }, options), options)).toHaveLength(0);

    expect(await validate(plainToInstance(CreateMultiplayerSessionDto, {
      game_id: 'mindustry', mod_pack_ref: { pack_public_id: 'x'.repeat(37) },
    }, options), options)).not.toHaveLength(0);
  });

  it('parses the lobby mod filters, including query-string booleans', async () => {
    const query = await plainToInstance(ListMultiplayerSessionsDto, { modded: 'false', mod_id: 'flood-driver', pack_public_id: 'pack' }, { enableImplicitConversion: true });
    expect(await validate(query, options)).toHaveLength(0);
    expect(query.modded).toBe(false);

    const enabled = await plainToInstance(ListMultiplayerSessionsDto, { modded: 'true' }, { enableImplicitConversion: true });
    expect(enabled.modded).toBe(true);
  });

  it('bounds the installed mod list to 128 entries', async () => {
    const installed = Array.from({ length: 128 }, (_, index) => ({ mod_id: `mod-${index}` }));
    expect(await validate(plainToInstance(ModSyncPlanDto, { installed_mods: installed }, options), options)).toHaveLength(0);
    expect(await validate(plainToInstance(ModSyncPlanDto, {
      installed_mods: [...installed, { mod_id: 'mod-128' }],
    }, options), options)).not.toHaveLength(0);
  });
});
