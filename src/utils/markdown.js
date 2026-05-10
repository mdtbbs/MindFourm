const { marked } = require('marked');

marked.setOptions({
  breaks: true,
  gfm: true
});

function parseMarkdown(content) {
  if (!content) return '';
  return marked.parse(content);
}

module.exports = { parseMarkdown };