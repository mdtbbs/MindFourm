import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SettingsRevalidationService {
  private readonly logger = new Logger(SettingsRevalidationService.name);

  async revalidatePublicSettings(): Promise<void> {
    const secret = process.env.SETTINGS_REVALIDATE_SECRET;
    if (!secret) {
      this.logger.warn('SETTINGS_REVALIDATE_SECRET is not configured; skipped Next settings revalidation');
      return;
    }

    const baseUrl = (process.env.FRONTEND_INTERNAL_URL || process.env.FRONTEND_URL || '').replace(/\/+$/, '');
    if (!baseUrl) {
      this.logger.warn('FRONTEND_URL is not configured; skipped Next settings revalidation');
      return;
    }

    try {
      const response = await fetch(`${baseUrl}/internal/revalidate/settings`, {
        method: 'POST',
        headers: { 'X-Revalidate-Secret': secret },
      });

      if (!response.ok) {
        this.logger.warn(`Next settings revalidation failed with HTTP ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`Next settings revalidation failed: ${(error as Error).message}`);
    }
  }
}
