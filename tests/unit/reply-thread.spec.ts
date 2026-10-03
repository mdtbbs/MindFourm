import { JSDOM } from 'jsdom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ReplyThread, { buildReplyTree } from '@/components/forum/reply-thread';
import { replyApi } from '@/lib/api/client';

jest.mock('@/components/forum/reply-item', () => ({ __esModule: true, default: ({ reply }: any) => React.createElement('article', { id: `reply-${reply.id}` }, reply.content) }));
jest.mock('@/lib/api/client', () => ({ replyApi: { getChildren: jest.fn() } }));
jest.mock('@/i18n/provider', () => ({ useI18n: () => ({ t: (key: string, args: any) => `${key}${args ? ' ' + args.count : ''}` }) }));

const reply = (id: number, parent: number | null, count: number) => ({ id, post_id: 1, parent_reply_id: parent, content: `reply ${id}`, child_count: count }) as any;

describe('nested reply expansion', () => {
  it('loads direct child pages on demand and makes grandchildren reachable without fetching the whole tree', async () => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
    const api = replyApi.getChildren as jest.Mock;
    api.mockResolvedValueOnce({ data: [reply(2, 1, 1)], pagination: { page: 1, totalPages: 2 } })
      .mockResolvedValueOnce({ data: [reply(3, 2, 0)], pagination: { page: 1, totalPages: 1 } })
      .mockResolvedValueOnce({ data: [reply(4, 1, 0)], pagination: { page: 2, totalPages: 2 } });
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(React.createElement(ReplyThread, { nodes: buildReplyTree([reply(1, null, 500)]), postId: 1 })); });
    expect(api).not.toHaveBeenCalled();
    expect(host.querySelectorAll('article')).toHaveLength(1);
    const click = async (button: HTMLButtonElement) => { await act(async () => { button.click(); }); };
    await click(host.querySelector('button')!);
    expect(api).toHaveBeenLastCalledWith(1, 1, 1, 20);
    expect(host.querySelectorAll('article')).toHaveLength(2);
    await click(host.querySelector('button')!);
    expect(api).toHaveBeenLastCalledWith(1, 2, 1, 20);
    expect(host.textContent).toContain('reply 3');
    // The parent's button remains available for its second child page.
    await click(host.querySelector('button')!);
    expect(api).toHaveBeenLastCalledWith(1, 1, 2, 20);
    expect(host.querySelectorAll('article')).toHaveLength(4);
    expect(host.querySelectorAll('button')).toHaveLength(0);
    await act(async () => root.unmount()); host.remove(); dom.window.close();
  });
});
