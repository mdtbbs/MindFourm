/**
 * Delivery Strategy — owns how files reach the client.
 *
 * Strategies: public redirect, signed URL, one-time token, controlled proxy,
 * MFL redirect, external-link redirect.
 *
 * The strategy is chosen based on file properties and download policy.
 */

export type DeliveryResult = {
  type: 'redirect' | 'stream' | 'token';
  url?: string;
  ttl?: number;
};

export interface IDeliveryStrategy {
  readonly name: string;
  canDeliver(storageBackend: string, integrityStatus: string): boolean;
  deliver(storageKey: string, options?: { ttl?: number }): Promise<DeliveryResult>;
}
