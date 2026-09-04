export const parseModelJson = <T extends object>(content: string): T => {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  const start = fenced.indexOf('{');
  const end = fenced.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Model response did not contain a JSON object');
  try { return JSON.parse(fenced.slice(start, end + 1)) as T; }
  catch { throw new Error('Model response contained malformed JSON'); }
};

export const asStringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === 'string').slice(0, 20) : [];
