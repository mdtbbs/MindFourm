import { Repository, DataSource } from 'typeorm';
import { ResourceVersion } from '@entities/resource-version.entity';
import { Resource } from '@entities/resource.entity';
export declare class ResourceVersionService {
    private versionRepository;
    private resourceRepository;
    private dataSource;
    constructor(versionRepository: Repository<ResourceVersion>, resourceRepository: Repository<Resource>, dataSource: DataSource);
    list(resourceId: number): Promise<ResourceVersion[]>;
    create(dto: {
        resource_id: number;
        version: string;
        file_path: string;
    }): Promise<ResourceVersion>;
    delete(id: number, resourceId: number): Promise<void>;
}
