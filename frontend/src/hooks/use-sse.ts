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

import { useEffect, useCallback, useRef } from 'react';
import { SSEClient, createSSEClient } from '@/lib/sse/client';
import { useUserStore } from '@/store/user-store';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const SSE_ENDPOINT = `${API_URL}/api/notifications/events`;

interface UseSseOptions {
  enabled?: boolean;
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
  const { enabled = true, onConnect, onDisconnect, onError } = options;
  const { isAuthenticated } = useUserStore();
  const clientRef = useRef<SSEClient | null>(null);

  // Only connect if authenticated and enabled
  const shouldConnect = enabled && isAuthenticated;

  useEffect(() => {
    if (!shouldConnect) {
      // Disconnect if previously connected
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
        onDisconnect?.();
      }
      return;
    }

    // Create and connect SSE client
    if (!clientRef.current) {
      clientRef.current = createSSEClient({
        url: SSE_ENDPOINT,
        onOpen: onConnect,
        onError: (error) => {
          onError?.(error);
        },
        maxRetries: 5,
        retryDelay: 1000,
      });

      clientRef.current.connect();
    }

    // Subscribe to specific event type
    const unsubscribe = clientRef.current.subscribe(
      eventType as 'notification' | 'online' | 'message' | 'system',
      (data) => {
        callback(data as T);
      }
    );

    // Cleanup on unmount or when shouldConnect changes
    return () => {
      unsubscribe();
    };
  }, [shouldConnect, eventType, callback, onConnect, onDisconnect, onError]);
}

/**
 * Hook for managing SSE connection status
 *
 * Returns connection state and manual connect/disconnect functions
 */
export function useSseConnection() {
  const { isAuthenticated } = useUserStore();
  const clientRef = useRef<SSEClient | null>(null);
  const isConnectedRef = useRef(false);

  const connect = useCallback(() => {
    if (!isAuthenticated || clientRef.current) {
      return;
    }

    clientRef.current = createSSEClient({
      url: SSE_ENDPOINT,
      onOpen: () => {
        isConnectedRef.current = true;
      },
      onError: () => {
        isConnectedRef.current = false;
      },
    });

    clientRef.current.connect();
  }, [isAuthenticated]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
      isConnectedRef.current = false;
    }
  }, []);

  const subscribe = useCallback(
    <T = unknown>(eventType: string, callback: (data: T) => void) => {
      if (!clientRef.current) {
        return () => {};
      }

      return clientRef.current.subscribe(
        eventType as 'notification' | 'online' | 'message' | 'system',
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
    isConnected: isConnectedRef.current,
    connect,
    disconnect,
    subscribe,
  };
}