import { strict as assert } from "node:assert";
import { normalizeEditorContent } from "./editor-content";

assert.equal(normalizeEditorContent(""), "");
assert.equal(normalizeEditorContent("<p></p>"), "");
assert.equal(normalizeEditorContent("<p><br></p>"), "");
assert.equal(normalizeEditorContent("正文"), "正文");
assert.equal(normalizeEditorContent("<p>正文</p>"), "<p>正文</p>");
