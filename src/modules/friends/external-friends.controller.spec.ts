import { BadRequestException, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { EXTERNAL_SCOPE_KEY } from '@common/decorators/external-scope.decorator';
import { ExternalApiKeyGuard } from '@common/guards/external-api-key.guard';
import { ExternalFriendsController } from './external-friends.controller';

describe('ExternalFriendsController.checkFriendship', () => {
  const friendsService = { areFriends: jest.fn() };
  const controller = new ExternalFriendsController(friendsService as any);

  beforeEach(() => jest.clearAllMocks());

  it('uses the canonical accepted-friendship query and returns the LanLink field', async () => {
    friendsService.areFriends.mockResolvedValue(true);

    await expect(controller.checkFriendship('12', '34')).resolves.toEqual({
      ok: true,
      is_friend: true,
    });
    expect(friendsService.areFriends).toHaveBeenCalledWith(12, 34);
  });

  it('returns false when no accepted friendship exists', async () => {
    friendsService.areFriends.mockResolvedValue(false);

    await expect(controller.checkFriendship('12', '34')).resolves.toEqual({
      ok: true,
      is_friend: false,
    });
  });

  it.each([
    [undefined, '2'],
    ['', '2'],
    ['0', '2'],
    ['-1', '2'],
    ['1.5', '2'],
    ['1x', '2'],
    ['9007199254740992', '2'],
    ['1', undefined],
    ['1', '0'],
    ['1', '-2'],
    ['1', '2.5'],
    ['1', '2x'],
    ['1', '9007199254740992'],
  ])('rejects invalid ids (%s, %s) without querying friendships', async (userId, friendId) => {
    await expect(controller.checkFriendship(userId as string, friendId as string))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(friendsService.areFriends).not.toHaveBeenCalled();
  });

  it('propagates lookup failures so an unavailable check cannot authorize friendship', async () => {
    friendsService.areFriends.mockRejectedValue(new Error('database unavailable'));

    await expect(controller.checkFriendship('12', '34')).rejects.toThrow('database unavailable');
  });

  it('keeps the route behind the API key guard and friends:read scope', () => {
    const method = ExternalFriendsController.prototype.checkFriendship;

    expect(Reflect.getMetadata(PATH_METADATA, ExternalFriendsController)).toBe('external/v1/friends');
    expect(Reflect.getMetadata(PATH_METADATA, method)).toBe('check');
    expect(Reflect.getMetadata(METHOD_METADATA, method)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, ExternalFriendsController)).toContain(ExternalApiKeyGuard);
    expect(Reflect.getMetadata(EXTERNAL_SCOPE_KEY, method)).toEqual(['friends:read']);
  });
});
