import { BadRequestException, HttpStatus } from '@nestjs/common';
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
});
