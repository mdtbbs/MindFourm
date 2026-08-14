import { HttpException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService phone status sync', () => {
  const createService = () => {
    const usersRepository = {
      findOne: jest.fn(),
    };
    const redisService = {
      hgetall: jest.fn(),
    };
    const legalAcceptanceRepository = {
      findOne: jest.fn(),
    };
    const service = new AuthService(
      usersRepository as any,
      {} as any,
      legalAcceptanceRepository as any,
      redisService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    return { service, usersRepository, redisService, legalAcceptanceRepository };
  };

  it('force-refreshes the forum user from MindAuth session tokens', async () => {
    const { service, usersRepository, redisService } = createService();
    const user = { id: 7, phone_verified: false };
    const mindauthUser = {
      id: 123,
      username: 'test-user',
      email: 'test@example.com',
      avatar_url: '/avatar.png',
      phone_verified: true,
    };
    const updated = { id: 7, phone_verified: true };
    redisService.hgetall.mockResolvedValue({
      userId: '7',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    usersRepository.findOne.mockResolvedValue(user);
    jest.spyOn(service, 'getUserInfo').mockResolvedValue(mindauthUser);
    jest.spyOn(service, 'syncMindAuthUserData').mockResolvedValue(updated as any);

    await expect(service.syncPhoneStatusFromSession('forum-session')).resolves.toBe(updated);
    expect(redisService.hgetall).toHaveBeenCalledWith('session:forum-session');
    expect(usersRepository.findOne).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(service.getUserInfo).toHaveBeenCalledWith('access-token');
    expect(service.syncMindAuthUserData).toHaveBeenCalledWith(mindauthUser);
  });

  it('refreshes an expired access token when a refresh token is available', async () => {
    const { service, usersRepository, redisService } = createService();
    const user = { id: 7, phone_verified: false };
    const mindauthUser = {
      id: 123,
      username: 'test-user',
      email: 'test@example.com',
      avatar_url: '/avatar.png',
      phone_verified: true,
    };
    const updated = { id: 7, phone_verified: true };
    redisService.hgetall.mockResolvedValue({
      userId: '7',
      accessToken: 'expired-access-token',
      refreshToken: 'refresh-token',
    });
    usersRepository.findOne.mockResolvedValue(user);
    jest.spyOn(service, 'getUserInfo')
      .mockRejectedValueOnce(new UnauthorizedException('expired'))
      .mockResolvedValueOnce(mindauthUser);
    jest.spyOn(service as any, 'refreshAccessToken').mockResolvedValue({ accessToken: 'new-access-token' });
    jest.spyOn(service, 'syncMindAuthUserData').mockResolvedValue(updated as any);

    await expect(service.syncPhoneStatusFromSession('forum-session')).resolves.toBe(updated);
    expect((service as any).refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(service.getUserInfo).toHaveBeenLastCalledWith('new-access-token');
  });

  it('requires a live forum session', async () => {
    const { service, redisService } = createService();
    redisService.hgetall.mockResolvedValue({});

    await expect(service.syncPhoneStatusFromSession('missing')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires the session user to still exist', async () => {
    const { service, usersRepository, redisService } = createService();
    redisService.hgetall.mockResolvedValue({ userId: '7', accessToken: 'access-token' });
    usersRepository.findOne.mockResolvedValue(null);

    await expect(service.syncPhoneStatusFromSession('forum-session')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires MindAuth tokens in the forum session', async () => {
    const { service, usersRepository, redisService } = createService();
    redisService.hgetall.mockResolvedValue({ userId: '7' });
    usersRepository.findOne.mockResolvedValue({ id: 7, phone_verified: false });

    await expect(service.syncPhoneStatusFromSession('forum-session')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns a stable conflict when MindAuth still reports an unverified phone', async () => {
    const { service, usersRepository, redisService } = createService();
    redisService.hgetall.mockResolvedValue({ userId: '7', accessToken: 'access-token' });
    usersRepository.findOne.mockResolvedValue({ id: 7, phone_verified: false });
    jest.spyOn(service, 'getUserInfo').mockResolvedValue({
      id: 123,
      username: 'test-user',
      email: 'test@example.com',
      avatar_url: '/avatar.png',
      phone_verified: false,
    });
    jest.spyOn(service, 'syncMindAuthUserData').mockResolvedValue({ id: 7, phone_verified: false } as any);

    try {
      await service.syncPhoneStatusFromSession('forum-session');
      throw new Error('Expected sync to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'PHONE_NOT_VERIFIED_AFTER_SYNC',
      });
    }
  });
});
