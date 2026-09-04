/**
 * ResourcesPage responsive layout tests
 *
 * NOTE: This project currently has no Jest/Vitest/RTL test runner configured.
 * `npm test` runs `tsc --noEmit` only. These tests document the expected
 * behavior and will become executable once a test framework is added.
 *
 * Expected setup: Vitest + @testing-library/react + jsdom
 *
 * Task 3 of layout-responsive plan.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ResourcesLayout from '@/app/(public)/resources/layout';

describe('ResourcesPage', () => {
  it('should wrap children in a container with overflow protection', () => {
    render(
      <ResourcesLayout>
        <div data-testid="child">Content</div>
      </ResourcesLayout>
    );

    const container = screen.getByTestId('resources-container');
    expect(container).toBeInTheDocument();

    const styles = window.getComputedStyle(container);
    expect(styles.overflowX).toBe('hidden');
    expect(styles.minWidth).toBe('0px');
  });

  it('should have stable test id on container', () => {
    render(
      <ResourcesLayout>
        <span>Test</span>
      </ResourcesLayout>
    );

    expect(screen.getByTestId('resources-container')).toBeInTheDocument();
  });

  it('should render children inside the container', () => {
    render(
      <ResourcesLayout>
        <div data-testid="child-content">Hello</div>
      </ResourcesLayout>
    );

    const container = screen.getByTestId('resources-container');
    expect(container.querySelector('[data-testid="child-content"]')).toBeTruthy();
  });

  it('should use CSS classes for responsive behavior, not inline styles', () => {
    render(
      <ResourcesLayout>
        <span>Test</span>
      </ResourcesLayout>
    );

    const container = screen.getByTestId('resources-container');
    // Should use Tailwind classes, not inline styles
    expect(container.style.overflowX).toBe('');
    expect(container.style.minWidth).toBe('');
    expect(container.className).toMatch(/min-w-0/);
    expect(container.className).toMatch(/overflow-x-hidden/);
  });
});
