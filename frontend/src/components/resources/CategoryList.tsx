'use client';

import Link from 'next/link';
import { getIconComponent } from '@/lib/resource-icons';

interface Category {
  id: number;
  name: string;
  icon: string | null;
  slug: string;
}

interface CategoryListProps {
  categories: Category[];
}

export function CategoryList({ categories }: CategoryListProps) {
  return (
    <ul className="space-y-2">
      {categories.map((category) => {
        const IconComponent = getIconComponent(category.icon ?? 'Folder');

        return (
          <li key={category.id}>
            <Link
              href={`/resources?category_id=${category.id}`}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
            >
              <IconComponent className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>{category.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
