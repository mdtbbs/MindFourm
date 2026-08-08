'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ChevronDown, Folder } from 'lucide-react';
import { ResourceCategory } from '@/types';

interface ResourceCategoryTreeProps {
  categories: ResourceCategory[];
  currentCategoryId?: string;
}

interface CategoryNode extends ResourceCategory {
  children?: CategoryNode[];
}

function buildCategoryTree(categories: ResourceCategory[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>();
  const roots: CategoryNode[] = [];

  // First pass: create nodes
  for (const c of categories) {
    map.set(c.id, { ...c, children: [] });
  }

  // Second pass: build tree
  for (const c of categories) {
    const node = map.get(c.id)!;
    // Assuming parent_id exists in ResourceCategory, otherwise treat as root
    const parentId = (c as any).parent_id;
    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children!.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

export default function ResourceCategoryTree({ categories, currentCategoryId }: ResourceCategoryTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const tree = buildCategoryTree(categories);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderNode = (node: CategoryNode, depth = 0) => {
    const isExpanded = expandedIds.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isActive = currentCategoryId === String(node.id);

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer transition-colors ${
            isActive
              ? 'bg-[var(--primary-light)] text-[var(--primary)] font-medium'
              : 'hover:bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(node.id)}
              className="flex-shrink-0 p-0.5 hover:bg-[var(--bg-tertiary)] rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
          ) : (
            <span className="w-4" />
          )}
          <Link href={`/resources?category_id=${node.id}`} className="flex-1 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Folder className="w-3.5 h-3.5" />
              {node.icon && <span className="text-xs">{node.icon}</span>}
              <span>{node.name}</span>
            </span>
            {/* Resource count could be added here if available */}
          </Link>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
      <h3 className="text-sm font-semibold mb-2 px-2 text-[var(--text)]">📁 资源分类</h3>
      <div className="space-y-0.5">
        {tree.map((node) => renderNode(node))}
      </div>
    </div>
  );
}
