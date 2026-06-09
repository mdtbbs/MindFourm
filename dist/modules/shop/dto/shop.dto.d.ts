export declare class CreateShopItemDto {
    name: string;
    description?: string;
    points_cost: number;
    stock?: number;
    image_url?: string;
    sort_order?: number;
    is_active?: number;
}
export declare class UpdateShopItemDto {
    name?: string;
    description?: string;
    points_cost?: number;
    stock?: number;
    image_url?: string;
    sort_order?: number;
    is_active?: number;
}
export declare class QueryShopDto {
    page?: number;
    limit?: number;
    userId?: number;
}
