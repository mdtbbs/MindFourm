'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CategoryEditor, type Category } from '@/components/admin/category-editor';
import { resourceCategoryApi } from '@/lib/api/client';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCategories();
  }, []);

  async function loadCategories() {
    try {
      const data = await resourceCategoryApi.list();
      setCategories(data as Category[]);
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(category: Category) {
    if (category.id) {
      await resourceCategoryApi.update(category.id, category);
    } else {
      await resourceCategoryApi.create(category);
    }
    setEditingCategory(null);
    await loadCategories();
  }

  async function handleDelete(id: number) {
    if (!confirm('确定删除此分类？')) return;

    await resourceCategoryApi.delete(id);
    await loadCategories();
  }

  if (loading) return <div>加载中...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>资源分类管理</CardTitle>
      </CardHeader>
      <CardContent>
        {editingCategory ? (
          <CategoryEditor
            category={editingCategory}
            onSave={handleSave}
            onCancel={() => setEditingCategory(null)}
          />
        ) : (
          <>
            <Button
              onClick={() =>
                setEditingCategory({
                  name: '',
                  slug: '',
                  icon: 'Folder',
                  description: '',
                  sort_order: 0,
                  is_active: true,
                })
              }
              className="mb-4"
            >
              新建分类
            </Button>

            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">名称</th>
                  <th className="text-left p-2">图标</th>
                  <th className="text-left p-2">排序</th>
                  <th className="text-left p-2">状态</th>
                  <th className="text-left p-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id} className="border-b">
                    <td className="p-2">{category.name}</td>
                    <td className="p-2">{category.icon}</td>
                    <td className="p-2">{category.sort_order}</td>
                    <td className="p-2">{category.is_active ? '启用' : '禁用'}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingCategory(category)}
                        >
                          编辑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(category.id!)}
                        >
                          删除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
