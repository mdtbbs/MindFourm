import { Injectable } from '@nestjs/common';

export interface SearchOptions { limit: number; viewer?: { id: number; role: string }; }
export interface SearchResultGroup<T = unknown> { items: T[]; }
export interface SearchProvider {
  readonly key: string;
  search(query: string, options: SearchOptions): Promise<SearchResultGroup>;
}

@Injectable()
export class SearchProviderRegistry {
  private readonly providers = new Map<string, SearchProvider>();

  register(provider: SearchProvider): void {
    if (this.providers.has(provider.key)) throw new Error(`Duplicate search provider: ${provider.key}`);
    this.providers.set(provider.key, provider);
  }

  async search(key: string, query: string, options: SearchOptions): Promise<unknown[]> {
    const provider = this.providers.get(key);
    if (!provider) return [];
    const result = await provider.search(query, options);
    return result.items;
  }

  keys(): string[] { return [...this.providers.keys()]; }
}
