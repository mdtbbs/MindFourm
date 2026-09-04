declare module 'event-source-polyfill' {
  export interface EventSourcePolyfillInit {
    headers?: Record<string, string>;
    withCredentials?: boolean;
  }

  export class EventSourcePolyfill extends EventSource {
    constructor(url: string, init?: EventSourcePolyfillInit);
  }
}