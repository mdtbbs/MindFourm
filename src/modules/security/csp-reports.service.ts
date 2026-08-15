import { Injectable } from '@nestjs/common';
import { RedisService } from '../../database/redis.service';

@Injectable()
export class CspReportsService {
  constructor(private readonly redis: RedisService) {}

  async record(payload: unknown): Promise<void> {
    const reports = Array.isArray(payload) ? payload : [payload];
    const key = `csp:reports:${new Date().toISOString().slice(0, 13).replace(/[-T:]/g, '')}`;
    for (const item of reports.slice(0, 20)) {
      const report = (item as any)?.['csp-report'] || item || {};
      const directive = String(report['violated-directive'] || report['effective-directive'] || 'unknown')
        .replace(/[^a-z0-9-]/gi, '')
        .slice(0, 80) || 'unknown';
      await this.redis.hIncrBy(key, `directive:${directive}`, 1);
      await this.redis.hIncrBy(key, 'total', 1);
    }
    await this.redis.expire(key, 26 * 60 * 60);
  }
}
