'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api/client';
import type { Category } from '@/types';
import { Input } from '@/components/ui/input';
import Button from '@/components/ui/button';
import Alert from '@/components/ui/alert';

interface CategoryFormProps {
  category?: Category | null;
  onSuccess?: (category: Category) => void;
}

interface FormValues {
  name: string;
  slug: string;
  sort_order: string;
  is_active: boolean;
}

interface FormErrors {
  name?: string;
  slug?: string;
  sort_order?: string;
}

export default function CategoryForm({ category, onSuccess }: CategoryFormProps) {
  const isEditMode = !!category;

  const [values, setValues] = useState<FormValues>({
    name: '',
    slug: '',
    sort_order: '0',
    is_active: true,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (category) {
      setValues({
        name: category.name,
        slug: category.slug,
        sort_order: String(category.sort_order),
        is_active: category.is_active,
      });
    } else {
      setValues({ name: '', slug: '', sort_order: '0', is_active: true });
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
        sort_order: Number(values.sort_order),
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
        setValues({ name: '', slug: '', sort_order: '0', is_active: true });
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
