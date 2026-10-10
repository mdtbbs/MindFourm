jest.mock('axios');

import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ServersService } from './servers.service';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const BASE_URL = 'https://easymanager.example.com';
const SERVICE_KEY = 'test-service-key';

function createConfigService(overrides: Record<string, any> = {}) {
  const values: Record<string, any> = {
    'easymanager.enabled': true,
    'easymanager.baseUrl': BASE_URL,
    'easymanager.apiKey': SERVICE_KEY,
    ...overrides,
  };

  const get = jest.fn((key: string, defaultValue?: any) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue,
  );

  return { get };
}

function createService(overrides: Record<string, any> = {}) {
  // The disabled-state log line is emitted from the constructor, so the spies
  // have to be installed on the prototype before the instance is built.
  const loggerLog = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  const loggerWarn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  const configService = createConfigService(overrides);
  const service = new ServersService(configService as unknown as ConfigService);
  return { service, configService, loggerWarn, loggerLog };
}

function axiosErrorWithResponse(message?: string, status = 400) {
  const error: any = new Error('Request failed with status code 400');
  error.isAxiosError = true;
  error.response = { status, data: message === undefined ? {} : { message } };
  return error;
}

function axiosNetworkError(message = 'connect ECONNREFUSED 127.0.0.1:5001') {
  const error: any = new Error(message);
  error.isAxiosError = true;
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedAxios.isAxiosError.mockImplementation((error: any) => Boolean(error?.isAxiosError));
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ServersService with easymanager disabled', () => {
  const disabled = { 'easymanager.enabled': false };

  it('reads the config through the documented keys and falls back when absent', () => {
    const configService = createConfigService();
    new ServersService(configService as unknown as ConfigService);

    expect(configService.get).toHaveBeenCalledWith('easymanager.enabled', false);
    expect(configService.get).toHaveBeenCalledWith('easymanager.baseUrl', '');
    expect(configService.get).toHaveBeenCalledWith('easymanager.apiKey', '');
  });

  it('defaults to disabled when the flag is missing', async () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: any) => defaultValue),
    };
    const service = new ServersService(configService as unknown as ConfigService);

    await expect(service.getPublicServers()).resolves.toEqual({ success: true, servers: [] });
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('logs that the integration is disabled', () => {
    const { loggerLog } = createService(disabled);

    expect(loggerLog).toHaveBeenCalledWith(
      expect.stringContaining('EasyManager integration is disabled'),
    );
  });

  it('returns empty data instead of calling EasyManager', async () => {
    const { service } = createService(disabled);

    await expect(service.getPublicServers()).resolves.toEqual({ success: true, servers: [] });
    await expect(service.getAvailableVersions()).resolves.toEqual({ success: true, versions: [] });
    await expect(service.getPublicTemplates()).resolves.toEqual({ success: true, templates: [] });
    await expect(service.getUserServers(42)).resolves.toEqual({
      success: true,
      servers: [],
      message: '服务器功能已关闭',
    });

    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('rejects getServerBasic with BadRequestException', async () => {
    const { service } = createService(disabled);

    const error = await service.getServerBasic(7).catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('服务器功能已关闭');
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('rejects applyServer with BadRequestException', async () => {
    const { service } = createService(disabled);

    const promise = service.applyServer(42, {
      name: 'srv',
      description: 'desc',
      version: 'v146',
      template_id: 3,
    });

    await expect(promise).rejects.toBeInstanceOf(BadRequestException);
    await expect(promise).rejects.toThrow('服务器功能已关闭');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });
});

describe('ServersService request shape when enabled', () => {
  it('calls the public server endpoint with the service key header', async () => {
    const payload = { success: true, servers: [{ id: 1, name: 'Alpha' }] };
    mockedAxios.get.mockResolvedValue({ data: payload } as any);
    const { service } = createService();

    await expect(service.getPublicServers()).resolves.toBe(payload);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(`${BASE_URL}/api/forum/servers/public`, {
      headers: { 'X-Service-Key': SERVICE_KEY },
    });
  });

  it('calls the versions endpoint', async () => {
    const payload = { success: true, versions: ['v146', 'v147'] };
    mockedAxios.get.mockResolvedValue({ data: payload } as any);
    const { service } = createService();

    await expect(service.getAvailableVersions()).resolves.toBe(payload);
    expect(mockedAxios.get).toHaveBeenCalledWith(`${BASE_URL}/api/versions`, {
      headers: { 'X-Service-Key': SERVICE_KEY },
    });
  });

  it('calls the templates endpoint', async () => {
    const payload = { success: true, templates: [{ id: 3 }] };
    mockedAxios.get.mockResolvedValue({ data: payload } as any);
    const { service } = createService();

    await expect(service.getPublicTemplates()).resolves.toBe(payload);
    expect(mockedAxios.get).toHaveBeenCalledWith(`${BASE_URL}/api/templates`, {
      headers: { 'X-Service-Key': SERVICE_KEY },
    });
  });

  it('interpolates the server id into the basic-info endpoint', async () => {
    const payload = { success: true, server: { id: 7 } };
    mockedAxios.get.mockResolvedValue({ data: payload } as any);
    const { service } = createService();

    await expect(service.getServerBasic(7)).resolves.toBe(payload);
    expect(mockedAxios.get).toHaveBeenCalledWith(`${BASE_URL}/api/forum/servers/7/basic`, {
      headers: { 'X-Service-Key': SERVICE_KEY },
    });
  });

  it('interpolates the mindauth id into the user servers endpoint', async () => {
    const payload = { success: true, servers: [] };
    mockedAxios.get.mockResolvedValue({ data: payload } as any);
    const { service } = createService();

    await expect(service.getUserServers(42)).resolves.toBe(payload);
    expect(mockedAxios.get).toHaveBeenCalledWith(`${BASE_URL}/api/forum/user/42/servers`, {
      headers: { 'X-Service-Key': SERVICE_KEY },
    });
  });

  it('posts the application with mindauth_id merged into the body', async () => {
    const payload = { success: true, message: 'submitted' };
    mockedAxios.post.mockResolvedValue({ data: payload } as any);
    const { service } = createService();

    const application = {
      name: 'srv',
      description: 'desc',
      version: 'v146',
      template_id: 3,
    };

    await expect(service.applyServer(42, application)).resolves.toBe(payload);
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${BASE_URL}/api/forum/apply`,
      { mindauth_id: 42, ...application },
      { headers: { 'X-Service-Key': SERVICE_KEY } },
    );
  });

  it('sends the configured base url and key rather than hardcoded values', async () => {
    mockedAxios.get.mockResolvedValue({ data: { success: true } } as any);
    const { service } = createService({
      'easymanager.baseUrl': 'https://other.example.com',
      'easymanager.apiKey': 'other-key',
    });

    await service.getPublicServers();

    expect(mockedAxios.get).toHaveBeenCalledWith('https://other.example.com/api/forum/servers/public', {
      headers: { 'X-Service-Key': 'other-key' },
    });
  });
});

describe('ServersService.getPublicServers error handling', () => {
  it('degrades to an empty list and logs the upstream status', async () => {
    mockedAxios.get.mockRejectedValue(axiosErrorWithResponse('EasyManager exploded', 503));
    const { service, loggerWarn } = createService();

    await expect(service.getPublicServers()).resolves.toEqual({ success: true, servers: [] });
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('EasyManager public server list unavailable (503): EasyManager exploded'),
    );
  });

  it('degrades to an empty list on a network error', async () => {
    mockedAxios.get.mockRejectedValue(axiosNetworkError('connect ECONNREFUSED'));
    const { service, loggerWarn } = createService();

    await expect(service.getPublicServers()).resolves.toEqual({ success: true, servers: [] });
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('EasyManager public server list unavailable (network)'),
    );
  });

  it('degrades to an empty list for a plain Error', async () => {
    mockedAxios.get.mockRejectedValue(new SyntaxError('Unexpected token < in JSON'));
    const { service, loggerWarn } = createService();

    await expect(service.getPublicServers()).resolves.toEqual({ success: true, servers: [] });
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Unexpected token < in JSON'),
    );
  });

  it('degrades to an empty list for a thrown non-Error value', async () => {
    mockedAxios.get.mockRejectedValue('boom');
    const { service, loggerWarn } = createService();

    await expect(service.getPublicServers()).resolves.toEqual({ success: true, servers: [] });
    expect(loggerWarn).toHaveBeenCalledWith(expect.stringContaining('Unknown error'));
  });

  it('falls back to the axios message when the upstream body has no message', async () => {
    mockedAxios.get.mockRejectedValue(axiosErrorWithResponse(undefined, 500));
    const { service, loggerWarn } = createService();

    await expect(service.getPublicServers()).resolves.toEqual({ success: true, servers: [] });
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('Request failed with status code 400'),
    );
  });
});

describe('ServersService.getUserServers error handling', () => {
  it('propagates the upstream message', async () => {
    mockedAxios.get.mockRejectedValue(axiosErrorWithResponse('User not found'));
    const { service } = createService();

    const error = await service.getUserServers(42).catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('User not found');
  });

  it('falls back to the generic fetch message', async () => {
    mockedAxios.get.mockRejectedValue(axiosErrorWithResponse(undefined));
    const { service } = createService();

    await expect(service.getUserServers(42)).rejects.toThrow('Failed to fetch user servers');
  });

  it('reports a connection failure when there is no response', async () => {
    mockedAxios.get.mockRejectedValue(axiosNetworkError());
    const { service } = createService();

    await expect(service.getUserServers(42)).rejects.toThrow(
      'Failed to connect to EasyManager service',
    );
  });
});

describe('ServersService.getServerBasic error handling', () => {
  it('propagates the upstream message', async () => {
    mockedAxios.get.mockRejectedValue(axiosErrorWithResponse('Server does not exist'));
    const { service } = createService();

    const error = await service.getServerBasic(7).catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('Server does not exist');
  });

  it('falls back to the generic fetch message', async () => {
    mockedAxios.get.mockRejectedValue(axiosErrorWithResponse(undefined));
    const { service } = createService();

    await expect(service.getServerBasic(7)).rejects.toThrow('Failed to fetch server info');
  });

  it('reports a connection failure when there is no response', async () => {
    mockedAxios.get.mockRejectedValue(axiosNetworkError());
    const { service } = createService();

    await expect(service.getServerBasic(7)).rejects.toThrow(
      'Failed to connect to EasyManager service',
    );
  });
});

describe('ServersService.applyServer error handling', () => {
  const application = { name: 'srv', description: 'desc', version: 'v146', template_id: 3 };

  it('propagates the upstream message', async () => {
    mockedAxios.post.mockRejectedValue(axiosErrorWithResponse('Not enough points'));
    const { service } = createService();

    const error = await service.applyServer(42, application).catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('Not enough points');
  });

  it('falls back to the generic apply message', async () => {
    mockedAxios.post.mockRejectedValue(axiosErrorWithResponse(undefined));
    const { service } = createService();

    await expect(service.applyServer(42, application)).rejects.toThrow(
      'Failed to apply for server',
    );
  });

  it('reports a connection failure when there is no response', async () => {
    mockedAxios.post.mockRejectedValue(axiosNetworkError());
    const { service } = createService();

    await expect(service.applyServer(42, application)).rejects.toThrow(
      'Failed to connect to EasyManager service',
    );
  });
});

describe('ServersService.getAvailableVersions error handling', () => {
  it('propagates the upstream message', async () => {
    mockedAxios.get.mockRejectedValue(axiosErrorWithResponse('Versions unavailable'));
    const { service } = createService();

    const error = await service.getAvailableVersions().catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('Versions unavailable');
  });

  it('falls back to the generic fetch message', async () => {
    mockedAxios.get.mockRejectedValue(axiosErrorWithResponse(undefined));
    const { service } = createService();

    await expect(service.getAvailableVersions()).rejects.toThrow(
      'Failed to fetch available versions',
    );
  });

  it('reports a connection failure when there is no response', async () => {
    mockedAxios.get.mockRejectedValue(axiosNetworkError());
    const { service } = createService();

    await expect(service.getAvailableVersions()).rejects.toThrow(
      'Failed to connect to EasyManager service',
    );
  });
});

describe('ServersService.getPublicTemplates error handling', () => {
  it('propagates the upstream message', async () => {
    mockedAxios.get.mockRejectedValue(axiosErrorWithResponse('Templates unavailable'));
    const { service } = createService();

    const error = await service.getPublicTemplates().catch((e) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.message).toBe('Templates unavailable');
  });

  it('falls back to the generic fetch message', async () => {
    mockedAxios.get.mockRejectedValue(axiosErrorWithResponse(undefined));
    const { service } = createService();

    await expect(service.getPublicTemplates()).rejects.toThrow('Failed to fetch templates');
  });

  it('reports a connection failure when there is no response', async () => {
    mockedAxios.get.mockRejectedValue(axiosNetworkError());
    const { service } = createService();

    await expect(service.getPublicTemplates()).rejects.toThrow(
      'Failed to connect to EasyManager service',
    );
  });
});
