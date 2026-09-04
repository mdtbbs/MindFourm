/**
 * useSse Hook - React hook for SSE (Server-Sent Events) connections
 *
 * Provides easy SSE integration with:
 * - Automatic connection management
 * - Reconnection on disconnect
 * - Event type filtering
 * - Cleanup on unmount
 */

'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { SSEClient, createSSEClient } from '@/lib/sse/client';
import { buildPublicApiUrl } from '@/lib/api/client';
import { useUserStore } from '@/store/user-store';

const SSE_ENDPOINT = buildPublicApiUrl('/api/notifications/events');
interface UseSseOptions {
  enabled?: boolean;
  url?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for subscribing to SSE events
 *
 * @param eventType - The type of event to subscribe to (e.g., 'notification', 'message')
 * @param callback - Callback function to handle received data
 * @param options - Optional configuration
 */
export function useSse<T = unknown>(
  eventType: string,
  callback: (data: T) => void,
  options: UseSseOptions = {}
): void {
  const { enabled = true, url = SSE_ENDPOINT, onConnect, onDisconnect, onError } = options;
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);
  const clientRef = useRef<SSEClient | null>(null);

  // Held in refs so the connection effect does not depend on their identity. Both
  // call sites pass inline arrow functions, which meant a new identity on every
  // render — tearing down and re-establishing the EventSource in a loop.
  const callbackRef = useRef(callback);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    callbackRef.current = callback;
    onConnectRef.current = onConnect;
    onDisconnectRef.current = onDisconnect;
    onErrorRef.current = onError;
  }, [callback, onConnect, onDisconnect, onError]);

  // Only connect if authenticated and enabled
  const shouldConnect = enabled && isAuthenticated;

  useEffect(() => {
    if (!shouldConnect) {
      return;
    }

    const client = createSSEClient({
      url,
      onOpen: () => onConnectRef.current?.(),
      onError: (error) => onErrorRef.current?.(error),
      maxRetries: 5,
      retryDelay: 1000,
    });
    clientRef.current = client;

    const unsubscribe = client.subscribe(eventType, (data) => {
      callbackRef.current(data as T);
    });

    client.connect();

    return () => {
      unsubscribe();
      // The previous cleanup only unsubscribed, leaving the EventSource open — one
      // leaked connection per mount.
      client.disconnect();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
      onDisconnectRef.current?.();
    };
  }, [shouldConnect, eventType, url]);
}

/**
 * Hook for managing SSE connection status
 *
 * Returns connection state and manual connect/disconnect functions
 */
export function useSseConnection() {
  const isAuthenticated = useUserStore((state) => state.isAuthenticated);
  const clientRef = useRef<SSEClient | null>(null);
  // State, not a ref: consumers rendering a connection indicator never updated,
  // because reading `ref.current` does not subscribe them to changes.
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (!isAuthenticated || clientRef.current) {
      return;
    }

    clientRef.current = createSSEClient({
      url: SSE_ENDPOINT,
      onOpen: () => setIsConnected(true),
      onError: () => setIsConnected(false),
    });

    clientRef.current.connect();
  }, [isAuthenticated]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const subscribe = useCallback(
    <T = unknown>(eventType: string, callback: (data: T) => void) => {
      if (!clientRef.current) {
        return () => {};
      }

      return clientRef.current.subscribe(
        eventType,
        (data) => callback(data as T)
      );
    },
    []
  );

  useEffect(() => {
    if (isAuthenticated) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, connect, disconnect]);

  return {
    isConnected,
    connect,
    disconnect,
    subscribe,
  };
}
