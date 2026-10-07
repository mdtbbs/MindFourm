import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ResourceV2ExportSchematicDto } from './resources-v2-write.dto';

describe('ResourceV2ExportSchematicDto config matrix', () => {
  it('preserves the x/y-only shape for typed point and vector arrays', async () => {
    const input = plainToInstance(ResourceV2ExportSchematicDto, {
      rotation_quarters: 0,
      mirror_x: false,
      config_edits: [
        { x: 2, y: 3, config: { type: 'point_array', points: [{ x: -1, y: 0 }, { x: 2, y: -2 }] } },
        { x: 4, y: 5, config: { type: 'vec2_array', points: [{ x: 1.5, y: 2 }, { x: 127, y: 0 }] } },
      ],
    }, { enableImplicitConversion: true });

    expect(input.config_edits?.[0].config).toMatchObject({
      type: 'point_array',
      points: [{ x: -1, y: 0 }, { x: 2, y: -2 }],
    });
    expect(input.config_edits?.[1].config).toMatchObject({
      type: 'vec2_array',
      points: [{ x: 1.5, y: 2 }, { x: 127, y: 0 }],
    });
    expect(JSON.stringify(input.config_edits)).not.toContain('"type":"point"');
    expect(JSON.stringify(input.config_edits)).not.toContain('"type":"vec2"');
    await expect(validate(input, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('rejects values outside the typed DTO numeric and color constraints', async () => {
    const input = plainToInstance(ResourceV2ExportSchematicDto, {
      rotation_quarters: 0,
      mirror_x: false,
      config_edits: [
        { x: 2, y: 3, config: { type: 'vec2_array', points: [{ x: -1, y: 0 }] } },
        { x: 4, y: 5, config: { type: 'float', value: 1_000_001 } },
        { x: 6, y: 7, config: { type: 'color', value: '#bad' } },
      ],
    }, { enableImplicitConversion: true });

    expect(await validate(input, { whitelist: true, forbidNonWhitelisted: true })).not.toEqual([]);
  });
});
