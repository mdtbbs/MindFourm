jest.mock('event-source-polyfill', () => ({ EventSourcePolyfill: jest.fn() }));
import { EventSourcePolyfill } from 'event-source-polyfill';
import { SSEClient } from '../../frontend/src/lib/sse/client';

describe('SSEClient retry lifecycle', () => {
  let sources: any[];
  beforeEach(() => {
    jest.useFakeTimers(); sources = [];
    (EventSourcePolyfill as jest.Mock).mockImplementation(() => {
      const source = { close: jest.fn(), addEventListener: jest.fn(), readyState: 0 };
      sources.push(source); return source;
    });
    (global as any).EventSource = { OPEN: 1, CLOSED: 2 };
  });
  afterEach(() => { jest.useRealTimers(); delete (global as any).EventSource; });

  it('closes a reconnecting polyfill before scheduling the bounded retry', () => {
    const client = new SSEClient({ url: '/events' }); client.connect();
    sources[0].onerror();
    expect(sources[0].close).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1000); expect(sources).toHaveLength(2);
    client.disconnect();
  });

  it('cancels retries when leaving the page and ignores late events from the old source', () => {
    const client = new SSEClient({ url: '/events' }); client.connect();
    const source = sources[0]; source.onerror(); source.onerror(); client.disconnect();
    jest.advanceTimersByTime(30000); expect(sources).toHaveLength(1);
  });

  it('reconnect() replaces a pending timer without creating a second connection', () => {
    const client = new SSEClient({ url: '/events' }); client.connect(); sources[0].onerror(); client.reconnect();
    jest.advanceTimersByTime(10000); expect(sources).toHaveLength(2);
    client.disconnect();
  });
});
