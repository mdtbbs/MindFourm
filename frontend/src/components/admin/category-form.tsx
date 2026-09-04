'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api/client';
import type { Category } from '@/types';
import { Input } from '@/components/ui/input';
import Button from '@/components/ui/button';
import Alert from '@/components/ui/alert';

interface CategoryFormProps {
  category?: Category | null;
  categories?: Category[];
  onSuccess?: (category: Category) => void;
}

interface FormValues {
  name: string;
  slug: string;
  description: string;
  color: string;
  icon: string;
  group_key: string;
  parent_id: string;
  sort_order: string;
  is_active: boolean;
  show_in_sidebar: boolean;
}

interface FormErrors {
  name?: string;
  slug?: string;
  sort_order?: string;
}

const GROUP_OPTIONS = [
  { value: 'community', label: '社区' },
  { value: 'creation', label: '创作' },
  { value: 'game', label: '游戏' },
  { value: 'meta', label: '站务' },
];

const ICON_OPTIONS = ['MessageCircle', 'CircleHelp', 'BookOpen', 'Code2', 'Map', 'Shapes', 'Radio', 'Megaphone', 'MessagesSquare', 'Wrench'];

export default function CategoryForm({ category, categories = [], onSuccess }: CategoryFormProps) {
  const isEditMode = !!category;

  const [values, setValues] = useState<FormValues>({
    name: '',
    slug: '',
    description: '',
    color: '#64748B',
    icon: 'MessageCircle',
    group_key: 'community',
    parent_id: '',
    sort_order: '0',
    is_active: true,
    show_in_sidebar: true,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (category) {
      setValues({
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        color: category.color || '#64748B',
        icon: category.icon || 'MessageCircle',
        group_key: category.group_key || 'community',
        parent_id: category.parent_id ? String(category.parent_id) : '',
        sort_order: String(category.sort_order),
        is_active: Boolean(category.is_active),
        show_in_sidebar: category.show_in_sidebar !== false,
      });
    } else {
      setValues({ name: '', slug: '', description: '', color: '#64748B', icon: 'MessageCircle', group_key: 'community', parent_id: '', sort_order: '0', is_active: true, show_in_sidebar: true });
    }
    setErrors({});
    setAlert(null);
  }, [category]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!values.name.trim()) {
      newErrors.name = '分类名称不能为空';
    }
    if (!values.slug.trim()) {
      newErrors.slug = ' Slug 不能为空';
    } else if (!/^[a-z0-9-]+$/.test(values.slug)) {
      newErrors.slug = 'Slug 只能包含小写字母、数字和连字符';
    }
    if (values.sort_order === '' || isNaN(Number(values.sort_order))) {
      newErrors.sort_order = '排序必须为有效数字';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (field: keyof FormValues, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const data = {
        name: values.name.trim(),
        slug: values.slug.trim(),
        description: values.description.trim() || null,
        color: values.color,
        icon: values.icon || null,
        group_key: values.group_key ? values.group_key as NonNullable<Category['group_key']> : null,
        parent_id: values.parent_id ? Number(values.parent_id) : null,
        sort_order: Number(values.sort_order),
        is_active: values.is_active,
        show_in_sidebar: values.show_in_sidebar,
      };

      let result: Category;
      if (isEditMode && category) {
        result = await adminApi.updateCategory(category.id, data);
      } else {
        result = await adminApi.createCategory(data);
      }

      setAlert({ type: 'success', message: isEditMode ? '分类更新成功' : '分类创建成功' });

      if (isEditMode) {
        onSuccess?.(result);
      } else {
        setValues({ name: '', slug: '', description: '', color: '#64748B', icon: 'MessageCircle', group_key: 'community', parent_id: '', sort_order: '0', is_active: true, show_in_sidebar: true });
      }
    } catch (err) {
      setAlert({
        type: 'error',
        message: err instanceof Error ? err.message : '操作失败，请重试',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-surface-200 p-6 mb-6">
      <h3 className="text-lg font-semibold text-surface-900 mb-4">
        {isEditMode ? '编辑分类' : '新建分类'}
      </h3>

      {alert && (
        <Alert type={alert.type} message={alert.message} className="mb-4" />
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="分类名称"
            value={values.name}
            onChange={(e) => handleChange('name', e.target.value)}
            error={errors.name}
            placeholder="请输入分类名称"
            disabled={isSubmitting}
          />
          <Input
            label="Slug"
            value={values.slug}
            onChange={(e) => handleChange('slug', e.target.value)}
            error={errors.slug}
            placeholder="url-friendly 标识符"
            disabled={isSubmitting}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-surface-700">板块说明</label>
          <textarea
            value={values.description}
            onChange={(event) => handleChange('description', event.target.value)}
            placeholder="简短说明这个板块适合讨论什么"
            disabled={isSubmitting}
            rows={2}
            className="w-full rounded border border-surface-300 px-3 py-2 text-sm outline-none focus:border-primary-500 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm font-medium text-surface-700">
            板块分组
            <select value={values.group_key} onChange={(event) => handleChange('group_key', event.target.value)} disabled={isSubmitting} className="mt-1.5 w-full rounded border border-surface-300 px-3 py-2 text-sm outline-none focus:border-primary-500">
              {GROUP_OPTIONS.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-surface-700">
            图标
            <select value={values.icon} onChange={(event) => handleChange('icon', event.target.value)} disabled={isSubmitting} className="mt-1.5 w-full rounded border border-surface-300 px-3 py-2 text-sm outline-none focus:border-primary-500">
              {ICON_OPTIONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block text-sm font-medium text-surface-700">
            板块颜色
            <span className="mt-1.5 flex h-10 items-center gap-2 rounded border border-surface-300 px-2">
              <input type="color" value={values.color} onChange={(event) => handleChange('color', event.target.value.toUpperCase())} disabled={isSubmitting} className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
              <span className="font-mono text-xs text-surface-600">{values.color}</span>
            </span>
          </label>
          <label className="block text-sm font-medium text-surface-700">
            上级板块
            <select value={values.parent_id} onChange={(event) => handleChange('parent_id', event.target.value)} disabled={isSubmitting} className="mt-1.5 w-full rounded border border-surface-300 px-3 py-2 text-sm outline-none focus:border-primary-500">
              <option value="">无（一级板块）</option>
              {categories.filter((item) => item.id !== category?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="排序"
            type="number"
            value={values.sort_order}
            onChange={(e) => handleChange('sort_order', e.target.value)}
            error={errors.sort_order}
            placeholder="数字越小越靠前"
            disabled={isSubmitting}
          />
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={values.is_active}
                onChange={(e) => handleChange('is_active', e.target.checked)}
                className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                disabled={isSubmitting}
              />
              <span className="text-sm font-medium text-surface-700">启用</span>
            </label>
            <label className="ml-6 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={values.show_in_sidebar}
                onChange={(e) => handleChange('show_in_sidebar', e.target.checked)}
                className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                disabled={isSubmitting}
              />
              <span className="text-sm font-medium text-surface-700">在侧栏显示</span>
            </label>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '提交中...' : isEditMode ? '更新分类' : '创建分类'}
          </Button>
          {isEditMode && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onSuccess?.(category!)}
              disabled={isSubmitting}
            >
              取消
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
