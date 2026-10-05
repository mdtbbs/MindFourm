import { Injectable } from '@nestjs/common';

export interface SearchOptions {
  limit: number;
  page?: number;
  category?: string;
  sort?: 'relevance' | 'newest' | 'oldest' | 'downloads' | 'rating';
  resource_kind?: 'mod' | 'map' | 'schematic';
  viewer?: { id: number; role: string; preferred_content_language?: string | null };
  content_language?: string;
  preferred_content_language?: string | null;
}
export interface SearchResultGroup<T = unknown> { items: T[]; total?: number; }
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
    return (await this.searchGroup(key, query, options)).items;
  }

  async searchGroup(key: string, query: string, options: SearchOptions): Promise<SearchResultGroup> {
    const provider = this.providers.get(key);
    if (!provider) return { items: [], total: 0 };
    return provider.search(query, options);
  }

  keys(): string[] { return [...this.providers.keys()]; }
}
