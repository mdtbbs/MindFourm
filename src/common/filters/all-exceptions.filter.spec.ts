import { BadRequestException, ConflictException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiV1Exception } from '../exceptions/api-v1.exception';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  const hostFor = (path: string) => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    return {
      response: { status },
      json,
      host: {
        switchToHttp: () => ({
          getRequest: () => ({ originalUrl: path, requestId: 'req-500' }),
          getResponse: () => ({ status }),
        }),
      } as any,
    };
  };

  it('returns the V1 error envelope for an ApiV1Exception', () => {
    const { host, response, json } = hostFor('/api/v1/resources');

    filter.catch(new ApiV1Exception(
      'RESOURCE_FILE_NOT_READY',
      HttpStatus.CONFLICT,
      '资源文件暂不可用',
      true,
      [{ field: 'availability_status' }],
    ), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'RESOURCE_FILE_NOT_READY',
        message: '资源文件暂不可用',
        retryable: true,
        details: [{ field: 'availability_status' }],
        documentation_url: 'https://mdtbbs.cn/api/v1/docs/errors#resource-file-not-ready',
      },
      meta: { request_id: 'req-500' },
    });
  });

  it('preserves the Legacy error envelope outside /api/v1', () => {
    const { host, response, json } = hostFor('/api/resources');

    filter.catch(new BadRequestException('旧接口参数错误'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: '旧接口参数错误',
    });
  });

  it('preserves explicit stable V1 error codes from structured exceptions', () => {
    const { host, json } = hostFor('/api/v1/game-content/maps');
    filter.catch(new BadRequestException({ code: 'INVALID_MAP', message: '地图文件无效' }), host);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INVALID_MAP', message: '地图文件无效', retryable: false, details: [],
        documentation_url: 'https://mdtbbs.cn/api/v1/docs/errors#invalid-map',
      },
      meta: { request_id: 'req-500' },
    });
  });

  it('resolves message, status and retryability from the registry for bare codes', () => {
    // `MultiplayerService.fail()` used to throw `HttpException({ code })` with the
    // code as its own message, leaking `SESSION_FULL` to users and reporting the
    // wrong retryability. The registry now supplies the published contract.
    const { host, response, json } = hostFor('/api/v1/multiplayer/sessions/ses_x/join-intents');
    filter.catch(new ConflictException({ code: 'SESSION_FULL' }), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({
        code: 'SESSION_FULL', message: '联机会话人数已满', retryable: false,
      }),
    }));
  });

  it('keeps the published HTTP status for a registered code (no breaking renumbering)', () => {
    // SESSION_PERMISSION_DENIED now carries the registry status on the exception
    // object, but the response must keep the 400 the endpoint already returned.
    const { host, response } = hostFor('/api/v1/multiplayer/sessions/ses_x/join-intents');
    filter.catch(new BadRequestException({ code: 'SESSION_PERMISSION_DENIED' }), host);
    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
  });

  it('keeps an explicit service message when one is present', () => {
    const { host, json } = hostFor('/api/v1/multiplayer/sessions/ses_x/join-intents');
    filter.catch(new BadRequestException({ code: 'SESSION_NOT_JOINABLE', message: '该房间已锁定' }), host);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ message: '该房间已锁定' }),
    }));
  });
});
