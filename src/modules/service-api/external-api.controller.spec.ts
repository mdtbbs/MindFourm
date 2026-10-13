import { BadRequestException } from "@nestjs/common";
import { ResourcesService } from "@modules/resources/resources.service";
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

  it("classifies legacy polling clients from their reserved board when they omit source", async () => {
    const categoriesService = { getById: jest.fn().mockResolvedValue({ name: "iss问题动态" }) };
    const classified = new ExternalApiController(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
      categoriesService as any, {} as any, {} as any, {} as any,
    );

    await expect((classified as any).resolveAutomationSource({ category_id: 6 })).resolves.toBe("GITHUB_ISSUE");
    await expect((classified as any).resolveAutomationSource({ category_id: 7, source: "GITHUB_PR" })).resolves.toBe("GITHUB_PR");
    expect(categoriesService.getById).toHaveBeenCalledWith(6);
  });
});

/**
 * Issue #70, external scope boundary: a key with `resources:moderate` gets the
 * admin list, which has no selected published version and therefore cannot
 * answer the version-level Mod conditions. The endpoint must not hand back the
 * widened set the caller asked to narrow — the scope decides `admin`, and the
 * service refuses the two parameters for that scope.
 *
 * The service is real so removing the scope guard cannot pass against a stub:
 * the un-guarded admin call resolves with a list instead of rejecting.
 */
describe("ExternalApiController resources list scope", () => {
  const listResourcesService = (overrides: Record<string, unknown> = {}) => {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      maxExecutionTime: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawAndEntities: jest.fn().mockResolvedValue({ entities: [], raw: [] }),
    };
    return Object.assign(Object.create(ResourcesService.prototype), {
      resourceRepository: { find: jest.fn().mockResolvedValue([]), createQueryBuilder: jest.fn(() => queryBuilder) },
      dataSource: { query: jest.fn().mockResolvedValue([]) },
      ...overrides,
    });
  };

  const buildController = (service: unknown) => new ExternalApiController(
    {} as any, {} as any, {} as any, service as any, {} as any, {} as any,
    {} as any, {} as any, {} as any, {} as any, {} as any,
  );

  it("refuses the Mod conditions for a resources:moderate key instead of widening its list", async () => {
    const controller = buildController(listResourcesService());

    await expect(controller.listResources(
      { required_mods: "alpha.mod" },
      { externalApiKey: { scopes: ["resources:read", "resources:moderate"] } },
    )).rejects.toThrow(BadRequestException);
    await expect(controller.listResources(
      { excluded_mods: "rival.mod" },
      { externalApiKey: { scopes: ["resources:read", "resources:moderate"] } },
    )).rejects.toThrow(BadRequestException);
  });

  it("keeps the public scope answering the same conditions for a plain resources:read key", async () => {
    const controller = buildController(listResourcesService({
      // The public path reads the dependency tables and the Mod resolver.
      dataSource: {
        query: jest.fn(async (sql: string) => {
          if (sql.includes('information_schema.tables')) {
            return [{ table_name: 'resource_dependencies' }, { table_name: 'resource_version_dependencies' }];
          }
          if (sql.includes('mod_profiles profile')) return [{ mod_id: 'alpha.mod', requested_identifier: 'alpha.mod' }];
          return [];
        }),
      },
    }));

    await expect(controller.listResources(
      { required_mods: "alpha.mod" },
      { externalApiKey: { scopes: ["resources:read"] } },
    )).resolves.toBeDefined();
  });
});
