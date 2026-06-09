import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto, AddGroupMemberDto, QueryGroupsDto } from './dto/group.dto';
export declare class GroupsController {
    private readonly groupsService;
    constructor(groupsService: GroupsService);
    getAllGroups(): Promise<{
        success: boolean;
        data: import("../../entities").Group[];
    }>;
    getGroupBySlug(slug: string): Promise<{
        success: boolean;
        data: import("../../entities").Group;
    }>;
    getGroupMembers(slug: string, query: QueryGroupsDto): Promise<{
        success: boolean;
        data: {
            members: {
                role: string;
                joined_at: Date;
                id: number;
                mindauth_id: number;
                username: string;
                email: string;
                avatar_url: string;
                bio: string;
                total_points: number;
                available_points: number;
                reply_email: boolean;
                mention_email: boolean;
                message_email: boolean;
                system_email: boolean;
                digest_email: boolean;
                created_at: Date;
                updated_at: Date;
                posts: import("../../entities").Post[];
                replies: import("../../entities").Reply[];
                bookmarks: import("../../entities").Bookmark[];
                notifications: import("../../entities").Notification[];
                sentNotifications: import("../../entities").Notification[];
                sentMessages: import("../../entities").Message[];
                receivedMessages: import("../../entities").Message[];
                resources: import("../../entities").Resource[];
                postLikes: import("../../entities").PostLike[];
                replyLikes: import("../../entities").ReplyLike[];
                createdBans: import("../../entities").Ban[];
                operationLogs: import("../../entities").OperationLog[];
                pointLogs: import("../../entities").PointLog[];
                following: import("../../entities").Follow[];
                followers: import("../../entities").Follow[];
                userBadges: import("../../entities").UserBadge[];
                grantedBadges: import("../../entities").UserBadge[];
                groupMemberships: import("../../entities").GroupMember[];
                purchases: import("../../entities").Purchase[];
            }[];
            total: number;
            page: number;
            limit: number;
            totalPages: number;
        };
    }>;
    joinGroup(id: number, userId: number): Promise<{
        success: boolean;
        data: import("../../entities").GroupMember;
    }>;
    leaveGroup(id: number, userId: number): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    getMyGroups(userId: number): Promise<{
        success: boolean;
        data: import("../../entities").Group[];
    }>;
    adminGetAllGroups(): Promise<{
        success: boolean;
        data: import("../../entities").Group[];
    }>;
    adminCreateGroup(dto: CreateGroupDto): Promise<{
        success: boolean;
        data: import("../../entities").Group;
    }>;
    adminUpdateGroup(id: number, dto: UpdateGroupDto): Promise<{
        success: boolean;
        data: import("../../entities").Group;
    }>;
    adminDeleteGroup(id: number): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
    adminAddMember(id: number, dto: AddGroupMemberDto): Promise<{
        success: boolean;
        data: import("../../entities").GroupMember;
    }>;
    adminRemoveMember(id: number, userId: number): Promise<{
        success: boolean;
        data: {
            message: string;
        };
    }>;
}
