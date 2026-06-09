import { Repository, DataSource } from 'typeorm';
import { Resource } from '@entities/resource.entity';
import { ResourceCategory } from '@entities/resource-category.entity';
import { ResourceVersion } from '@entities/resource-version.entity';
import { User } from '@entities/user.entity';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { QueryResourcesDto } from './dto/query-resources.dto';
export declare class ResourcesService {
    private resourceRepository;
    private userRepository;
    private categoryRepository;
    private versionRepository;
    private dataSource;
    constructor(resourceRepository: Repository<Resource>, userRepository: Repository<User>, categoryRepository: Repository<ResourceCategory>, versionRepository: Repository<ResourceVersion>, dataSource: DataSource);
    create(dto: CreateResourceDto, userId: number): Promise<Resource | null>;
    getList(query: QueryResourcesDto): Promise<{
        data: Resource[];
        nextCursor: string | null;
        hasMore: boolean;
    }>;
    getById(id: number): Promise<Resource>;
    getByIdWithVersions(id: number): Promise<Resource & {
        versions: ResourceVersion[];
    }>;
    incrementDownload(id: number): Promise<void>;
    getByUserId(userId: number, limit?: number, cursor?: string): Promise<{
        data: Resource[];
        nextCursor: string | null;
        hasMore: boolean;
    }>;
    update(id: number, userId: number, dto: UpdateResourceDto): Promise<Resource | null>;
    delete(id: number, userId: number): Promise<void>;
    adminDelete(id: number): Promise<void>;
    updateStatus(id: number, status: string): Promise<Resource>;
    countByStatus(status: string): Promise<number>;
}
