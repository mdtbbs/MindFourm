export declare class CreateGroupDto {
    name: string;
    slug?: string;
    description?: string;
    icon?: string;
    color?: string;
    sort_order?: number;
}
export declare class UpdateGroupDto {
    name?: string;
    slug?: string;
    description?: string;
    icon?: string;
    color?: string;
    sort_order?: number;
}
export declare class AddGroupMemberDto {
    user_id: number;
    role?: string;
}
export declare class QueryGroupsDto {
    page?: number;
    limit?: number;
    userId?: number;
}
