import {
  getGuardedInternalHref,
  navigateAfterConfirmation,
  navigateWithUnsavedChanges,
  registerUnsavedChangesConfirmation,
} from '@/lib/admin/unsaved-navigation';

describe('unsaved internal navigation guard', () => {
  const currentHref = 'https://forum.example/admin/settings/basic?tab=general';

  it('guards same-origin links that leave the current route', () => {
    expect(getGuardedInternalHref({ href: '/admin/settings/brand', button: 0 }, currentHref))
      .toBe('/admin/settings/brand');
    expect(getGuardedInternalHref({ href: '/admin/settings/basic?tab=other', button: 0 }, currentHref))
      .toBe('/admin/settings/basic?tab=other');
  });

  it('preserves modified, download, external, and same-route navigation', () => {
    expect(getGuardedInternalHref({ href: '/posts/1', button: 1 }, currentHref)).toBeNull();
    expect(getGuardedInternalHref({ href: '/posts/1', button: 0, ctrlKey: true }, currentHref)).toBeNull();
    expect(getGuardedInternalHref({ href: '/files/archive.zip', button: 0, download: true }, currentHref)).toBeNull();
    expect(getGuardedInternalHref({ href: 'https://other.example/posts/1', button: 0 }, currentHref)).toBeNull();
    expect(getGuardedInternalHref({ href: '/admin/settings/basic?tab=general#top', button: 0 }, currentHref)).toBeNull();
    expect(getGuardedInternalHref({ href: '/posts/1', target: '_blank', button: 0 }, currentHref)).toBeNull();
  });

  it('navigates only after confirmation is accepted', async () => {
    const navigate = jest.fn();
    const cancel = jest.fn(async () => false);
    await expect(navigateAfterConfirmation('/admin/settings/brand', cancel, navigate)).resolves.toBe(false);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();

    const accept = jest.fn(async () => true);
    await expect(navigateAfterConfirmation('/admin/settings/brand', accept, navigate)).resolves.toBe(true);
    expect(accept).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/admin/settings/brand');
  });

  it('applies registered dirty-page confirmation to programmatic SPA navigation', async () => {
    const navigate = jest.fn();
    const unregister = registerUnsavedChangesConfirmation(async () => false);
    await expect(navigateWithUnsavedChanges('/admin/settings/brand', navigate)).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();

    unregister();
    await expect(navigateWithUnsavedChanges('/admin/settings/brand', navigate)).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith('/admin/settings/brand');
  });
});
