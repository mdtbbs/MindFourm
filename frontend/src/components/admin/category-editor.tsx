'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const ICON_OPTIONS = [
  'Wrench', 'Map', 'FileText', 'Image', 'Video', 'Music',
  'Code', 'Package', 'Box', 'Folder', 'Archive', 'Zap',
];

export interface Category {
  id?: number;
  name: string;
  slug: string;
  icon: string;
  description: string;
  sort_order: number;
  is_active: boolean;
}

interface CategoryEditorProps {
  category: Category;
  onSave: (category: Category) => Promise<void>;
  onCancel: () => void;
}

export function CategoryEditor({ category, onSave, onCancel }: CategoryEditorProps) {
  const [formData, setFormData] = useState<Category>(category);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(formData);
    } catch (error) {
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">名称</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          value={formData.slug}
          onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
          required
        />
      </div>

      <div>
        <Label htmlFor="icon">图标</Label>
        <select
          id="icon"
          value={formData.icon}
          onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
          className="w-full px-3 py-2 border border-surface-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors"
        >
          {ICON_OPTIONS.map((icon) => (
            <option key={icon} value={icon}>
              {icon}
            </option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="description">描述</Label>
        <Input
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      <div>
        <Label htmlFor="sort_order">排序</Label>
        <Input
          id="sort_order"
          type="number"
          value={formData.sort_order}
          onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
        />
      </div>

      <div className="flex items-center space-x-2">
        <Switch
          id="is_active"
          checked={formData.is_active}
          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
        />
        <Label htmlFor="is_active">启用</Label>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </form>
  );
}
