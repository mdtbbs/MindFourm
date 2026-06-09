export declare class CreateLevelDto {
    name: string;
    slug: string;
    min_points: number;
    max_points?: number;
    icon?: string;
    color?: string;
    description?: string;
    sort_order?: number;
}
export declare class UpdateLevelDto {
    name?: string;
    slug?: string;
    min_points?: number;
    max_points?: number;
    icon?: string;
    color?: string;
    description?: string;
    sort_order?: number;
}
