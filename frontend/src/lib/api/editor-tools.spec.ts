import { editorToolRequest } from './editor-tools';
jest.mock('./client', () => ({ buildPublicApiUrl: (path: string) => `http://api.test${path}` }));

describe('stateless editor requests', () => {
  const originalFetch = global.fetch;
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const send = jest.fn();
  beforeEach(() => {
    send.mockReset(); global.fetch = send;
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'csrf_token=initial' } });
  });
  afterAll(() => {
    global.fetch = originalFetch;
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  it('retries only an explicit CSRF rejection with the latest cookie', async () => {
    send.mockImplementationOnce(async () => {
      document.cookie = 'csrf_token=renewed';
      return { status: 403, ok: false, clone: () => ({ json: async () => ({ message: 'CSRF token invalid' }) }) };
    }).mockResolvedValueOnce({ status: 201, ok: true, json: async () => ({ success: true, data: { metadata: { width: 6 } } }) });
    await expect(editorToolRequest('schematic', 'analyze', new File(['test'], 'test.msch'))).resolves.toEqual({ metadata: { width: 6 } });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][1].headers).toEqual({ 'X-CSRF-Token': 'renewed' });
  });
  it('does not retry a visibility denial', async () => {
    const json = async () => ({ message: '资源不可见' });
    send.mockResolvedValue({ status: 403, ok: false, clone: () => ({ json }), json });
    await expect(editorToolRequest('map', 'export', new File(['test'], 'test.msav'))).rejects.toThrow('资源不可见');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
