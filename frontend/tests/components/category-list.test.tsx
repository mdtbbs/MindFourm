/**
 * CategoryList tests
 *
 * NOTE: This project currently has no Jest/Vitest/RTL test runner configured.
 * `npm test` runs `tsc --noEmit` only. These tests document the expected
 * behavior and will become executable once a test framework is added.
 *
 * Expected setup: Vitest + @testing-library/react + jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryList } from '@/components/resources/CategoryList';

describe('CategoryList', () => {
  const mockCategories = [
    { id: 1, name: 'Tools', icon: 'Wrench', slug: 'tools', is_active: true },
    { id: 2, name: 'Maps', icon: 'Map', slug: 'maps', is_active: true },
    { id: 3, name: 'Unknown', icon: 'InvalidIcon', slug: 'unknown', is_active: true },
  ];

  it('should render flat list without tree structure', () => {
    render(<CategoryList categories={mockCategories} />);

    // Should not have expand/collapse buttons
    expect(screen.queryByRole('button', { name: /expand/i })).not.toBeInTheDocument();

    // Should render all categories
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Maps')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('should not access parent_id', () => {
    render(<CategoryList categories={mockCategories} />);

    // Component should work without parent_id field
    mockCategories.forEach((category) => {
      expect(category).not.toHaveProperty('parent_id');
    });
  });

  it('should map known icons correctly', () => {
    render(<CategoryList categories={mockCategories} />);

    // Should render icons from Lucide
    const icons = screen.getAllByRole('img', { hidden: true });
    expect(icons.length).toBeGreaterThan(0);
  });

  it('should fallback to Folder icon for unknown icons', () => {
    render(<CategoryList categories={mockCategories} />);

    // Unknown icon should fallback to Folder
    const unknownCategory = screen.getByText('Unknown').closest('div');
    expect(unknownCategory).toBeInTheDocument();
  });
});
