'use client';

import { useState, useEffect } from 'react';
import { categoryApi, adminApi } from '@/lib/api/client';
import type { Category } from '@/types';
import CategoryForm from '@/components/admin/category-form';
import Button from '@/components/ui/button';
import Badge from '@/components/ui/badge';
import Alert from '@/components/ui/alert';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const data = await categoryApi.getList();
      setCategories(data);
    } catch {
      setAlert({ type: 'error', message: '加载分类列表失败' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定要删除分类「${name}」吗？此操作不可撤销。`)) return;

    try {
      await adminApi.deleteCategory(id);
      setAlert({ type: 'success', message: '分类删除成功' });
      fetchCategories();
    } catch (err) {
      setAlert({
        type: 'error',
        message: err instanceof Error ? err.message : '删除失败，请重试',
      });
    }
  };

  const handleFormSuccess = (category: Category) => {
    setEditingCategory(null);
    fetchCategories();
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-surface-900 mb-6">分类管理</h2>

      {alert && (
        <Alert type={alert.type} message={alert.message} className="mb-4" />
      )}

      <CategoryForm
        category={editingCategory}
        onSuccess={handleFormSuccess}
      />

      <div className="bg-white rounded-lg border border-surface-200">
        {isLoading ? (
          <div className="p-8 text-center text-surface-500">加载中...</div>
        ) : categories.length === 0 ? (
          <div className="p-8 text-center text-surface-500">暂无分类</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-50">
                  <th className="text-left px-4 py-3 font-medium text-surface-600">名称</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-600">Slug</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-600">排序</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-600">状态</th>
                  <th className="text-left px-4 py-3 font-medium text-surface-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className="border-b border-surface-100 hover:bg-surface-50">
                    <td className="px-4 py-3 font-medium text-surface-900">{cat.name}</td>
                    <td className="px-4 py-3 text-surface-600 font-mono text-xs">{cat.slug}</td>
                    <td className="px-4 py-3 text-surface-600">{cat.sort_order}</td>
                    <td className="px-4 py-3">
                      <Badge variant={cat.is_active ? 'success' : 'danger'}>
                        {cat.is_active ? '启用' : '禁用'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingCategory(cat)}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(cat.id, cat.name)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
