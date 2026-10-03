import React from 'react';
import { renderToStaticMarkup } from '../../frontend/node_modules/react-dom/server';
import ActiveUsersMetric from '@/components/admin/active-users-metric';

describe('dashboard active-user observation window', () => {
  it('shows a partial count with its starting time rather than claiming a complete 24-hour window', () => {
    const html = renderToStaticMarkup(React.createElement(ActiveUsersMetric, { stats: { active_24h: 12, active_24h_complete: false, active_24h_observed_since: '2026-10-03T01:00:00Z' } }));
    expect(html).toContain('活跃用户（观察中）');
    expect(html).toContain('满 24 小时后显示完整窗口');
    expect(html).toContain('2026/10/3 09:00:00');
    expect(html).toContain('>12<');
    expect(html).not.toContain('24 小时活跃用户');
  });

  it('labels a complete rolling window and states deduplication across devices', () => {
    const html = renderToStaticMarkup(React.createElement(ActiveUsersMetric, { stats: { active_24h: 12, active_24h_complete: true, active_24h_observed_since: '2026-10-01T01:00:00Z' } }));
    expect(html).toContain('24 小时活跃用户');
    expect(html).toContain('多个设备计为一人');
    expect(html).not.toContain('观察中');
  });

  it.each([null, { active_24h: 999 }, { active_24h: 999, active_24h_complete: true, active_24h_observed_since: 'invalid' }])('does not show legacy session counts or malformed observation metadata as 24-hour activity', (stats) => {
    const html = renderToStaticMarkup(React.createElement(ActiveUsersMetric, { stats }));
    expect(html).toContain('正在等待活跃用户统计窗口');
    expect(html).not.toContain('999');
    expect(html).not.toContain('24 小时活跃用户');
  });
});
