import { ResourcesController } from './resources.controller';
import { ResourcesV1WriteController } from './v1/resources-v1-write.controller';
import { ResourcesV2Controller } from './v2/resources-v2.controller';

const response = () => ({ redirect: jest.fn(), setHeader: jest.fn(), send: jest.fn() });

describe('Resource preview delivery', () => {
  it.each([
    [ResourcesController, 'resourcePreviewService', 'getDraftPreview'],
    [ResourcesV1WriteController, 'previews', 'draftPreview'],
  ])('redirects owner-authorized drafts in %p without proxying PNG bytes', async (type, field, action) => {
    const controller = Object.create((type as any).prototype);
    const previews = { getDraftResPreviewUrl: jest.fn().mockResolvedValue('https://res.example/private/short-lived'), readDraftPreview: jest.fn() };
    Object.defineProperty(controller, field as string, { value: previews });
    const res = response();
    await controller[action as string]('draft-id', { user: { id: 17 } }, res);
    expect(previews.getDraftResPreviewUrl).toHaveBeenCalledWith(17, 'draft-id');
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://res.example/private/short-lived');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(previews.readDraftPreview).not.toHaveBeenCalled();
  });

  it('preserves legacy draft PNG reads when no RES reference exists', async () => {
    const controller = Object.create(ResourcesController.prototype);
    const bytes = Buffer.from('old PNG');
    const previews = { getDraftResPreviewUrl: jest.fn().mockResolvedValue(null), readDraftPreview: jest.fn().mockResolvedValue(bytes) };
    Object.defineProperty(controller, 'resourcePreviewService', { value: previews });
    const res = response();
    await controller.getDraftPreview('draft-id', { user: { id: 17 } }, res);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(bytes);
  });

  it('redirects a published version preview to RES and preserves legacy PNG delivery', async () => {
    const bytes = Buffer.from('old version PNG');
    const resources = { getVersionPreviewUrl: jest.fn().mockResolvedValue('https://res.example/o/preview/preview.png'), readVersionPreview: jest.fn().mockResolvedValue(bytes) };
    const controller = new ResourcesV2Controller(resources as any);
    const res = response();
    await controller.versionPreview('resource-uuid', 'version-uuid', res as any);
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://res.example/o/preview/preview.png');
    expect(resources.readVersionPreview).not.toHaveBeenCalled();
    resources.getVersionPreviewUrl.mockResolvedValue(null as any);
    await controller.versionPreview('resource-uuid', 'version-uuid', res as any);
    expect(resources.readVersionPreview).toHaveBeenCalledWith('resource-uuid', 'version-uuid');
    expect(res.send).toHaveBeenCalledWith(bytes);
  });
});
