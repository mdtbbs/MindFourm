import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Friendship } from '@entities/friendship.entity';
import { User } from '@entities/user.entity';
import { UserBlocksService } from '../user-blocks/user-blocks.service';
import { NotificationsService } from '../notifications/notifications.service';
import { toPublicUsers, toPublicUser } from '../users/public-user.util';
import { escapeLike } from '@common/utils/search.util';

export interface PendingRequestItem {
  id: number;
  requester: Partial<User>;
  created_at: Date;
}

@Injectable()
export class FriendsService {
  private readonly logger = new Logger(FriendsService.name);

  constructor(
    @InjectRepository(Friendship)
    private friendshipRepo: Repository<Friendship>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private userBlocksService: UserBlocksService,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Send a friend request from requesterId to addresseeId.
   *
   * - Cannot add yourself
   * - Checks addressee exists
   * - Checks block status (both directions)
   * - Checks if already friends
   * - Checks if a pending request already exists (avoid duplicates)
   * - If the addressee already sent a pending request to requester, auto-accept it
   */
  async sendRequest(requesterId: number, addresseeId: number): Promise<Friendship> {
    if (requesterId === addresseeId) {
      throw new BadRequestException('不能添加自己为好友');
    }

    const target = await this.userRepo.findOne({
      where: { id: addresseeId },
      select: ['id', 'username'],
    });
    if (!target) {
      throw new NotFoundException('用户不存在');
    }

    // Check block status (both directions)
    const [requesterBlockedTarget, targetBlockedRequester] = await Promise.all([
      this.userBlocksService.isBlocked(requesterId, addresseeId),
      this.userBlocksService.isBlocked(addresseeId, requesterId),
    ]);
    if (requesterBlockedTarget) {
      throw new ForbiddenException('你已将对方拉黑，无法发送好友请求');
    }
    if (targetBlockedRequester) {
      throw new ForbiddenException('对方已将你拉黑，无法发送好友请求');
    }

    // Check if already friends (either direction)
    const existingFriendship = await this.findFriendship(requesterId, addresseeId);
    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        throw new BadRequestException('你们已经是好友了');
      }
      if (existingFriendship.status === 'pending') {
        throw new BadRequestException('已有待处理的好友请求');
      }
    }

    const reverseFriendship = await this.findFriendship(addresseeId, requesterId);
    if (reverseFriendship) {
      if (reverseFriendship.status === 'accepted') {
        throw new BadRequestException('你们已经是好友了');
      }
      if (reverseFriendship.status === 'pending') {
        // The other person already sent a request — auto-accept it to become friends
        reverseFriendship.status = 'accepted';
        const accepted = await this.friendshipRepo.save(reverseFriendship);

        // Notify the original requester that their request was accepted
        const requester = await this.userRepo.findOne({
          where: { id: requesterId },
          select: ['id', 'username', 'avatar_url'],
        });
        if (requester) {
          this.notificationsService.create({
            user_id: addresseeId,
            type: 'friend_accepted',
            actor_id: requesterId,
            content: `${requester.username} 接受了你的好友请求`,
            emailEvent: false,
          }).catch((err) => this.logger.error('Failed to send friend_accepted notification', err));
        }

        return accepted;
      }
    }

    const friendship = this.friendshipRepo.create({
      requester_id: requesterId,
      addressee_id: addresseeId,
      status: 'pending',
    });
    const saved = await this.friendshipRepo.save(friendship);

    // Send notification to addressee
    const requester = await this.userRepo.findOne({
      where: { id: requesterId },
      select: ['id', 'username', 'avatar_url'],
    });
    if (requester) {
      this.notificationsService.create({
        user_id: addresseeId,
        type: 'friend_request',
        actor_id: requesterId,
        content: `${requester.username} 请求加你为好友`,
        emailEvent: false,
      }).catch((err) => this.logger.error('Failed to send friend_request notification', err));
    }

    return saved;
  }

  /**
   * Accept a friend request. userId is the addressee, requesterId is the requester.
   */
  async acceptRequest(userId: number, requesterId: number): Promise<Friendship> {
    const friendship = await this.friendshipRepo.findOne({
      where: {
        requester_id: requesterId,
        addressee_id: userId,
        status: 'pending',
      },
    });
    if (!friendship) {
      throw new NotFoundException('未找到好友请求');
    }

    friendship.status = 'accepted';
    const saved = await this.friendshipRepo.save(friendship);

    // Notify the requester that their request was accepted
    const accepter = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'username', 'avatar_url'],
    });
    if (accepter) {
      this.notificationsService.create({
        user_id: requesterId,
        type: 'friend_accepted',
        actor_id: userId,
        content: `${accepter.username} 接受了你的好友请求`,
        emailEvent: false,
      }).catch((err) => this.logger.error('Failed to send friend_accepted notification', err));
    }

    return saved;
  }

  /**
   * Reject a friend request. userId is the addressee, requesterId is the requester.
   */
  async rejectRequest(userId: number, requesterId: number): Promise<void> {
    const result = await this.friendshipRepo.delete({
      requester_id: requesterId,
      addressee_id: userId,
      status: 'pending',
    });
    if (result.affected === 0) {
      throw new NotFoundException('未找到好友请求');
    }
  }

  /**
   * Cancel a friend request you sent. requesterId is you, addresseeId is the target.
   */
  async cancelRequest(requesterId: number, addresseeId: number): Promise<void> {
    const result = await this.friendshipRepo.delete({
      requester_id: requesterId,
      addressee_id: addresseeId,
      status: 'pending',
    });
    if (result.affected === 0) {
      throw new NotFoundException('未找到好友请求');
    }
  }

  /**
   * Remove a friend. Deletes friendship records in both directions.
   */
  async removeFriend(userId: number, friendId: number): Promise<void> {
    const result = await this.friendshipRepo.delete([
      { requester_id: userId, addressee_id: friendId, status: 'accepted' },
      { requester_id: friendId, addressee_id: userId, status: 'accepted' },
    ]);
    if (result.affected === 0) {
      throw new NotFoundException('不是好友关系');
    }
  }

  /**
   * Get friends list (accepted friendships).
   */
  async getFriendsList(userId: number, page: number = 1, limit: number = 20) {
    const currentPage = Math.max(1, Math.floor(page) || 1);
    const cappedLimit = Math.min(Math.max(1, Math.floor(limit) || 20), 50);
    const skip = (currentPage - 1) * cappedLimit;

    const [friendships, total] = await this.friendshipRepo.findAndCount({
      where: [
        { requester_id: userId, status: 'accepted' },
        { addressee_id: userId, status: 'accepted' },
      ],
      relations: ['requester', 'addressee'],
      order: { updated_at: 'DESC' },
      skip,
      take: cappedLimit,
    });

    // Extract the friend user from each friendship (the one that isn't userId)
    const friends = friendships.map((f) => {
      const friendUser = f.requester_id === userId ? f.addressee : f.requester;
      return {
        ...toPublicUser(friendUser),
        friendship_since: f.updated_at,
      };
    });

    return {
      friends,
      total,
      page: currentPage,
      limit: cappedLimit,
      totalPages: Math.max(1, Math.ceil(total / cappedLimit)),
    };
  }

  /**
   * Get pending requests received by userId.
   */
  async getPendingRequests(userId: number, page: number = 1, limit: number = 20) {
    const currentPage = Math.max(1, Math.floor(page) || 1);
    const cappedLimit = Math.min(Math.max(1, Math.floor(limit) || 20), 50);
    const skip = (currentPage - 1) * cappedLimit;

    const [requests, total] = await this.friendshipRepo.findAndCount({
      where: { addressee_id: userId, status: 'pending' },
      relations: ['requester'],
      order: { created_at: 'DESC' },
      skip,
      take: cappedLimit,
    });

    const items: PendingRequestItem[] = requests.map((r) => ({
      id: r.id,
      requester: toPublicUser(r.requester) as Partial<User>,
      created_at: r.created_at,
    }));

    return {
      requests: items,
      total,
      page: currentPage,
      limit: cappedLimit,
      totalPages: Math.max(1, Math.ceil(total / cappedLimit)),
    };
  }

  /**
   * Check if two users are friends.
   */
  async areFriends(userId1: number, userId2: number): Promise<boolean> {
    const friendship = await this.friendshipRepo.findOne({
      where: [
        { requester_id: userId1, addressee_id: userId2, status: 'accepted' },
        { requester_id: userId2, addressee_id: userId1, status: 'accepted' },
      ],
    });
    return !!friendship;
  }

  /**
   * Check the pending status between two users (from userId1's perspective).
   * Returns:
   * - 'friends' if they are already friends
   * - 'incoming' if userId2 sent a pending request to userId1
   * - 'outgoing' if userId1 sent a pending request to userId2
   * - 'none' if no relationship
   */
  async getPendingStatus(userId1: number, userId2: number): Promise<'none' | 'incoming' | 'outgoing' | 'friends'> {
    const friendship = await this.findFriendship(userId1, userId2);
    const reverse = await this.findFriendship(userId2, userId1);

    if (friendship?.status === 'accepted' || reverse?.status === 'accepted') {
      return 'friends';
    }
    if (reverse?.status === 'pending') {
      // userId2 sent a request to userId1 — that's incoming for userId1
      return 'incoming';
    }
    if (friendship?.status === 'pending') {
      // userId1 sent a request to userId2 — that's outgoing for userId1
      return 'outgoing';
    }
    return 'none';
  }

  /**
   * Search users that are not yet friends, not blocked, and not self.
   */
  async searchNonFriends(userId: number, query: string, limit: number = 10): Promise<Partial<User>[]> {
    if (!query?.trim()) return [];

    const cappedLimit = Math.min(limit, 50);

    // Get friend IDs and blocked IDs to exclude
    const [friendships, blockedIds] = await Promise.all([
      this.friendshipRepo.find({
        where: [
          { requester_id: userId },
          { addressee_id: userId },
        ],
        select: ['requester_id', 'addressee_id'],
      }),
      this.userBlocksService.getBlockedIds(userId),
    ]);

    const excludeIds = new Set<number>([userId, ...blockedIds]);
    for (const f of friendships) {
      if (f.requester_id !== userId) excludeIds.add(f.requester_id);
      if (f.addressee_id !== userId) excludeIds.add(f.addressee_id);
    }

    const qb = this.userRepo.createQueryBuilder('user')
      .where('user.username LIKE :search', { search: `%${escapeLike(query)}%` })
      .andWhere('user.id NOT IN (:...excludeIds)', { excludeIds: [...excludeIds] })
      .orderBy('user.username', 'ASC')
      .take(cappedLimit);

    const users = await qb.getMany();
    return toPublicUsers(users) as Partial<User>[];
  }

  private findFriendship(userId1: number, userId2: number): Promise<Friendship | null> {
    return this.friendshipRepo.findOne({
      where: { requester_id: userId1, addressee_id: userId2 },
    });
  }
}
