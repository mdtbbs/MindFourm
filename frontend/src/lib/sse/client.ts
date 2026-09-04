/**
 * SSE Client - Server-Sent Events connection manager
 *
 * Provides a robust SSE connection with:
 * - Automatic reconnection with exponential backoff
 * - Event type filtering
 * - Connection state tracking
 */

'use client';

import { EventSourcePolyfill } from 'event-source-polyfill';

type SSEEventType = 'notification' | 'online' | 'message' | 'system';
type DynamicSSEEventType = SSEEventType | string;

interface SSEOptions {
  url: string;
  onOpen?: () => void;
  onError?: (error: Error) => void;
  maxRetries?: number;
  retryDelay?: number;
}

interface SSEMessage {
  type: DynamicSSEEventType;
  data: unknown;
}

/**
 * SSE Client class for managing EventSource connections
 */
export class SSEClient {
  private eventSource: EventSourcePolyfill | null = null;
  private url: string;
  private retryCount = 0;
  private maxRetries: number;
  private retryDelay: number;
  private isConnecting = false;
  private shouldReconnect = true;
  private onOpen?: () => void;
  private onError?: (error: Error) => void;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();
  private registeredEventTypes = new Set<string>();

  constructor(options: SSEOptions) {
    this.url = options.url;
    this.maxRetries = options.maxRetries ?? 5;
    this.retryDelay = options.retryDelay ?? 1000;
    this.onOpen = options.onOpen;
    this.onError = options.onError;
  }

  /**
   * Connect to the SSE endpoint
   */
  connect(): void {
    if (this.isConnecting || this.eventSource) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    try {
      // Use EventSourcePolyfill for better browser support
      this.eventSource = new EventSourcePolyfill(this.url, {
        // Include credentials for cookie-based auth
        withCredentials: true,
      });

      this.eventSource.onopen = () => {
        this.retryCount = 0;
        this.isConnecting = false;
        this.onOpen?.();
      };

      this.eventSource.onerror = (event) => {
        this.isConnecting = false;

        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.handleDisconnect();
        }

        const error = new Error('SSE connection error');
        this.onError?.(error);
      };

      this.registeredEventTypes.clear();

      // Listen for known event types and any dynamically subscribed custom events
      const eventTypes = new Set<string>([
        'notification',
        'online',
        'message',
        'system',
        ...this.listeners.keys(),
      ]);
      eventTypes.forEach((eventType) => this.setupEventListener(eventType));

      // Also listen for generic 'message' events
      this.eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as SSEMessage;
          this.notifyListeners(message.type, message.data);
        } catch {
          // If parsing fails, treat as generic notification
          this.notifyListeners('notification', event.data);
        }
      };
    } catch (error) {
      this.isConnecting = false;
      this.handleDisconnect();
    }
  }

  /**
   * Setup listener for a specific event type
   */
  private setupEventListener(eventType: string): void {
    if (!this.eventSource || this.registeredEventTypes.has(eventType)) return;

    this.registeredEventTypes.add(eventType);

    this.eventSource.addEventListener(eventType, (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.notifyListeners(eventType, data);
      } catch {
        this.notifyListeners(eventType, event.data);
      }
    });
  }

  /**
   * Notify all listeners for an event type
   */
  private notifyListeners(type: DynamicSSEEventType, data: unknown): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }

  /**
   * Handle disconnection with retry logic
   */
  private handleDisconnect(): void {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.retryCount >= this.maxRetries) {
      // Close the transport but keep subscriptions intact. Calling disconnect() here
      // also cleared `listeners`, so the client could never be revived — the
      // consuming hook caches it in a ref and only builds a new one when that ref is
      // null, which left real-time updates dead for the rest of the page's life with
      // no user-visible signal.
      console.error('SSE max retries exceeded; giving up until reconnect() is called');
      this.closeTransport();
      return;
    }

    this.retryCount++;
    const delay = this.retryDelay * Math.pow(2, this.retryCount - 1);

    setTimeout(() => {
      this.eventSource = null;
      this.connect();
    }, delay);
  }

  /**
   * Close the transport without discarding subscriptions, so the same client can be
   * reconnected later.
   */
  private closeTransport(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.registeredEventTypes.clear();
  }

  /**
   * Reset the retry budget and reconnect, keeping existing subscriptions.
   */
  reconnect(): void {
    this.closeTransport();
    this.retryCount = 0;
    this.shouldReconnect = true;
    this.connect();
  }

  /**
   * Add a listener for a specific event type
   */
  subscribe(eventType: DynamicSSEEventType, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType)!.add(callback);
    this.setupEventListener(eventType);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  /**
   * Disconnect from SSE endpoint
   */
  /**
   * Permanently close this client. Subscriptions are dropped; use `reconnect()` if
   * you intend to resume.
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.closeTransport();
    this.listeners.clear();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

/**
 * Create a new SSE client instance
 */
export function createSSEClient(options: SSEOptions): SSEClient {
  return new SSEClient(options);
}
