import { ExternalApiController } from "./external-api.controller";

describe("ExternalApiController bot read endpoints", () => {
  const postsService = { findAll: jest.fn() };
  const resourcesService = { getFilterOptions: jest.fn() };
  const controller = new ExternalApiController(
    {} as any,
    postsService as any,
    {} as any,
    resourcesService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it("pins the bot activity feed to last_activity_at while retaining pagination", async () => {
    postsService.findAll.mockResolvedValue({ data: [] });
    await controller.listPostsByActivity(
      { page: 2, limit: 10 },
      { externalApiKey: { scopes: ["posts:read"] } },
    );
    expect(postsService.findAll).toHaveBeenCalledWith(
      { page: 2, limit: 10, sort: "last_activity_at" },
      expect.anything(),
    );
  });

  it("returns resource filter options through the resources:read endpoint", async () => {
    resourcesService.getFilterOptions.mockResolvedValue({
      supported_versions: ["v8"],
      compatibility: ["Android"],
    });
    await expect(controller.getResourceFilterOptions()).resolves.toEqual({
      supported_versions: ["v8"],
      compatibility: ["Android"],
    });
  });
});
