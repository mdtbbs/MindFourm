const clean = (text: unknown, max = 220): string => typeof text === 'string'
  ? text.replace(/\s+/g, ' ').trim().slice(0, max) : '';
export const compactList = (items: unknown, maxItems = 6): string[] => Array.isArray(items)
  ? items.map((item) => clean(item)).filter(Boolean).slice(0, maxItems) : [];
export { clean };
