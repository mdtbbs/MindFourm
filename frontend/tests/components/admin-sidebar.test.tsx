/**
 * AdminSidebar responsive tests
 *
 * NOTE: This project currently has no Jest/Vitest/RTL test runner configured.
 * `npm test` runs `tsc --noEmit` only. These tests document the expected
 * behavior and will become executable once a test framework is added.
 *
 * Expected setup: Vitest + @testing-library/react + jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

describe('AdminSidebar', () => {
  it('should have stable test id', () => {
    render(<AdminSidebar serviceName="Test" groups={[]} />);
    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument();
  });

  it('should use CSS classes for width, not inline styles', () => {
    render(<AdminSidebar serviceName="Test" groups={[]} />);
    const sidebar = screen.getByTestId('admin-sidebar');

    // Should not have inline width
    expect(sidebar.style.width).toBe('');
    expect(sidebar.style.marginLeft).toBe('');

    // Should have CSS class for width
    expect(sidebar.className).toMatch(/admin-sidebar/);
  });

  it('should accept groups prop without crashing', () => {
    const groups = [
      {
        label: 'Test Group',
        items: [
          { key: 'test', label: 'Test Item', href: '/test' },
        ],
      },
    ];
    render(<AdminSidebar serviceName="Test" groups={groups} />);
    expect(screen.getByTestId('admin-sidebar')).toBeInTheDocument();
  });

  it('should render footer content when provided', () => {
    render(
      <AdminSidebar
        serviceName="Test"
        groups={[]}
        footerContent={<span data-testid="footer">Footer</span>}
      />
    );
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });
});
