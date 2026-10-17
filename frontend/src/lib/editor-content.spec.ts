import { strict as assert } from "node:assert";
import { normalizeEditorContent } from "./editor-content";

describe('normalizeEditorContent', () => {
  it('treats empty and blank paragraphs as empty content', () => {
    assert.equal(normalizeEditorContent(""), "");
    assert.equal(normalizeEditorContent("<p></p>"), "");
    assert.equal(normalizeEditorContent("<p><br></p>"), "");
  });

  it('keeps plain and paragraph-wrapped text intact', () => {
    assert.equal(normalizeEditorContent("正文"), "正文");
    assert.equal(normalizeEditorContent("<p>正文</p>"), "<p>正文</p>");
  });
});
