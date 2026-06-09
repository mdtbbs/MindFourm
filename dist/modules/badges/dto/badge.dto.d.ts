export declare class CreateBadgeDto {
    name: string;
    slug: string;
    icon?: string;
    description?: string;
    level?: string;
    criteria?: string;
    is_active?: number;
}
export declare class UpdateBadgeDto {
    name?: string;
    slug?: string;
    icon?: string;
    description?: string;
    level?: string;
    criteria?: string;
    is_active?: number;
}
export declare class AwardBadgeDto {
    user_id: number;
    badge_id: number;
    granted_by?: string;
}
