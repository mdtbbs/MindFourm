import { richTableLayout } from './table-presentation';

/**
 * Editor table DOM, built by the same `richTableLayout` the reader uses.
 *
 * Tiptap's stock `TableView` writes `min-width` inline (`50px` on the table,
 * `25px` per column). The reader instead relies on `richTableLayout` for fixed
 * column widths and on `.mdtbbs-rich-content table { min-width: 30rem }` for the
 * rest. The two therefore disagreed on `min-width` (50px vs 480px), so a table
 * laid out one way in the editor re-flowed — and on a phone changed its width
 * entirely — once it was published.
 *
 * Reusing `richTableLayout` here removes the second, competing layout rule.
 */
export class PresentedTableView {
  dom: HTMLDivElement;
  table: HTMLTableElement;
  colgroup: HTMLTableColElement;
  contentDOM: HTMLTableSectionElement;
  private node: any;

  constructor(node: any, HTMLAttributes: Record<string, any> = {}) {
    this.node = node;
    this.dom = document.createElement('div');
    this.dom.className = 'tableWrapper';
    this.table = this.dom.appendChild(document.createElement('table'));
    for (const [key, value] of Object.entries(HTMLAttributes)) {
      if (value === undefined || value === null) continue;
      if (key === 'style') this.table.style.cssText = String(value);
      else this.table.setAttribute(key, String(value));
    }
    this.colgroup = this.table.appendChild(document.createElement('colgroup'));
    this.contentDOM = this.table.appendChild(document.createElement('tbody'));
    this.sync();
  }

  update(node: any): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.sync();
    return true;
  }

  /** Column widths and the table width, both from the shared reader layout. */
  private sync(): void {
    const layout = richTableLayout(this.node.toJSON());
    this.colgroup.replaceChildren(...layout.columns.map((width) => {
      const col = document.createElement('col');
      if (width) col.style.width = `${width}px`;
      return col;
    }));
    // A fixed layout gets an explicit width; otherwise the stylesheet's min-width applies.
    this.table.style.width = layout.width || '';
    this.table.style.minWidth = '';
  }

  /** The colgroup is ours, not content; ProseMirror must not rewrite the table for it. */
  ignoreMutation(mutation: { type: string; target: Node }): boolean {
    const insideWrapper = this.dom.contains(mutation.target);
    const insideContent = this.contentDOM.contains(mutation.target);
    return insideWrapper && !insideContent
      && (mutation.type === 'attributes' || mutation.type === 'childList' || mutation.type === 'characterData');
  }
}
