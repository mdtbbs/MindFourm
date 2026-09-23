import { Injectable } from '@nestjs/common';

export interface PortalSectionProvider {
  readonly keys: readonly string[];
  getSection(key: string): Promise<unknown[]>;
  getTitle?(key: string): string | undefined;
}

@Injectable()
export class PortalSectionRegistry {
  private readonly providers = new Map<string, PortalSectionProvider>();

  register(provider: PortalSectionProvider): void {
    for (const key of provider.keys) {
      if (this.providers.has(key)) throw new Error(`Duplicate portal section provider: ${key}`);
      this.providers.set(key, provider);
    }
  }

  getSection<T = unknown>(key: string): Promise<T[]> {
    return (this.providers.get(key)?.getSection(key) ?? Promise.resolve([])) as Promise<T[]>;
  }

  getTitle(key: string, fallback: string): string {
    return this.providers.get(key)?.getTitle?.(key) || fallback;
  }
}
