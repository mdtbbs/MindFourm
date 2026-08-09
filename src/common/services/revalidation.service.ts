import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

/**
 * Triggers Next.js on-demand revalidation on the frontend.
 *
 * After cache-mutating operations (e.g. category CRUD), the server-side Redis
 * cache is cleared locally, but the Next.js route handlers on the frontend may
 * still serve stale ISR pages. This service POSTs to `/api/revalidate` on the
 * frontend so it regenerates those pages. Both legs are required for the cache
 * to actually be coherent — clearing Redis alone leaves the Next.js ISR layer
 * stale; triggering revalidation alone leaves Redis stale.
 *
 * The call is best-effort: if the frontend is unreachable or revalidation is
 * not configured, the operation is logged but never throws back into the
 * caller, because a stale cache is preferable to a failed mutation.
 */
@Injectable()
export class RevalidationService {
  private readonly logger = new Logger(RevalidationService.name);

  constructor(private readonly configService: ConfigService) {}

  async triggerRevalidation(path: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL');
    const revalidationSecret = this.configService.get<string>('REVALIDATION_SECRET');

    if (!frontendUrl || !revalidationSecret) {
      this.logger.warn('Revalidation not configured, skipping');
      return;
    }

    try {
      await axios.post(
        `${frontendUrl}/api/revalidate`,
        { path },
        {
          headers: {
            Authorization: `Bearer ${revalidationSecret}`,
          },
          timeout: 5000,
        },
      );
      this.logger.log(`Revalidation triggered for ${path}`);
    } catch (error) {
      // Best-effort: do not propagate. The underlying mutation has already
      // succeeded, and a stale cache is preferable to a failed write.
      this.logger.error(
        `Failed to trigger revalidation for ${path}: ${(error as Error).message}`,
      );
    }
  }
}
