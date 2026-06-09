import type { BrowserContext, Page } from '@playwright/test';

const frontendUrl = process.env.MINDFORUM_FRONTEND_URL || 'http://localhost:3000';

function getCookieDomain(): string {
  const hostname = new URL(frontendUrl).hostname;
  return hostname === '127.0.0.1' ? '127.0.0.1' : hostname;
}

export async function signInWithSession(context: BrowserContext, sessionToken: string): Promise<void> {
  await context.addCookies([
    {
      name: 'forum_session',
      value: sessionToken,
      domain: getCookieDomain(),
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

export async function collectPageDiagnostics(page: Page): Promise<{ consoleErrors: string[]; pageErrors: string[] }> {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });

  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  return { consoleErrors, pageErrors };
}
