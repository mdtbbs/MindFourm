/** Layout of the first row's column widths, shared with Tiptap's table serializer. */
export function richTableLayout(table: { content?: { content?: { attrs?: Record<string, any> }[] }[] }) {
  const columns: (number | null)[] = [];
  for (const cell of table.content?.[0]?.content || []) {
    const span = Math.min(100, Math.max(1, Number(cell.attrs?.colspan) || 1));
    for (let index = 0; index < span; index += 1) {
      const width = cell.attrs?.colwidth?.[index];
      columns.push(Number.isSafeInteger(width) && width > 0 && width <= 4096 ? width : null);
    }
  }
  const fixed = columns.length > 0 && columns.every((width) => width !== null);
  return { columns, width: fixed ? `${columns.reduce<number>((total, width) => total + (width || 0), 0)}px` : undefined };
}
