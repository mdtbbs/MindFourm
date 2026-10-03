export interface NavigationClickIntent {
  href: string;
  target?: string | null;
  download?: boolean;
  button: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

type UnsavedChangesConfirmation = () => Promise<boolean> | null;
const unsavedChangesConfirmations = new Set<UnsavedChangesConfirmation>();

export function registerUnsavedChangesConfirmation(confirmation: UnsavedChangesConfirmation): () => void {
  unsavedChangesConfirmations.add(confirmation);
  return () => {
    unsavedChangesConfirmations.delete(confirmation);
  };
}

export async function navigateWithUnsavedChanges(
  href: string,
  navigate: (href: string) => void,
): Promise<boolean> {
  for (const confirm of [...unsavedChangesConfirmations]) {
    const pending = confirm();
    if (pending && !await pending) return false;
  }
  navigate(href);
  return true;
}

/** Return a same-origin destination that would leave the current route via a plain link click. */
export function getGuardedInternalHref(intent: NavigationClickIntent, currentHref: string): string | null {
  if (intent.button !== 0 || intent.metaKey || intent.ctrlKey || intent.shiftKey || intent.altKey) return null;
  if (intent.download || (intent.target && intent.target.toLowerCase() !== '_self')) return null;

  try {
    const destination = new URL(intent.href, currentHref);
    const current = new URL(currentHref);
    if (destination.origin !== current.origin) return null;
    if (destination.pathname === current.pathname && destination.search === current.search) return null;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return null;
  }
}

/** Keep navigation behind an explicit confirmation and never navigate on dismissal. */
export async function navigateAfterConfirmation(
  href: string,
  confirm: () => Promise<boolean>,
  navigate: (href: string) => void,
): Promise<boolean> {
  if (!await confirm()) return false;
  navigate(href);
  return true;
}
