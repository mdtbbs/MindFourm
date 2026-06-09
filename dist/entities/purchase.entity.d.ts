import { User } from './user.entity';
import { ShopItem } from './shop-item.entity';
export declare class Purchase {
    id: number;
    user_id: number;
    item_id: number;
    points_spent: number;
    status: string;
    created_at: Date;
    user: User;
    item: ShopItem;
}
