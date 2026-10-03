export type QuickOpenCommandName =
  | 'user'
  | 'resource'
  | 'post'
  | 'thread'
  | 'setting'
  | 'page'
  | 'requestId'
  | 'moderation';

export type QuickOpenCommandAliases = Record<QuickOpenCommandName, string> & {
  settingsAlias: string;
  resourcesAlias: string;
  moderationQueueAlias: string;
};

export interface QuickOpenPage {
  key: string;
  label: string;
  description: string;
  href: string;
  haystack: string;
  disabled?: boolean;
}

export type QuickOpenResolution =
  | { type: 'user' | 'resource' | 'requestId'; value: string; href: string }
  | { type: 'post'; value: string; href: string }
  | { type: 'moderation'; filter: 'all' | 'resources'; href: string }
  | { type: 'setting' | 'page'; value: string; page: QuickOpenPage; href: string };

function normalize(value: string, locale: string): string {
  return value.trim().toLocaleLowerCase(locale);
}

function getArgument(query: string, alias: string, locale: string): string | null {
  const normalizedAlias = normalize(alias, locale);
  if (!normalizedAlias) return null;

  const normalizedQuery = normalize(query, locale);
  if (normalizedQuery === normalizedAlias) return '';
  if (!normalizedQuery.startsWith(`${normalizedAlias} `)) return null;
  return query.trim().slice(alias.trim().length).trim();
}

function availablePages(pages: QuickOpenPage[]): QuickOpenPage[] {
  return pages.filter((page) => !page.disabled && Boolean(page.href));
}

function settingPages(
  value: string,
  pages: QuickOpenPage[],
  locale: string,
): QuickOpenPage[] {
  const settings = availablePages(pages).filter((page) => page.href.startsWith('/admin/settings/'));
  if (!value) {
    const basic = settings.find((page) => page.href === '/admin/settings/basic');
    return basic ? [basic] : [];
  }

  const term = normalize(value, locale);
  return settings.filter((page) => page.haystack.includes(term));
}

/** Resolve a quick-open command to a route. This function only creates navigation targets. */
export function resolveQuickOpenCommand(
  query: string,
  aliases: QuickOpenCommandAliases,
  pages: QuickOpenPage[],
  locale = 'en',
): QuickOpenResolution[] {
  const commandOrder: QuickOpenCommandName[] = [
    'requestId',
    'moderation',
    'resource',
    'setting',
    'thread',
    'post',
    'user',
    'page',
  ];

  for (const name of commandOrder) {
    const value = getArgument(query, aliases[name], locale);
    if (value === null) continue;

    if (name === 'user' || name === 'resource') {
      if (!value) return [];
      return [{ type: name, value, href: name === 'user'
        ? `/admin/users?search=${encodeURIComponent(value)}`
        : `/admin/resources?search=${encodeURIComponent(value)}` }];
    }

    if (name === 'post' || name === 'thread') {
      if (!/^[1-9]\d*$/.test(value)) return [];
      return [{ type: 'post', value, href: `/posts/${value}` }];
    }

    if (name === 'requestId') {
      if (!value) return [];
      return [{ type: 'requestId', value, href: `/admin/logs?request_id=${encodeURIComponent(value)}` }];
    }

    if (name === 'moderation') {
      const normalizedValue = normalize(value, locale);
      const resourceFilter = normalizedValue === normalize(aliases.resourcesAlias, locale);
      const allFilter = !value
        || normalizedValue === 'all'
        || normalizedValue === normalize(aliases.moderationQueueAlias, locale);
      if (!allFilter && !resourceFilter) return [];
      const filter = resourceFilter ? 'resources' : 'all';
      return [{ type: 'moderation', filter, href: `/admin/content/moderation?type=${filter}` }];
    }

    if (name === 'setting') {
      return settingPages(value, pages, locale).slice(0, 8).map((page) => ({
        type: 'setting' as const,
        value,
        page,
        href: page.href,
      }));
    }

    if (name === 'page') {
      const settingsAlias = normalize(aliases.settingsAlias, locale);
      const requestedPage = normalize(value, locale);
      const openSettings = !value || requestedPage === settingsAlias || requestedPage === 'settings';
      if (openSettings) {
        const basic = settingPages('', pages, locale)[0];
        return basic ? [{ type: 'page', value: value || aliases.settingsAlias, page: basic, href: basic.href }] : [];
      }

      return availablePages(pages)
        .filter((page) => page.haystack.includes(requestedPage))
        .slice(0, 8)
        .map((page) => ({ type: 'page' as const, value, page, href: page.href }));
    }
  }

  return [];
}
