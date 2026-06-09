import { User } from './user.entity';
export declare class SearchHistory {
    id: number;
    user_id: number;
    query: string;
    search_type: string;
    results_count: number;
    created_at: Date;
    user: User;
}
