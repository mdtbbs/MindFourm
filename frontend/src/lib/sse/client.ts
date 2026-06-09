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

interface SSEOptions {
  url: string;
  onOpen?: () => void;
  onError?: (error: Error) => void;
  maxRetries?: number;
  retryDelay?: number;
}

interface SSEMessage {
  type: SSEEventType;
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
        console.log('SSE connection established');
      };

      this.eventSource.onerror = (event) => {
        this.isConnecting = false;

        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.handleDisconnect();
        }

        const error = new Error('SSE connection error');
        this.onError?.(error);
      };

      // Listen for specific event types
      this.setupEventListener('notification');
      this.setupEventListener('online');
      this.setupEventListener('message');
      this.setupEventListener('system');

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
    if (!this.eventSource) return;

    this.eventSource.addEventListener(eventType, (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        this.notifyListeners(eventType as SSEEventType, data);
      } catch {
        this.notifyListeners(eventType as SSEEventType, event.data);
      }
    });
  }

  /**
   * Notify all listeners for an event type
   */
  private notifyListeners(type: SSEEventType, data: unknown): void {
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
      console.error('SSE max retries exceeded');
      this.disconnect();
      return;
    }

    this.retryCount++;
    const delay = this.retryDelay * Math.pow(2, this.retryCount - 1);

    console.log(
      `SSE reconnecting in ${delay}ms (attempt ${this.retryCount}/${this.maxRetries})`
    );

    setTimeout(() => {
      this.eventSource = null;
      this.connect();
    }, delay);
  }

  /**
   * Add a listener for a specific event type
   */
  subscribe(eventType: SSEEventType, callback: (data: unknown) => void): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    this.listeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  /**
   * Disconnect from SSE endpoint
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.listeners.clear();
    console.log('SSE connection closed');
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