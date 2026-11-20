import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BlueprintEditorPage from './blueprint-editor/page';
import MapEditorPage from './map-editor/page';
import WaveEditorPage from './wave-editor/page';

jest.mock('@/components/editors/editor-workspace', () => ({
  EditorWorkspace: ({ pageKind }: { pageKind: string }) => createElement('div', { 'data-editor-workspace': pageKind }),
}));

describe('standalone editor routes', () => {
  it.each([
    [BlueprintEditorPage, 'schematic'],
    [MapEditorPage, 'map'],
    [WaveEditorPage, 'wave'],
  ])('renders the independent %s workspace', (Page, pageKind) => {
    expect(renderToStaticMarkup(createElement(Page))).toContain(`data-editor-workspace="${pageKind}"`);
  });
});
