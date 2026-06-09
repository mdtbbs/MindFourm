export declare class AwardPointsDto {
    user_id: number;
    points: number;
    reason: string;
}
export declare class CreatePointRuleDto {
    action: string;
    points: number;
    description?: string;
}
export declare class UpdatePointRuleDto {
    points?: number;
    description?: string;
    is_active?: number;
}
