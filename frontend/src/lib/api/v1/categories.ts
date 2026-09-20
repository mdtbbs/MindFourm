import { fetchV1, type FetchV1Options } from './transport';
import type { Category } from '@/types';

/** Canonical public discussion-category source for Server Components. */
export const getCategories = (options?: FetchV1Options) => fetchV1<Category[]>('/categories', options);
export const getCategory = (id: number, options?: FetchV1Options) => fetchV1<Category>(`/categories/${id}`, options);
