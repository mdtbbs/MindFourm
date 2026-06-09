import { GroupMember } from './group-member.entity';
export declare class Group {
    id: number;
    name: string;
    slug: string;
    description: string;
    icon: string;
    color: string;
    sort_order: number;
    is_system: number;
    created_at: Date;
    updated_at: Date;
    members: GroupMember[];
}
