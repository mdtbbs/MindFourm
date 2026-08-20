'use client';

import Link from 'next/link';

/** Last-resort document fallback; deliberately static so it remains usable on a weak network. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', color: '#172033', background: '#f7f8fa' }}>
        <main style={{ maxWidth: 560, margin: '18vh auto', padding: 24 }}>
          <p style={{ color: '#667085', fontWeight: 700, letterSpacing: 2 }}>MDTBBS · 服务恢复中</p>
          <h1 style={{ fontSize: 28 }}>暂时无法打开此页面</h1>
          <p style={{ color: '#475467', lineHeight: 1.7 }}>请稍后重试。我们不会展示内部错误信息；持续异常请查看论坛公告或联系管理员。</p>
          <button onClick={reset} style={{ padding: '10px 16px', border: 0, borderRadius: 8, color: '#fff', background: '#2563eb', cursor: 'pointer' }}>重试</button>
          <Link href="/" style={{ marginLeft: 16, color: '#2563eb' }}>返回首页</Link>
        </main>
      </body>
    </html>
  );
}
