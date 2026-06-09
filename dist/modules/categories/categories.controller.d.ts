import { CategoriesService } from './categories.service';
export declare class CategoriesController {
    private readonly categoriesService;
    constructor(categoriesService: CategoriesService);
    getAll(): Promise<{
        id: any;
        name: any;
        slug: any;
        sort_order: any;
        is_active: any;
        created_at: any;
        post_count: number;
    }[]>;
    getById(id: number): Promise<import("../../entities").Category>;
}
