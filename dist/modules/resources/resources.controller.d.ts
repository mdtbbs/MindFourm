import { StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { ResourcesService } from './resources.service';
import { ResourceCategoryService } from './resource-categories.service';
import { ResourceVersionService } from './resource-versions.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { QueryResourcesDto } from './dto/query-resources.dto';
export declare class ResourcesController {
    private readonly resourcesService;
    private readonly categoryService;
    private readonly versionService;
    constructor(resourcesService: ResourcesService, categoryService: ResourceCategoryService, versionService: ResourceVersionService);
    getList(query: QueryResourcesDto): Promise<{
        data: import("../../entities").Resource[];
        nextCursor: string | null;
        hasMore: boolean;
    }>;
    listCategories(): Promise<import("../../entities").ResourceCategory[]>;
    getAdminList(query: QueryResourcesDto): Promise<{
        data: import("../../entities").Resource[];
        nextCursor: string | null;
        hasMore: boolean;
    }>;
    getById(id: number): Promise<import("../../entities").Resource & {
        versions: import("../../entities").ResourceVersion[];
    }>;
    download(id: number, res: Response): Promise<void | StreamableFile>;
    getVersions(id: number): Promise<import("../../entities").ResourceVersion[]>;
    create(dto: CreateResourceDto, req: any): Promise<import("../../entities").Resource | null>;
    update(id: number, dto: UpdateResourceDto, req: any): Promise<import("../../entities").Resource | null>;
    delete(id: number, req: any): Promise<{
        success: boolean;
        message: string;
    }>;
    addVersion(id: number, dto: {
        version: string;
        file_path: string;
    }, req: any): Promise<import("../../entities").ResourceVersion>;
    updateStatus(id: number, status: string): Promise<import("../../entities").Resource>;
    adminDelete(id: number): Promise<{
        success: boolean;
        message: string;
    }>;
}
