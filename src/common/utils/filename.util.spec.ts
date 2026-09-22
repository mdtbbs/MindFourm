import { repairMojibakeFilename } from './filename.util';

describe('repairMojibakeFilename', () => {
  it('repairs UTF-8 filenames decoded as Latin-1', () => {
    const mojibake = Buffer.from('(双科)热量-2联钍热.msch', 'utf8').toString('latin1');
    expect(repairMojibakeFilename(mojibake))
      .toBe('(双科)热量-2联钍热.msch');
  });

  it('keeps normal Unicode and genuine Latin-1 filenames unchanged', () => {
    expect(repairMojibakeFilename('测试 地图.zip')).toBe('测试 地图.zip');
    expect(repairMojibakeFilename('café.zip')).toBe('café.zip');
  });
});
