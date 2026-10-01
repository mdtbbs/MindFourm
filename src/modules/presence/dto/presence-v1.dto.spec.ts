import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePresenceConnectionDto } from './presence-v1.dto';

describe('CreatePresenceConnectionDto', () => {
  it('accepts the first-party Mindustry Mod platform identifier', async () => {
    const dto = plainToInstance(CreatePresenceConnectionDto, { platform: 'mindustry_mod' });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects unknown platform identifiers', async () => {
    const dto = plainToInstance(CreatePresenceConnectionDto, { platform: 'unknown_client' });

    expect(await validate(dto)).toHaveLength(1);
  });
});
