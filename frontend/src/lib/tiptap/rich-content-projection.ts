type NodeJson = Record<string, any>;

function inline(nodes: NodeJson[] = []): string {
  return nodes.map((node) => {
    if (node.type === 'hardBreak') return '  \n';
    if (node.type === 'image') return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})`;
    if (node.type === 'mention') return `@${node.attrs?.username || ''}`;
    if (node.type === 'customEmoji') return `:${node.attrs?.shortcode || ''}:`;
    if (node.type !== 'text') return blocks([node]);
    let text = String(node.text || '');
    for (const mark of node.marks || []) {
      if (mark.type === 'bold') text = `**${text}**`;
      else if (mark.type === 'italic') text = `*${text}*`;
      else if (mark.type === 'strike') text = `~~${text}~~`;
      else if (mark.type === 'code') text = `\`${text}\``;
      else if (mark.type === 'link') text = `[${text}](${mark.attrs?.href || ''})`;
    }
    return text;
  }).join('');
}

function itemBody(item: NodeJson, depth: number): string {
  return (item.content || []).map((child: NodeJson) => child.type === 'paragraph'
    ? inline(child.content || [])
    : blocks([child], depth)).join('\n').trim();
}

function blocks(nodes: NodeJson[] = [], depth = 0): string {
  return nodes.map((node) => {
    const content = blocks(node.content || [], depth);
    switch (node.type) {
      case 'doc': return content;
      case 'paragraph': return inline(node.content || []) + '\n\n';
      case 'heading': return `${'#'.repeat(Math.min(6, Math.max(1, Number(node.attrs?.level) || 1)))} ${inline(node.content || [])}\n\n`;
      case 'blockquote': return content.trim().split('\n').map((line) => `> ${line}`).join('\n') + '\n\n';
      case 'bulletList': return (node.content || []).map((item: NodeJson) => `${'  '.repeat(depth)}- ${itemBody(item, depth + 1)}`).join('\n') + '\n\n';
      case 'orderedList': return (node.content || []).map((item: NodeJson, index: number) => `${'  '.repeat(depth)}${Number(node.attrs?.start || 1) + index}. ${itemBody(item, depth + 1)}`).join('\n') + '\n\n';
      case 'taskList': return (node.content || []).map((item: NodeJson) => `${'  '.repeat(depth)}- [${item.attrs?.checked ? 'x' : ' '}] ${itemBody(item, depth + 1)}`).join('\n') + '\n\n';
      case 'listItem':
      case 'taskItem': return itemBody(node, depth) + '\n';
      case 'codeBlock': return `~~~${node.attrs?.language || ''}\n${(node.content || []).map((part: NodeJson) => part.text || '').join('')}\n~~~\n\n`;
      case 'horizontalRule': return '---\n\n';
      case 'image': return `![${node.attrs?.alt || ''}](${node.attrs?.src || ''})\n\n`;
      case 'table': return (node.content || []).map((row: NodeJson, rowIndex: number) => {
        const cells = (row.content || []).map((cell: NodeJson) => (cell.content || []).map((part: NodeJson) => part.type === 'paragraph' ? inline(part.content || []) : blocks([part]).trim()).join(' '));
        return `| ${cells.join(' | ')} |\n${rowIndex === 0 ? `| ${cells.map(() => '---').join(' | ')} |\n` : ''}`;
      }).join('') + '\n';
      case 'spoiler': return `> [!SPOILER] ${node.attrs?.title || '剧透内容'}\n${content.trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
      case 'video': return (node.attrs?.src || `[${node.attrs?.provider || 'video'} video ${node.attrs?.videoId || ''}]`) + '\n\n';
      case 'attachment': return `[Attachment #${node.attrs?.attachmentId || 'draft'}]\n\n`;
      case 'postQuote': return `[Quoted post #${node.attrs?.postId}](/posts/${node.attrs?.postId})\n\n`;
      case 'replyQuote': return `[Quoted reply #${node.attrs?.replyId}](/posts/${node.attrs?.postId}#reply-${node.attrs?.replyId})\n\n`;
      case 'text': return inline([node]);
      default: return content;
    }
  }).join('');
}

/** Markdown is a searchable/legacy projection only. Rich JSON remains canonical. */
export function projectRichContentToMarkdown(input: unknown): string {
  if (!input || typeof input !== 'object' || (input as NodeJson).type !== 'doc') return '';
  return blocks([input as NodeJson]).trim();
}
