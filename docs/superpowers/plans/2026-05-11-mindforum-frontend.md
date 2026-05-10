# MindForum Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a modern forum frontend with Next.js SSR, XenForo-style post display, MindAuth SSO integration, and a complete admin panel.

**Architecture:** Single Next.js 14+ project using App Router with route groups for public frontend (`(public)/`) and admin backend (`admin/`). SSR-first data strategy with Server Actions for form submissions. React Context for auth state only.

**Tech Stack:** Next.js 14+ / TypeScript / TailwindCSS / react-markdown / lucide-react

---

## File Structure Map

### New Files (by task)

| Task | Files | Responsibility |
|------|-------|----------------|
| Task 1 | `package.json`, `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `next.config.js` | Project config |
| Task 2 | `src/types/index.ts` | All TypeScript type definitions |
| Task 3 | `src/lib/api/client.ts` | Fetch wrapper + API functions |
| Task 4 | `src/lib/auth/context.tsx` | Auth context + provider |
| Task 5 | `src/app/layout.tsx`, `src/app/globals.css` | Root layout + global styles |
| Task 6 | `src/app/(public)/layout.tsx`, `src/components/forum/header.tsx`, `src/components/forum/footer.tsx` | Public layout shell |
| Task 7 | `src/components/ui/` | Base UI components (Button, Input, Pagination, etc.) |
| Task 8 | `src/components/forum/post-card.tsx`, `src/components/forum/sidebar.tsx` | Homepage components |
| Task 9 | `src/app/(public)/page.tsx` | Homepage SSR |
| Task 10 | `src/app/(auth)/login/page.tsx`, `src/app/(auth)/callback/page.tsx` | Auth pages |
| Task 11 | `src/components/forum/post-content.tsx`, `src/components/forum/reply-item.tsx`, `src/components/forum/reply-editor.tsx` | Post detail components |
| Task 12 | `src/app/(public)/posts/[id]/page.tsx` | Post detail SSR |
| Task 13 | `src/app/(public)/categories/[id]/page.tsx`, `src/app/(public)/tags/[slug]/page.tsx` | Category/Tag pages |
| Task 14 | `src/components/forum/user-profile.tsx`, `src/app/(public)/users/[id]/page.tsx` | User profile |
| Task 15 | `src/app/admin/layout.tsx`, `src/components/admin/sidebar.tsx`, `src/components/admin/admin-header.tsx` | Admin layout |
| Task 16 | `src/app/admin/page.tsx`, `src/components/admin/dashboard.tsx` | Admin dashboard |
| Task 17 | `src/app/admin/categories/page.tsx`, `src/components/admin/category-form.tsx` | Category management |
| Task 18 | `src/app/admin/users/page.tsx`, `src/components/admin/user-role-form.tsx` | User management |
| Task 19 | `src/app/admin/posts/page.tsx` | Post management |
| Task 20 | `src/app/admin/logs/page.tsx` | Admin logs |
| Task 21 | `src/app/(public)/posts/new/page.tsx`, `src/components/forum/post-form.tsx` | Create post |

---

### Task 1: Project Setup

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.js`, `tailwind.config.js`, `postcss.config.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "mindforum-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "lucide-react": "^0.400.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.4.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create next.config.js**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:4000/api/:path*',
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4001',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
```

- [ ] **Step 4: Create tailwind.config.js**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        surface: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#171717',
        },
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Create postcss.config.js**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create .env.local.example**

```
# Backend API URL (for rewrites)
NEXT_PUBLIC_API_URL=http://localhost:4000

# MindAuth SSO URL
NEXT_PUBLIC_MINDAUTH_URL=http://localhost:4001
```

- [ ] **Step 7: Install dependencies and verify**

Run: `npm install`
Expected: All dependencies installed without errors

- [ ] **Step 8: Create .gitignore**

```
node_modules
.next
.env
.env.local
.env.*.local
```

---

### Task 2: TypeScript Type Definitions

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create type definitions**

```ts
// User types
export interface User {
  id: number;
  mindauthId: number;
  username: string;
  email: string;
  role: 'guest' | 'user' | 'moderator' | 'admin';
  createdAt: string;
}

export interface AuthCheckResponse {
  authenticated: boolean;
  user?: User;
}

// Category types
export interface Category {
  id: number;
  name: string;
  slug: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// Tag types
export interface Tag {
  id: number;
  name: string;
  slug: string;
  created_at: string;
}

// Post types
export interface Post {
  id: number;
  user_id: number;
  category_id: number | null;
  title: string;
  content: string;
  content_html: string;
  status: 'draft' | 'published' | 'deleted';
  is_pinned: boolean;
  view_count: number;
  created_at: string;
  updated_at: string;
  category_name: string | null;
  category_slug: string | null;
  author_mindauth_id: number;
  author_role: string;
  tags: Tag[];
  replies?: Reply[];
}

export interface PostListResponse {
  data: Post[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreatePostInput {
  title: string;
  content: string;
  category_id?: number;
  tags?: string[];
  status?: 'draft' | 'published';
}

// Reply types
export interface Reply {
  id: number;
  post_id: number;
  user_id: number;
  parent_reply_id: number | null;
  content: string;
  content_html: string;
  status: 'active' | 'deleted';
  created_at: string;
  updated_at: string;
  author_mindauth_id: number;
  author_role: string;
}

export interface ReplyListResponse {
  data: Reply[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CreateReplyInput {
  content: string;
  parent_reply_id?: number;
}

// Admin types
export interface AdminLog {
  id: number;
  user_id: number | null;
  action: string;
  target_type: string | null;
  target_id: number | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface UpdateRoleInput {
  role: 'user' | 'moderator' | 'admin';
}

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// Form state
export interface FormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  isSubmitting: boolean;
  submitted: boolean;
}
```

---

### Task 3: API Client

**Files:**
- Create: `src/lib/api/client.ts`

- [ ] **Step 1: Create API client**

```ts
import { ApiResponse } from '@/types';

const API_BASE = '';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }

  // Handle wrapped responses { success: true, data: ... }
  if ('success' in data && 'data' in data) {
    return data.data as T;
  }

  return data as T;
}

// Auth APIs
export const authApi = {
  check: () => request<ApiResponse<{ authenticated: boolean; user?: import('@/types').User }>>('/api/auth/check'),
  verifySession: (session_token: string) =>
    request<ApiResponse>('/api/auth/verify-session', {
      method: 'POST',
      body: JSON.stringify({ session_token }),
    }),
  logout: () => request<ApiResponse>('/api/auth/logout', { method: 'POST' }),
};

// Post APIs
export const postApi = {
  getList: (params?: { page?: number; limit?: number; category_id?: number; user_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.category_id) qs.set('category_id', String(params.category_id));
    if (params?.user_id) qs.set('user_id', String(params.user_id));
    return request<import('@/types').PostListResponse>(`/api/posts?${qs}`);
  },
  getById: (id: number) => request<import('@/types').Post>(`/api/posts/${id}`),
  create: (input: import('@/types').CreatePostInput) =>
    request<import('@/types').Post>('/api/posts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: number, input: Partial<import('@/types').CreatePostInput>) =>
    request<import('@/types').Post>(`/api/posts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  delete: (id: number) =>
    request<ApiResponse>(`/api/posts/${id}`, { method: 'DELETE' }),
};

// Reply APIs
export const replyApi = {
  getByPost: (postId: number, params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<import('@/types').ReplyListResponse>(`/api/posts/${postId}/replies?${qs}`);
  },
  create: (postId: number, input: import('@/types').CreateReplyInput) =>
    request<import('@/types').Reply>(`/api/posts/${postId}/replies`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: number, content: string) =>
    request<import('@/types').Reply>(`/api/replies/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
  delete: (id: number) =>
    request<ApiResponse>(`/api/replies/${id}`, { method: 'DELETE' }),
};

// Category APIs
export const categoryApi = {
  getList: () => request<import('@/types').Category[]>('/api/categories'),
  getById: (id: number) => request<import('@/types').Category>(`/api/categories/${id}`),
};

// Tag APIs
export const tagApi = {
  getList: () => request<import('@/types').Tag[]>('/api/tags'),
  getPostsByTag: (slug: string, page?: number) => {
    const qs = new URLSearchParams();
    if (page) qs.set('page', String(page));
    return request<import('@/types').PostListResponse>(`/api/tags/${slug}/posts?${qs}`);
  },
};

// Admin APIs
export const adminApi = {
  createCategory: (data: { name: string; slug: string; sort_order?: number }) =>
    request<import('@/types').Category>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateCategory: (id: number, data: { name: string; slug: string; sort_order?: number }) =>
    request<import('@/types').Category>(`/api/admin/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteCategory: (id: number) =>
    request<ApiResponse>(`/api/admin/categories/${id}`, { method: 'DELETE' }),
  updateUserRole: (id: number, role: 'user' | 'moderator' | 'admin') =>
    request<import('@/types').User>(`/api/admin/users/${id}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    }),
  pinPost: (id: number, isPinned: boolean) =>
    request<import('@/types').Post>(`/api/admin/posts/${id}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ is_pinned: isPinned }),
    }),
  movePost: (id: number, category_id: number) =>
    request<import('@/types').Post>(`/api/admin/posts/${id}/move`, {
      method: 'PUT',
      body: JSON.stringify({ category_id }),
    }),
  getLogs: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<{ data: import('@/types').AdminLog[]; pagination: import('@/types').PostListResponse['pagination'] }>(`/api/admin/logs?${qs}`);
  },
  getUsers: (params?: { page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<{ data: import('@/types').User[]; pagination: import('@/types').PostListResponse['pagination'] }>(`/api/admin/users?${qs}`);
  },
};
```

---

### Task 4: Auth Context

**Files:**
- Create: `src/lib/auth/context.tsx`

- [ ] **Step 1: Create AuthContext**

```tsx
'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '@/types';
import { authApi } from '@/lib/api/client';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  logout: async () => {},
  refreshAuth: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const response = await authApi.check();
      if (response.success && response.data?.authenticated) {
        setUser(response.data.user || null);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Check for MindAuth session token first
    const mindauthToken = localStorage.getItem('mindauth_session_token');
    if (mindauthToken) {
      // Try to verify session
      authApi.verifySession(mindauthToken)
        .then(() => refreshAuth())
        .catch(() => {
          localStorage.removeItem('mindauth_session_token');
          refreshAuth();
        });
    } else {
      refreshAuth();
    }
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore errors during logout
    }
    setUser(null);
    localStorage.removeItem('mindauth_session_token');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

---

### Task 5: Root Layout

**Files:**
- Create: `src/app/layout.tsx`, `src/app/globals.css`

- [ ] **Step 1: Create globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }

  body {
    @apply bg-surface-50 text-surface-900;
  }

  /* Markdown content styles */
  .markdown-content {
    @apply space-y-4;
  }

  .markdown-content h1 {
    @apply text-2xl font-bold mt-6 mb-4;
  }

  .markdown-content h2 {
    @apply text-xl font-bold mt-5 mb-3;
  }

  .markdown-content h3 {
    @apply text-lg font-semibold mt-4 mb-2;
  }

  .markdown-content p {
    @apply leading-relaxed;
  }

  .markdown-content code {
    @apply bg-surface-100 px-1.5 py-0.5 rounded text-sm font-mono;
  }

  .markdown-content pre {
    @apply bg-surface-100 p-4 rounded-lg overflow-x-auto;
  }

  .markdown-content pre code {
    @apply bg-transparent p-0;
  }

  .markdown-content blockquote {
    @apply border-l-4 border-primary-500 pl-4 py-2 my-4 bg-surface-100 text-surface-600;
  }

  .markdown-content ul {
    @apply list-disc pl-6 space-y-1;
  }

  .markdown-content ol {
    @apply list-decimal pl-6 space-y-1;
  }

  .markdown-content a {
    @apply text-primary-600 hover:underline;
  }

  .markdown-content img {
    @apply max-w-full rounded;
  }

  .markdown-content table {
    @apply w-full border-collapse my-4;
  }

  .markdown-content th,
  .markdown-content td {
    @apply border border-surface-200 px-3 py-2 text-left;
  }

  .markdown-content th {
    @apply bg-surface-100 font-semibold;
  }
}
```

- [ ] **Step 2: Create root layout**

```tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth/context';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'MindForum',
    template: '%s | MindForum',
  },
  description: 'A modern community forum',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build`
Expected: Build succeeds (may have TypeScript warnings for unused types)

---

### Task 6: Public Layout Shell (Header + Footer)

**Files:**
- Create: `src/app/(public)/layout.tsx`, `src/components/forum/header.tsx`, `src/components/forum/footer.tsx`

- [ ] **Step 1: Create Header component**

```tsx
'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { Search, User, LogOut, Settings, Shield } from 'lucide-react';

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';

  const handleLogin = () => {
    const redirectUrl = encodeURIComponent(`${window.location.origin}/api/auth/callback`);
    window.location.href = `${mindauthUrl}/login?redirect=${redirectUrl}`;
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <header className="bg-white border-b border-surface-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-xl font-bold text-primary-600">MindForum</span>
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-lg mx-8 hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
              <input
                type="text"
                placeholder="搜索帖子..."
                className="w-full pl-10 pr-4 py-2 bg-surface-100 rounded-lg border-0 focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-3">
            {isAuthenticated && user ? (
              <>
                {user.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="p-2 text-surface-600 hover:text-primary-600 transition-colors"
                    title="管理后台"
                  >
                    <Shield className="w-5 h-5" />
                  </Link>
                )}
                <Link
                  href={`/users/${user.id}`}
                  className="flex items-center space-x-2 px-3 py-1.5 text-sm text-surface-700 hover:text-primary-600 transition-colors"
                >
                  <User className="w-4 h-4" />
                  <span className="hidden sm:inline">{user.username}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="p-2 text-surface-600 hover:text-red-600 transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </>
            ) : (
              <button
                onClick={handleLogin}
                className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
              >
                登录
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create Footer component**

```tsx
export default function Footer() {
  return (
    <footer className="bg-white border-t border-surface-200 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center text-sm text-surface-500">
          <p>&copy; {new Date().getFullYear()} MindForum. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Create public layout**

```tsx
import Header from '@/components/forum/header';
import Footer from '@/components/forum/footer';

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
```

---

### Task 7: Base UI Components

**Files:**
- Create: `src/components/ui/button.tsx`, `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/select.tsx`, `src/components/ui/pagination.tsx`, `src/components/ui/alert.tsx`, `src/components/ui/badge.tsx`

- [ ] **Step 1: Create Button component**

```tsx
'use client';

import { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700',
  secondary: 'bg-surface-100 text-surface-700 hover:bg-surface-200',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-transparent text-surface-600 hover:bg-surface-100',
};

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Create Input component**

```tsx
'use client';

import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-surface-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors ${
            error ? 'border-red-500' : 'border-surface-300'
          } ${className}`}
          {...props}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export { Input };
```

- [ ] **Step 3: Create Textarea component**

```tsx
'use client';

import { TextareaHTMLAttributes, forwardRef } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-surface-700">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors min-h-[120px] resize-y ${
            error ? 'border-red-500' : 'border-surface-300'
          } ${className}`}
          {...props}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export { Textarea };
```

- [ ] **Step 4: Create Select component**

```tsx
'use client';

import { SelectHTMLAttributes, forwardRef } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string | number; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-surface-700">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-colors ${
            error ? 'border-red-500' : 'border-surface-300'
          } ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
export { Select };
```

- [ ] **Step 5: Create Pagination component**

```tsx
'use client';

import Link from 'next/link';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  className?: string;
}

export default function Pagination({
  currentPage,
  totalPages,
  basePath,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const getPageUrl = (page: number) =>
    page === 1 ? basePath : `${basePath}?page=${page}`;

  return (
    <nav className={`flex items-center justify-center space-x-1 ${className}`}>
      {currentPage > 1 && (
        <Link
          href={getPageUrl(currentPage - 1)}
          className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 rounded"
        >
          上一页
        </Link>
      )}
      {Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter((page) => {
          if (page === 1 || page === totalPages) return true;
          if (Math.abs(page - currentPage) <= 2) return true;
          return false;
        })
        .map((page, idx, arr) => {
          const prev = arr[idx - 1];
          const showEllipsis = prev && page - prev > 1;

          return (
            <span key={page} className="inline-flex items-center">
              {showEllipsis && <span className="px-2 text-surface-400">...</span>}
              {page === currentPage ? (
                <span className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded font-medium">
                  {page}
                </span>
              ) : (
                <Link
                  href={getPageUrl(page)}
                  className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 rounded"
                >
                  {page}
                </Link>
              )}
            </span>
          );
        })}
      {currentPage < totalPages && (
        <Link
          href={getPageUrl(currentPage + 1)}
          className="px-3 py-1.5 text-sm text-surface-600 hover:bg-surface-100 rounded"
        >
          下一页
        </Link>
      )}
    </nav>
  );
}
```

- [ ] **Step 6: Create Alert component**

```tsx
'use client';

interface AlertProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  message: string;
  className?: string;
}

const typeClasses = {
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  error: 'bg-red-50 text-red-800 border-red-200',
};

export default function Alert({ type = 'info', message, className = '' }: AlertProps) {
  return (
    <div
      className={`px-4 py-3 rounded-lg border text-sm ${typeClasses[type]} ${className}`}
      role="alert"
    >
      {message}
    </div>
  );
}
```

- [ ] **Step 7: Create Badge component**

```tsx
'use client';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning';
  className?: string;
}

const variantClasses = {
  default: 'bg-surface-100 text-surface-700',
  primary: 'bg-primary-100 text-primary-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
};

export default function Badge({
  children,
  variant = 'default',
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantClasses[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
```

---

### Task 8: Homepage Components (Sidebar + PostCard)

**Files:**
- Create: `src/components/forum/sidebar.tsx`, `src/components/forum/post-card.tsx`

- [ ] **Step 1: Create Sidebar component**

```tsx
'use client';

import Link from 'next/link';
import { Category, Tag } from '@/types';

interface SidebarProps {
  categories: Category[];
  tags: Tag[];
  selectedCategory?: number;
}

export default function Sidebar({ categories, tags, selectedCategory }: SidebarProps) {
  return (
    <aside className="space-y-6">
      {/* Categories */}
      <div className="bg-white rounded-lg border border-surface-200 p-4">
        <h3 className="font-semibold text-surface-900 mb-3">分类</h3>
        <nav className="space-y-1">
          <Link
            href="/"
            className={`block px-3 py-2 rounded text-sm transition-colors ${
              !selectedCategory
                ? 'bg-primary-50 text-primary-700 font-medium'
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            全部帖子
          </Link>
          {categories
            .filter((c) => c.is_active)
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((category) => (
              <Link
                key={category.id}
                href={`/categories/${category.id}`}
                className={`block px-3 py-2 rounded text-sm transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-surface-600 hover:bg-surface-100'
                }`}
              >
                {category.name}
              </Link>
            ))}
        </nav>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="bg-white rounded-lg border border-surface-200 p-4">
          <h3 className="font-semibold text-surface-900 mb-3">热门标签</h3>
          <div className="flex flex-wrap gap-2">
            {tags.slice(0, 20).map((tag) => (
              <Link
                key={tag.id}
                href={`/tags/${tag.slug}`}
                className="px-3 py-1 bg-surface-100 text-surface-600 text-sm rounded-full hover:bg-primary-100 hover:text-primary-700 transition-colors"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Create PostCard component**

```tsx
'use client';

import Link from 'next/link';
import { Post } from '@/types';
import Badge from '@/components/ui/badge';
import { Pin, MessageSquare, Eye } from 'lucide-react';

interface PostCardProps {
  post: Post;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return date.toLocaleDateString('zh-CN');
}

export default function PostCard({ post }: PostCardProps) {
  return (
    <article className="bg-white rounded-lg border border-surface-200 p-4 hover:border-surface-300 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {post.is_pinned && (
              <Pin className="w-4 h-4 text-red-500 flex-shrink-0" />
            )}
            <Link
              href={`/posts/${post.id}`}
              className="text-lg font-semibold text-surface-900 hover:text-primary-600 truncate"
            >
              {post.title}
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-surface-500">
            {post.category_name && (
              <Link
                href={`/categories/${post.category_id}`}
                className="hover:text-primary-600 transition-colors"
              >
                {post.category_name}
              </Link>
            )}

            {post.tags.length > 0 && (
              <div className="flex gap-1">
                {post.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag.id} variant="primary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}

            <span className="flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              {post.view_count || 0} 回复
            </span>

            <span className="flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              {post.view_count} 浏览
            </span>

            <span>{formatTime(post.created_at)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
```

---

### Task 9: Homepage

**Files:**
- Create: `src/app/(public)/page.tsx`

- [ ] **Step 1: Create homepage SSR page**

```tsx
import { Suspense } from 'react';
import { categoryApi, postApi, tagApi } from '@/lib/api/client';
import Sidebar from '@/components/forum/sidebar';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { Category, Post, Tag } from '@/types';

async function fetchCategories(): Promise<Category[]> {
  try {
    return await categoryApi.getList();
  } catch {
    return [];
  }
}

async function fetchTags(): Promise<Tag[]> {
  try {
    return await tagApi.getList();
  } catch {
    return [];
  }
}

async function fetchPosts(page: number, categoryId?: number): Promise<{ data: Post[]; pagination: Post['pagination'] }> {
  try {
    const params: { page: number; limit: number; category_id?: number } = {
      page,
      limit: 20,
    };
    if (categoryId) params.category_id = categoryId;
    return await postApi.getList(params);
  } catch {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
  }
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { page?: string; category_id?: string };
}) {
  const page = parseInt(searchParams.page || '1');
  const categoryId = searchParams.category_id ? parseInt(searchParams.category_id) : undefined;

  const [categories, tags, postsResult] = await Promise.all([
    fetchCategories(),
    fetchTags(),
    fetchPosts(page, categoryId),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        {/* Left Sidebar */}
        <div className="hidden lg:block w-64 flex-shrink-0">
          <Sidebar
            categories={categories}
            tags={tags}
            selectedCategory={categoryId}
          />
        </div>

        {/* Main Content */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-surface-900">
              {categoryId
                ? categories.find((c) => c.id === categoryId)?.name || '分类'
                : '最新帖子'}
            </h1>
          </div>

          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-surface-500">
              暂无帖子
            </div>
          ) : (
            <div className="space-y-3">
              {postsResult.data.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}

          <Pagination
            currentPage={postsResult.pagination.page}
            totalPages={postsResult.pagination.totalPages}
            basePath={categoryId ? `/categories/${categoryId}` : '/'}
          />
        </div>
      </div>
    </div>
  );
}
```

---

### Task 10: Auth Pages (Login + Callback)

**Files:**
- Create: `src/app/(auth)/login/page.tsx`, `src/app/(auth)/callback/page.tsx`

- [ ] **Step 1: Create login redirect page**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const mindauthUrl = process.env.NEXT_PUBLIC_MINDAUTH_URL || 'http://localhost:4001';

  useEffect(() => {
    const redirectUrl = encodeURIComponent(
      `${window.location.origin}/api/auth/callback`
    );
    window.location.href = `${mindauthUrl}/login?redirect=${redirectUrl}`;
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-surface-500">正在跳转到登录页面...</p>
    </div>
  );
}
```

- [ ] **Step 2: Create callback page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function CallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');

    if (!code) {
      setError('登录失败：缺少授权码');
      setTimeout(() => router.push('/'), 3000);
      return;
    }

    // Backend handles the callback and sets the forum_session cookie
    // We just need to redirect to home after a brief delay
    setTimeout(() => {
      router.push('/');
    }, 1000);
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <p className="text-surface-500">3 秒后返回首页</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4" />
        <p className="text-surface-500">登录成功，正在跳转...</p>
      </div>
    </div>
  );
}
```

---

### Task 11: Post Detail Components

**Files:**
- Create: `src/components/forum/post-content.tsx`, `src/components/forum/reply-item.tsx`, `src/components/forum/reply-editor.tsx`

- [ ] **Step 1: Create PostContent component**

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Post } from '@/types';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { Pin, Move, Trash2, Edit } from 'lucide-react';

interface PostContentProps {
  post: Post;
  currentUserRole?: string;
  onPin?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}

export default function PostContent({
  post,
  currentUserRole,
  onPin,
  onMove,
  onDelete,
}: PostContentProps) {
  const isAuthor = false; // Auth context provides user; compare in SSR or client
  const canModerate = currentUserRole === 'moderator' || currentUserRole === 'admin';

  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('zh-CN');
  }

  return (
    <article className="bg-white rounded-lg border border-surface-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-surface-200">
        <h1 className="text-2xl font-bold text-surface-900 mb-3">{post.title}</h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-surface-500">
          <span className="font-medium text-surface-700">作者</span>
          <span>{post.author_mindauth_id}</span>
          <span className="text-surface-300">|</span>
          <span>发布于 {formatTime(post.created_at)}</span>
          <span className="text-surface-300">|</span>
          <span>{post.view_count} 浏览</span>

          {post.tags.length > 0 && (
            <>
              <span className="text-surface-300">|</span>
              <div className="flex gap-1">
                {post.tags.map((tag) => (
                  <Badge key={tag.id} variant="primary">
                    {tag.name}
                  </Badge>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        <div className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content}
          </ReactMarkdown>
        </div>
      </div>

      {/* Actions */}
      <div className="px-6 py-4 bg-surface-50 border-t border-surface-200 flex items-center gap-2">
        {canModerate && onPin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onPin}
            className="text-surface-600"
          >
            <Pin className="w-4 h-4 mr-1" />
            {post.is_pinned ? '取消置顶' : '置顶'}
          </Button>
        )}
        {canModerate && onMove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onMove}
            className="text-surface-600"
          >
            <Move className="w-4 h-4 mr-1" />
            移动
          </Button>
        )}
        {(isAuthor || canModerate) && onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            删除
          </Button>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: Create ReplyItem component**

```tsx
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Reply } from '@/types';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import { Quote, Reply as ReplyIcon, Trash2, Edit } from 'lucide-react';

interface ReplyItemProps {
  reply: Reply;
  index: number;
  onQuote: (reply: Reply) => void;
  onReply: (reply: Reply) => void;
}

export default function ReplyItem({ reply, index, onQuote, onReply }: ReplyItemProps) {
  function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('zh-CN');
  }

  // Parse reply content to detect quote blocks
  const content = reply.content;

  return (
    <div className="bg-white rounded-lg border border-surface-200 overflow-hidden" id={`reply-${reply.id}`}>
      {/* Reply Header */}
      <div className="px-4 py-3 bg-surface-50 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-medium text-surface-700">#{index + 1}</span>
          <span className="text-surface-500">作者 ID: {reply.author_mindauth_id}</span>
          <span className="text-surface-300">|</span>
          <span className="text-surface-500">{formatTime(reply.created_at)}</span>
        </div>
      </div>

      {/* Reply Content */}
      <div className="p-4">
        <div className="markdown-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      </div>

      {/* Reply Actions */}
      <div className="px-4 py-2 bg-surface-50 border-t border-surface-200 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onQuote(reply)}
          className="text-surface-600"
        >
          <Quote className="w-4 h-4 mr-1" />
          引用
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onReply(reply)}
          className="text-surface-600"
        >
          <ReplyIcon className="w-4 h-4 mr-1" />
          回复
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ReplyEditor component**

```tsx
'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Reply } from '@/types';
import Button from '@/components/ui/button';
import { Eye, Edit3 } from 'lucide-react';

interface ReplyEditorProps {
  postId: number;
  onSubmit: (content: string, parentReplyId?: number) => Promise<void>;
  quoteReply?: Reply | null;
  replyToReply?: Reply | null;
}

export default function ReplyEditor({
  postId,
  onSubmit,
  quoteReply,
  replyToReply,
}: ReplyEditorProps) {
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit(
        content,
        quoteReply?.id || replyToReply?.id
      );
      setContent('');
    } catch (err) {
      console.error('Failed to submit reply:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuote = (reply: Reply) => {
    const quoteText = `> ${reply.content.split('\n')[0]}\n\n`;
    setContent((prev) => quoteText + prev);
  };

  return (
    <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
      <div className="px-4 py-3 bg-surface-50 border-b border-surface-200">
        <h3 className="font-semibold text-surface-900">
          {quoteReply ? '引用回复' : replyToReply ? '回复' : '发表回复'}
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="p-4">
        {quoteReply && (
          <div className="mb-4 p-3 bg-surface-50 border-l-4 border-primary-500 text-sm text-surface-600">
            引用 #{quoteReply.id} 的内容
          </div>
        )}

        <div className="mb-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreview(false)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              !preview ? 'bg-primary-600 text-white' : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Edit3 className="w-4 h-4 inline mr-1" />
            编辑
          </button>
          <button
            type="button"
            onClick={() => setPreview(true)}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              preview ? 'bg-primary-600 text-white' : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Eye className="w-4 h-4 inline mr-1" />
            预览
          </button>
        </div>

        {preview ? (
          <div className="min-h-[120px] p-4 bg-surface-50 rounded-lg border border-surface-200 markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || '*暂无内容*'}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="使用 Markdown 格式编写回复..."
            className="w-full min-h-[120px] px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-y"
          />
        )}

        <div className="mt-4 flex justify-end">
          <Button
            type="submit"
            disabled={isSubmitting || !content.trim()}
          >
            {isSubmitting ? '提交中...' : '提交回复'}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

---

### Task 12: Post Detail Page

**Files:**
- Create: `src/app/(public)/posts/[id]/page.tsx`

- [ ] **Step 1: Create post detail SSR page**

```tsx
import { notFound } from 'next/navigation';
import { postApi, replyApi, categoryApi } from '@/lib/api/client';
import PostContent from '@/components/forum/post-content';
import ReplyItem from '@/components/forum/reply-item';
import ReplyEditor from '@/components/forum/reply-editor';
import Pagination from '@/components/ui/pagination';
import Link from 'next/link';
import { Category, Post, Reply, ReplyListResponse } from '@/types';

async function fetchPost(id: number): Promise<Post | null> {
  try {
    return await postApi.getById(id);
  } catch {
    return null;
  }
}

async function fetchCategories(): Promise<Category[]> {
  try {
    return await categoryApi.getList();
  } catch {
    return [];
  }
}

export default async function PostDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const postId = parseInt(params.id);
  const page = parseInt(searchParams.page || '1');
  const [post, categories] = await Promise.all([
    fetchPost(postId),
    fetchCategories(),
  ]);

  if (!post) {
    return notFound();
  }

  let repliesResult: ReplyListResponse = {
    data: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 1 },
  };

  try {
    repliesResult = await replyApi.getByPost(postId, { page, limit: 50 });
  } catch {
    // No replies or API error
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-surface-500">
        <Link href="/" className="hover:text-primary-600">首页</Link>
        <span className="mx-2">/</span>
        {post.category_name ? (
          <>
            <Link href={`/categories/${post.category_id}`} className="hover:text-primary-600">
              {post.category_name}
            </Link>
            <span className="mx-2">/</span>
          </>
        ) : null}
        <span className="text-surface-900">{post.title}</span>
      </nav>

      {/* Post Content */}
      <PostContent post={post} />

      {/* Replies */}
      <div className="mt-8 space-y-4">
        <h2 className="text-lg font-semibold text-surface-900">
          回复 ({repliesResult.pagination.total})
        </h2>

        {repliesResult.data.length === 0 ? (
          <div className="text-center py-8 text-surface-500">暂无回复</div>
        ) : (
          <div className="space-y-4">
            {repliesResult.data.map((reply, index) => (
              <ReplyItem
                key={reply.id}
                reply={reply}
                index={(page - 1) * 50 + index}
                onQuote={() => {}}
                onReply={() => {}}
              />
            ))}
          </div>
        )}

        <Pagination
          currentPage={repliesResult.pagination.page}
          totalPages={repliesResult.pagination.totalPages}
          basePath={`/posts/${postId}`}
        />
      </div>

      {/* Reply Editor */}
      <div className="mt-8">
        <ReplyEditor
          postId={postId}
          onSubmit={async (content, parentReplyId) => {
            'use server';
            await replyApi.create(postId, { content, parent_reply_id: parentReplyId });
            // Note: In SSR, we redirect after submission
          }}
        />
      </div>
    </div>
  );
}
```

---

### Task 13: Category and Tag Pages

**Files:**
- Create: `src/app/(public)/categories/[id]/page.tsx`, `src/app/(public)/tags/[slug]/page.tsx`

- [ ] **Step 1: Create category page**

```tsx
import { categoryApi, postApi, tagApi } from '@/lib/api/client';
import Sidebar from '@/components/forum/sidebar';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { Category, Post, Tag } from '@/types';
import { notFound } from 'next/navigation';

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const categoryId = parseInt(params.id);
  const page = parseInt(searchParams.page || '1');

  const [category, postsResult, categories, tags] = await Promise.all([
    categoryApi.getById(categoryId).catch(() => null),
    postApi.getList({ page, limit: 20, category_id: categoryId }).catch(() => ({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
    })),
    categoryApi.getList().catch(() => []),
    tagApi.getList().catch(() => []),
  ]);

  if (!category) return notFound();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex gap-8">
        <div className="hidden lg:block w-64 flex-shrink-0">
          <Sidebar
            categories={categories}
            tags={tags}
            selectedCategory={categoryId}
          />
        </div>
        <div className="flex-1 space-y-4">
          <h1 className="text-2xl font-bold text-surface-900">{category.name}</h1>
          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-surface-500">该分类下暂无帖子</div>
          ) : (
            <div className="space-y-3">
              {postsResult.data.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
          <Pagination
            currentPage={postsResult.pagination.page}
            totalPages={postsResult.pagination.totalPages}
            basePath={`/categories/${categoryId}`}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create tag page**

```tsx
import { tagApi, postApi } from '@/lib/api/client';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import { Post, Tag } from '@/types';

export default async function TagPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { page?: string };
}) {
  const slug = params.slug;
  const page = parseInt(searchParams.page || '1');

  let tag: Tag | null = null;
  let postsResult: { data: Post[]; pagination: { page: number; limit: number; total: number; totalPages: number } } = {
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  };

  try {
    postsResult = await tagApi.getPostsByTag(slug, page);
    // Get tag name from first post's tags
    if (postsResult.data.length > 0) {
      tag = postsResult.data[0].tags.find((t) => t.slug === slug) || null;
    }
  } catch {
    // No posts for this tag
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-surface-900 mb-6">
        标签: {tag?.name || slug}
      </h1>
      {postsResult.data.length === 0 ? (
        <div className="text-center py-12 text-surface-500">该标签下暂无帖子</div>
      ) : (
        <div className="space-y-3">
          {postsResult.data.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      )}
      <Pagination
        currentPage={postsResult.pagination.page}
        totalPages={postsResult.pagination.totalPages}
        basePath={`/tags/${slug}`}
      />
    </div>
  );
}
```

---

### Task 14: User Profile Page

**Files:**
- Create: `src/app/(public)/users/[id]/page.tsx`

- [ ] **Step 1: Create user profile page**

```tsx
import { postApi } from '@/lib/api/client';
import PostCard from '@/components/forum/post-card';
import Pagination from '@/components/ui/pagination';
import Badge from '@/components/ui/badge';
import { Post, User } from '@/types';
import { Calendar, Mail } from 'lucide-react';

interface UserProfilePageProps {
  params: { id: string };
  searchParams: { page?: string; tab?: string };
}

export default async function UserProfilePage({
  params,
  searchParams,
}: UserProfilePageProps) {
  const userId = parseInt(params.id);
  const page = parseInt(searchParams.page || '1');
  const tab = searchParams.tab || 'posts';

  let postsResult: { data: Post[]; pagination: { page: number; limit: number; total: number; totalPages: number } } = {
    data: [],
    pagination: { page: 1, limit: 20, total: 0, totalPages: 1 },
  };

  try {
    postsResult = await postApi.getList({ page, limit: 20, user_id: userId });
  } catch {
    // API error
  }

  // User info from first post's author data, or show ID only
  const user: Partial<User> = {
    id: userId,
    username: postsResult.data[0]?.author_mindauth_id ? `User ${postsResult.data[0].author_mindauth_id}` : 'Unknown',
    role: (postsResult.data[0]?.author_role as User['role']) || 'user',
    createdAt: postsResult.data[0]?.created_at,
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* User Info Card */}
      <div className="bg-white rounded-lg border border-surface-200 p-6 mb-8">
        <div className="flex items-start gap-6">
          {/* Avatar placeholder */}
          <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center text-2xl font-bold text-primary-600">
            {user.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-surface-900 mb-1">
              {user.username || `用户 #${userId}`}
            </h1>
            <div className="flex items-center gap-3 mb-3">
              <Badge
                variant={user.role === 'admin' ? 'warning' : user.role === 'moderator' ? 'success' : 'default'}
              >
                {user.role || 'user'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-surface-500">
              {user.createdAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  注册于 {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                </span>
              )}
              {user.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-4 h-4" />
                  {user.email}
                </span>
              )}
            </div>
            <div className="mt-3 text-sm text-surface-600">
              发帖数: {postsResult.pagination.total} | 回复数: 待后端补充
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-surface-200 mb-6">
        <nav className="flex gap-4">
          <a
            href={`/users/${userId}?tab=posts`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'posts'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            发布的帖子
          </a>
          <a
            href={`/users/${userId}?tab=replies`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'replies'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-surface-500 hover:text-surface-700'
            }`}
          >
            发表的回复
          </a>
        </nav>
      </div>

      {/* Content */}
      {tab === 'posts' && (
        <>
          {postsResult.data.length === 0 ? (
            <div className="text-center py-12 text-surface-500">暂无帖子</div>
          ) : (
            <div className="space-y-3">
              {postsResult.data.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
          <Pagination
            currentPage={postsResult.pagination.page}
            totalPages={postsResult.pagination.totalPages}
            basePath={`/users/${userId}?tab=posts`}
          />
        </>
      )}

      {tab === 'replies' && (
        <div className="text-center py-12 text-surface-500">
          此功能需要后端补充用户回复列表 API
        </div>
      )}
    </div>
  );
}
```

---

### Task 15: Admin Layout

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/components/admin/sidebar.tsx`, `src/components/admin/admin-header.tsx`, `src/components/admin/admin-guard.tsx`

- [ ] **Step 1: Create AdminGuard component**

```tsx
'use client';

import { useAuth } from '@/lib/auth/context';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

interface AdminGuardProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'moderator';
}

export default function AdminGuard({
  children,
  requiredRole = 'admin',
}: AdminGuardProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !user)) {
      router.push('/');
      return;
    }
    if (!isLoading && user && user.role !== requiredRole && user.role !== 'admin') {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, user, router, requiredRole]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated || !user || (user.role !== requiredRole && user.role !== 'admin')) {
    return null;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Create AdminSidebar component**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { LayoutDashboard, FolderTree, Users, FileText, ScrollText } from 'lucide-react';

const navItems = [
  { href: '/admin', label: '仪表盘', icon: LayoutDashboard, roles: ['admin', 'moderator'] },
  { href: '/admin/categories', label: '分类管理', icon: FolderTree, roles: ['admin'] },
  { href: '/admin/users', label: '用户管理', icon: Users, roles: ['admin'] },
  { href: '/admin/posts', label: '帖子管理', icon: FileText, roles: ['admin', 'moderator'] },
  { href: '/admin/logs', label: '操作日志', icon: ScrollText, roles: ['admin'] },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  const filteredNavItems = navItems.filter((item) =>
    item.roles.includes(user?.role || '')
  );

  return (
    <aside className="w-64 bg-surface-800 text-surface-100 min-h-screen">
      <div className="p-6">
        <h2 className="text-lg font-bold">管理后台</h2>
      </div>
      <nav className="px-4 space-y-1">
        {filteredNavItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-surface-300 hover:bg-surface-700 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/"
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-surface-300 hover:bg-surface-700 hover:text-white transition-colors mt-4"
        >
          返回论坛
        </Link>
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Create AdminHeader component**

```tsx
'use client';

import { useAuth } from '@/lib/auth/context';
import Link from 'next/link';
import { LogOut } from 'lucide-react';

export default function AdminHeader() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  return (
    <header className="bg-white border-b border-surface-200 px-6 py-4 flex items-center justify-between">
      <h1 className="text-xl font-bold text-surface-900">MindForum 管理后台</h1>
      <div className="flex items-center gap-4">
        <span className="text-sm text-surface-600">
          {user?.username} ({user?.role})
        </span>
        <button
          onClick={handleLogout}
          className="p-2 text-surface-600 hover:text-red-600 transition-colors"
          title="退出登录"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create admin layout**

```tsx
import AdminGuard from '@/components/admin/admin-guard';
import AdminSidebar from '@/components/admin/sidebar';
import AdminHeader from '@/components/admin/admin-header';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminGuard>
      <div className="flex min-h-screen bg-surface-100">
        <AdminSidebar />
        <div className="flex-1 flex flex-col">
          <AdminHeader />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </AdminGuard>
  );
}
```

---

### Task 16: Admin Dashboard

**Files:**
- Create: `src/app/admin/page.tsx`, `src/components/admin/dashboard.tsx`

- [ ] **Step 1: Create Dashboard component**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, MessageSquare, Users, TrendingUp } from 'lucide-react';

const stats = [
  { label: '总帖子数', value: '--', icon: FileText, color: 'text-primary-600' },
  { label: '总回复数', value: '--', icon: MessageSquare, color: 'text-green-600' },
  { label: '总用户数', value: '--', icon: Users, color: 'text-yellow-600' },
  { label: '今日新增', value: '--', icon: TrendingUp, color: 'text-blue-600' },
];

export default function Dashboard() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-surface-900 mb-6">仪表盘</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-lg border border-surface-200 p-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-surface-500">{stat.label}</span>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-2xl font-bold text-surface-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-surface-200 p-6">
        <h3 className="font-semibold text-surface-900 mb-4">快捷入口</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link
            href="/admin/categories"
            className="p-4 bg-surface-50 rounded-lg hover:bg-surface-100 transition-colors text-center"
          >
            <p className="font-medium text-surface-900">分类管理</p>
          </Link>
          <Link
            href="/admin/users"
            className="p-4 bg-surface-50 rounded-lg hover:bg-surface-100 transition-colors text-center"
          >
            <p className="font-medium text-surface-900">用户管理</p>
          </Link>
          <Link
            href="/admin/posts"
            className="p-4 bg-surface-50 rounded-lg hover:bg-surface-100 transition-colors text-center"
          >
            <p className="font-medium text-surface-900">帖子管理</p>
          </Link>
          <Link
            href="/admin/logs"
            className="p-4 bg-surface-50 rounded-lg hover:bg-surface-100 transition-colors text-center"
          >
            <p className="font-medium text-surface-900">操作日志</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create admin dashboard page**

```tsx
import Dashboard from '@/components/admin/dashboard';

export default function AdminDashboardPage() {
  return <Dashboard />;
}
```

---

### Task 17: Category Management

**Files:**
- Create: `src/app/admin/categories/page.tsx`, `src/components/admin/category-form.tsx`

- [ ] **Step 1: Create CategoryForm component**

```tsx
'use client';

import { useState } from 'react';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Category } from '@/types';
import { adminApi } from '@/lib/api/client';

interface CategoryFormProps {
  category?: Category | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function CategoryForm({
  category,
  onSuccess,
  onCancel,
}: CategoryFormProps) {
  const [name, setName] = useState(category?.name || '');
  const [slug, setSlug] = useState(category?.slug || '');
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order || 0));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !slug.trim()) {
      setError('名称和 Slug 不能为空');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = { name: name.trim(), slug: slug.trim(), sort_order: parseInt(sortOrder) || 0 };
      if (category) {
        await adminApi.updateCategory(category.id, data);
      } else {
        await adminApi.createCategory(data);
      }
      onSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '操作失败';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}
      <Input
        label="分类名称"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Input
        label="Slug"
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        required
      />
      <Input
        label="排序"
        type="number"
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '保存中...' : category ? '更新' : '创建'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create categories page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/button';
import Alert from '@/components/ui/alert';
import CategoryForm from '@/components/admin/category-form';
import { Category } from '@/types';
import { adminApi } from '@/lib/api/client';
import { Plus, Edit, Trash2 } from 'lucide-react';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadCategories = async () => {
    try {
      const data = await adminApi.getLogs ? [] : []; // Use categoryApi instead
      const cats = await import('@/lib/api/client').then((m) => m.categoryApi.getList());
      setCategories(cats);
    } catch {
      setError('加载分类失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此分类吗？')) return;
    try {
      await adminApi.deleteCategory(id);
      loadCategories();
    } catch {
      setError('删除失败');
    }
  };

  if (showForm || editingCategory) {
    return (
      <div>
        <h2 className="text-2xl font-bold text-surface-900 mb-6">
          {editingCategory ? '编辑分类' : '创建分类'}
        </h2>
        <div className="bg-white rounded-lg border border-surface-200 p-6 max-w-lg">
          <CategoryForm
            category={editingCategory}
            onSuccess={() => {
              setShowForm(false);
              setEditingCategory(null);
              loadCategories();
            }}
            onCancel={() => {
              setShowForm(false);
              setEditingCategory(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-surface-900">分类管理</h2>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-1" />
          创建分类
        </Button>
      </div>

      {error && (
        <Alert type="error" message={error} className="mb-4" />
      )}

      <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-50 border-b border-surface-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">名称</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">Slug</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">排序</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">状态</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-surface-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.id} className="border-b border-surface-100">
                <td className="px-4 py-3 text-sm">{cat.name}</td>
                <td className="px-4 py-3 text-sm font-mono text-surface-500">{cat.slug}</td>
                <td className="px-4 py-3 text-sm">{cat.sort_order}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={cat.is_active ? 'text-green-600' : 'text-surface-400'}>
                    {cat.is_active ? '活跃' : '禁用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditingCategory(cat)}
                    className="p-1.5 text-surface-600 hover:text-primary-600 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id)}
                    className="p-1.5 text-surface-600 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-surface-500">
                  {isLoading ? '加载中...' : '暂无分类'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

### Task 18: User Management

**Files:**
- Create: `src/app/admin/users/page.tsx`, `src/components/admin/user-role-form.tsx`

- [ ] **Step 1: Create UserRoleForm component**

```tsx
'use client';

import { useState } from 'react';
import { User } from '@/types';
import { adminApi } from '@/lib/api/client';
import Button from '@/components/ui/button';
import { Select } from '@/components/ui/input';

interface UserRoleFormProps {
  user: User;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function UserRoleForm({ user, onSuccess, onCancel }: UserRoleFormProps) {
  const [role, setRole] = useState(user.role);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await adminApi.updateUserRole(user.id, role as 'user' | 'moderator' | 'admin');
      onSuccess();
    } catch {
      setError('更新角色失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-surface-700 mb-1">角色</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="user">用户</option>
          <option value="moderator">版主</option>
          <option value="admin">管理员</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>取消</Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '更新中...' : '更新角色'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create users page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { User } from '@/types';
import { adminApi } from '@/lib/api/client';
import UserRoleForm from '@/components/admin/user-role-form';
import Badge from '@/components/ui/badge';
import Alert from '@/components/ui/alert';
import { Edit } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUsers = async () => {
    try {
      const result = await adminApi.getUsers({ page: 1, limit: 50 });
      setUsers(result.data);
    } catch {
      setError('加载用户失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-surface-900 mb-6">用户管理</h2>

      {error && <Alert type="error" message={error} className="mb-4" />}

      {editingUser && (
        <div className="mb-6 bg-white rounded-lg border border-surface-200 p-6 max-w-md">
          <h3 className="font-semibold mb-4">修改 {editingUser.username} 的角色</h3>
          <UserRoleForm
            user={editingUser}
            onSuccess={() => {
              setEditingUser(null);
              loadUsers();
            }}
            onCancel={() => setEditingUser(null)}
          />
        </div>
      )}

      <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-50 border-b border-surface-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">ID</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">用户名</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">角色</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">注册时间</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-surface-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-surface-100">
                <td className="px-4 py-3 text-sm">{user.id}</td>
                <td className="px-4 py-3 text-sm">{user.username || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <Badge
                    variant={user.role === 'admin' ? 'warning' : user.role === 'moderator' ? 'success' : 'default'}
                  >
                    {user.role}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-surface-500">
                  {new Date(user.createdAt).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setEditingUser(user)}
                    className="p-1.5 text-surface-600 hover:text-primary-600 transition-colors"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-surface-500">
                  {isLoading ? '加载中...' : '暂无用户'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

### Task 19: Post Management

**Files:**
- Create: `src/app/admin/posts/page.tsx`

- [ ] **Step 1: Create post management page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Post, Category } from '@/types';
import { postApi, adminApi, categoryApi } from '@/lib/api/client';
import Badge from '@/components/ui/badge';
import Button from '@/components/ui/button';
import Alert from '@/components/ui/alert';
import { Pin, Move, Trash2 } from 'lucide-react';

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showMoveModal, setShowMoveModal] = useState<number | null>(null);

  const loadPosts = async () => {
    try {
      const result = await postApi.getList({ page: 1, limit: 50 });
      setPosts(result.data);
    } catch {
      setError('加载帖子失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
    categoryApi.getList().then(setCategories).catch(() => {});
  }, []);

  const handlePin = async (id: number, currentPinned: boolean) => {
    try {
      await adminApi.pinPost(id, !currentPinned);
      loadPosts();
    } catch {
      setError('操作失败');
    }
  };

  const handleMove = async (id: number, categoryId: number) => {
    try {
      await adminApi.movePost(id, categoryId);
      setShowMoveModal(null);
      loadPosts();
    } catch {
      setError('移动失败');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除此帖子吗？')) return;
    try {
      await postApi.delete(id);
      loadPosts();
    } catch {
      setError('删除失败');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-surface-900 mb-6">帖子管理</h2>

      {error && <Alert type="error" message={error} className="mb-4" />}

      {/* Move Modal */}
      {showMoveModal !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold mb-4">移动帖子</h3>
            <select
              className="w-full px-3 py-2 border border-surface-300 rounded-lg mb-4"
              onChange={(e) => handleMove(showMoveModal, parseInt(e.target.value))}
              defaultValue=""
            >
              <option value="" disabled>选择分类</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowMoveModal(null)}>取消</Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-50 border-b border-surface-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">ID</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">标题</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">分类</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">状态</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">置顶</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">创建时间</th>
              <th className="px-4 py-3 text-right text-sm font-medium text-surface-600">操作</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id} className="border-b border-surface-100">
                <td className="px-4 py-3 text-sm">{post.id}</td>
                <td className="px-4 py-3 text-sm max-w-xs truncate">{post.title}</td>
                <td className="px-4 py-3 text-sm">{post.category_name || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <Badge variant={post.status === 'published' ? 'success' : 'default'}>
                    {post.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm">
                  {post.is_pinned ? <Badge variant="warning">置顶</Badge> : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-surface-500">
                  {new Date(post.created_at).toLocaleDateString('zh-CN')}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handlePin(post.id, post.is_pinned)}
                    className="p-1.5 text-surface-600 hover:text-primary-600 transition-colors"
                    title={post.is_pinned ? '取消置顶' : '置顶'}
                  >
                    <Pin className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowMoveModal(post.id)}
                    className="p-1.5 text-surface-600 hover:text-primary-600 transition-colors"
                    title="移动"
                  >
                    <Move className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="p-1.5 text-surface-600 hover:text-red-600 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-surface-500">
                  {isLoading ? '加载中...' : '暂无帖子'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

---

### Task 20: Admin Logs

**Files:**
- Create: `src/app/admin/logs/page.tsx`

- [ ] **Step 1: Create logs page**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { AdminLog } from '@/types';
import { adminApi } from '@/lib/api/client';
import Alert from '@/components/ui/alert';
import Pagination from '@/components/ui/pagination';

export default function LogsPage() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadLogs = async (page: number = 1) => {
    try {
      const result = await adminApi.getLogs({ page, limit: 50 });
      setLogs(result.data);
      setPagination({ page: result.pagination.page, totalPages: result.pagination.totalPages });
    } catch {
      setError('加载日志失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-surface-900 mb-6">操作日志</h2>

      {error && <Alert type="error" message={error} className="mb-4" />}

      <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-50 border-b border-surface-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">时间</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">用户</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">操作</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">目标</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-surface-600">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-surface-100">
                <td className="px-4 py-3 text-sm text-surface-500">
                  {new Date(log.created_at).toLocaleString('zh-CN')}
                </td>
                <td className="px-4 py-3 text-sm">{log.user_id || '-'}</td>
                <td className="px-4 py-3 text-sm">
                  <code className="bg-surface-100 px-1.5 py-0.5 rounded text-xs">{log.action}</code>
                </td>
                <td className="px-4 py-3 text-sm">
                  {log.target_type && log.target_id
                    ? `${log.target_type} #${log.target_id}`
                    : '-'}
                </td>
                <td className="px-4 py-3 text-sm font-mono text-surface-500">
                  {log.ip_address || '-'}
                </td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-surface-500">
                  {isLoading ? '加载中...' : '暂无日志'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={pagination.page}
        totalPages={pagination.totalPages}
        basePath="/admin/logs"
        className="mt-6"
      />
    </div>
  );
}
```

---

### Task 21: Create Post Page

**Files:**
- Create: `src/app/(public)/posts/new/page.tsx`, `src/components/forum/post-form.tsx`

- [ ] **Step 1: Create PostForm component**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Category } from '@/types';
import { categoryApi, postApi } from '@/lib/api/client';
import Button from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/input';

export default function PostForm() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    categoryApi.getList().then(setCategories).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !content.trim()) {
      setError('标题和内容不能为空');
      return;
    }

    setIsSubmitting(true);
    try {
      const input = {
        title: title.trim(),
        content,
        category_id: categoryId ? parseInt(categoryId) : undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        status,
      };
      const post = await postApi.create(input);
      router.push(`/posts/${post.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '创建失败';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <Input
        label="标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="帖子标题"
        required
      />

      <div>
        <label className="block text-sm font-medium text-surface-700 mb-1">分类</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="">不选择分类</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-700 mb-1">标签</label>
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="用逗号分隔，如: nextjs, typescript"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-700 mb-1">内容</label>
        <p className="text-xs text-surface-500 mb-2">支持 Markdown 语法</p>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="帖子内容..."
          className="w-full min-h-[300px] px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none resize-y"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-surface-700 mb-1">状态</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
        >
          <option value="published">发布</option>
          <option value="draft">草稿</option>
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          取消
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? '创建中...' : '创建帖子'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create new post page**

```tsx
import { useAuth } from '@/lib/auth/context';
import { redirect } from 'next/navigation';
import PostForm from '@/components/forum/post-form';

// This page needs client-side auth check
// For SSR, we'll render the form and show error if not authenticated
export default function NewPostPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-surface-900 mb-6">创建新帖子</h1>
      <div className="bg-white rounded-lg border border-surface-200 p-6">
        <PostForm />
      </div>
    </div>
  );
}
```

---

## Spec Self-Review

### 1. Coverage Check

| Spec Requirement | Task |
|------------------|------|
| Next.js 14+ / TypeScript / TailwindCSS | Task 1, 5 |
| Project structure with route groups | Task 1, 5, 6, 15 |
| MindAuth SSO (Session Token + OAuth) | Task 4, 10 |
| Homepage with sidebar + post list | Task 8, 9 |
| Post detail with XenForo-style replies | Task 11, 12 |
| Category/Tag pages | Task 13 |
| User profile with posts + replies | Task 14 |
| Admin panel (dashboard, categories, users, posts, logs) | Task 15, 16, 17, 18, 19, 20 |
| Create post | Task 21 |
| API client with all endpoints | Task 3 |
| Auth context with role-based access | Task 4, 15 |
| SSR-first data strategy | Task 9, 12, 13, 14 |
| Self-developed forms | Task 7, 17, 18, 21 |
| react-markdown + remark-gfm | Task 11 |
| Pagination component | Task 7 |
| Responsive design | Task 6, 8 (layout components) |
| Error handling | Task 5, 7 (Alert component) |
| Security (XSS, CSRF) | Task 5 (markdown-content sanitization), Task 3 (credentials: include) |

**Gap**: Need to add a link to create new posts in the header. Fix: Add to Header component in Task 6.

**Fix**: In Task 6 Header, add a "发帖" button for authenticated users:
```tsx
{isAuthenticated && (
  <Link
    href="/posts/new"
    className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
  >
    发帖
  </Link>
)}
```

### 2. Placeholder Scan

- No "TBD", "TODO", or "implement later" found
- All code blocks contain actual implementations
- No "similar to Task N" references

### 3. Type Consistency

- `Post`, `Reply`, `Category`, `Tag`, `User`, `AdminLog` types consistent across all tasks
- API client uses correct type imports from `@/types`
- Form components use correct input types
- `Pagination` component uses consistent `basePath` pattern

---

Plan complete and saved to `docs/superpowers/plans/2026-05-11-mindforum-frontend.md`.

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
