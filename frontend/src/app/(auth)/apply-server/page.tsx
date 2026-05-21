'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { ServerIcon, AlertCircle, CheckCircle } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Version {
  id: number;
  version: string;
  name: string;
}

export default function ApplyServerPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const [form, setForm] = useState({
    name: '',
    version: 'v146',
    description: '',
  });
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [serverId, setServerId] = useState<number | null>(null);

  useEffect(() => {
    // 获取可用版本
    fetch(`${API_BASE}/api/servers/versions`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.versions) {
          setVersions(data.versions);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      setError('请先登录');
      return;
    }
    if (!form.name.trim()) {
      setError('请输入服务器名称');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess(false);

    try {
      const res = await fetch(`${API_BASE}/api/servers/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(true);
        setServerId(data.server_id);
        setForm({ name: '', version: 'v146', description: '' });
      } else {
        setError(data.message || '申请失败');
      }
    } catch {
      setError('网络错误，请稍后重试');
    }

    setLoading(false);
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <ServerIcon className="w-8 h-8 text-[var(--primary)]" />
        <h1 className="text-2xl font-bold text-[var(--text)]">申请服务器</h1>
      </div>

      {success ? (
        <div className="bg-[var(--bg-card)] rounded-[var(--radius-card)] shadow-[var(--shadow-card)] p-6">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle className="w-6 h-6 text-[var(--success)]" />
            <h2 className="text-lg font-semibold text-[var(--text)]">申请已提交</h2>
          </div>
          <p className="text-[var(--text-secondary)] mb-4">
            您的服务器申请已成功提交，等待管理员审批。审批通过后会自动在论坛发布公告。
          </p>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/servers')}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors"
            >
              查看服务器列表
            </button>
            <button
              onClick={() => setSuccess(false)}
              className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--text)] transition-colors"
            >
              继续申请
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              服务器名称 *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              placeholder="我的 Mindustry 服务器"
              maxLength={50}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              服务器版本 *
            </label>
            <select
              value={form.version}
              onChange={e => setForm({ ...form, version: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)]"
            >
              {versions.length > 0 ? (
                versions.map(v => (
                  <option key={v.id} value={v.version}>{v.name || v.version}</option>
                ))
              ) : (
                <option value="v146">v146 (最新)</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text)] mb-1">
              服务器描述
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-[var(--radius)] text-[var(--text)] focus:ring-2 focus:ring-[var(--primary)] min-h-[100px]"
              placeholder="描述你的服务器用途、特色..."
              maxLength={500}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[var(--error)]">
              <AlertCircle className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-[var(--primary)] text-white font-medium rounded-[var(--radius)] hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '提交中...' : '提交申请'}
          </button>

          <p className="text-sm text-[var(--text-muted)]">
            提交申请后需等待管理员审批。审批通过后会自动在论坛发布公告，并创建服务器实例。
          </p>
        </form>
      )}
    </div>
  );
}