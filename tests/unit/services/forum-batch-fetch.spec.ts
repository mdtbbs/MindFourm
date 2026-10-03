jest.mock('@/lib/api/client', () => ({
  likeApi: { checkBatch: jest.fn(), likeReply: jest.fn(), getUserLikeCount: jest.fn() },
  attachmentApi: { getByReplies: jest.fn() },
}));
jest.mock('@/lib/api/reactions', () => ({
  reactionApi: { listBatch: jest.fn(), toggle: jest.fn(), emojis: jest.fn() },
  REACTION_EMOJIS: ['👍'], compareReactionEmojis: () => 0,
}));
jest.mock('@/store/user-store', () => ({
  useUserStore: { getState: () => ({ isAuthenticated: true }) },
}));

import { likeApi, attachmentApi } from '@/lib/api/client';
import { reactionApi } from '@/lib/api/reactions';
import { useLikeStore } from '@/store/like-store';
import { useReactionStore } from '@/store/reaction-store';
import { useReplyAttachmentStore } from '@/store/reply-attachment-store';
import { clearUserScopedState } from '@/store/reset-registry';

const settle = () => new Promise((resolve) => setImmediate(resolve));
const ids = Array.from({ length: 50 }, (_, index) => index + 1);

beforeEach(() => {
  clearUserScopedState();
  jest.clearAllMocks();
  (likeApi.checkBatch as jest.Mock).mockResolvedValue({ 1: { count: 4, liked: true } });
  (reactionApi.listBatch as jest.Mock).mockResolvedValue({ reactions: { 1: [{ emoji: '👍', count: 2, reacted: true }] } });
  (attachmentApi.getByReplies as jest.Mock).mockResolvedValue({ 1: [{ id: 9 }] });
});

it('50 mounted reply cards use 3 HTTP batch calls instead of 150 item calls', async () => {
  for (const id of ids) {
    useLikeStore.getState().ensureLikeState('reply', id);
    useReactionStore.getState().ensureReactions('reply', id);
    useReplyAttachmentStore.getState().ensure(id);
  }
  await settle();
  expect(likeApi.checkBatch).toHaveBeenCalledTimes(1);
  expect(likeApi.checkBatch).toHaveBeenCalledWith('reply', ids);
  expect(reactionApi.listBatch).toHaveBeenCalledTimes(1);
  expect(reactionApi.listBatch).toHaveBeenCalledWith('reply', ids);
  expect(attachmentApi.getByReplies).toHaveBeenCalledTimes(1);
  expect(attachmentApi.getByReplies).toHaveBeenCalledWith(ids);
  expect(useLikeStore.getState().replyLikes.get(1)?.liked).toBe(true);
  expect(useReactionStore.getState().replyReactions.get(1)?.[0].reacted).toBe(true);
});

it('deduplicates ids and chunks an unusually large view at 100', async () => {
  const many = Array.from({ length: 205 }, (_, index) => index + 1);
  for (const id of [...many, ...many]) useReactionStore.getState().ensureReactions('reply', id);
  await settle();
  expect(reactionApi.listBatch).toHaveBeenCalledTimes(3);
  expect((reactionApi.listBatch as jest.Mock).mock.calls.map((call) => call[1].length)).toEqual([100, 100, 5]);
});

it('discards all in-flight results from the previous viewer', async () => {
  let finishLikes!: (rows: unknown) => void;
  let finishReactions!: (rows: unknown) => void;
  let finishAttachments!: (rows: unknown) => void;
  (likeApi.checkBatch as jest.Mock).mockImplementation(() => new Promise((resolve) => { finishLikes = resolve; }));
  (reactionApi.listBatch as jest.Mock).mockImplementation(() => new Promise((resolve) => { finishReactions = resolve; }));
  (attachmentApi.getByReplies as jest.Mock).mockImplementation(() => new Promise((resolve) => { finishAttachments = resolve; }));
  useLikeStore.getState().ensureLikeState('reply', 1);
  useReactionStore.getState().ensureReactions('reply', 1);
  useReplyAttachmentStore.getState().ensure(1);
  await settle();
  clearUserScopedState();
  finishLikes({ 1: { count: 4, liked: true } });
  finishReactions({ reactions: { 1: [{ emoji: '👍', count: 2, reacted: true }] } });
  finishAttachments({ 1: [{ id: 9 }] });
  await settle();
  expect(useLikeStore.getState().replyLikes.size).toBe(0);
  expect(useReactionStore.getState().replyReactions.size).toBe(0);
  expect(useReplyAttachmentStore.getState().attachments.size).toBe(0);
});


it('a delayed read cannot overwrite a newer optimistic like or reaction', async () => {
  let finishLikes!: (rows: unknown) => void;
  let finishReactions!: (rows: unknown) => void;
  (likeApi.checkBatch as jest.Mock).mockImplementation(() => new Promise((resolve) => { finishLikes = resolve; }));
  (reactionApi.listBatch as jest.Mock).mockImplementation(() => new Promise((resolve) => { finishReactions = resolve; }));
  (reactionApi.toggle as jest.Mock).mockResolvedValue({ reactions: [{ emoji: '👍', count: 1, reacted: true }] });
  useLikeStore.getState().ensureLikeState('reply', 1);
  useReactionStore.getState().ensureReactions('reply', 1);
  await settle();
  await useLikeStore.getState().toggleReplyLike(1);
  await useReactionStore.getState().toggleReaction('reply', 1, '👍');
  finishLikes({ 1: { count: 0, liked: false } });
  finishReactions({ reactions: { 1: [] } });
  await settle();
  expect(useLikeStore.getState().replyLikes.get(1)?.liked).toBe(true);
  expect(useReactionStore.getState().replyReactions.get(1)?.[0].reacted).toBe(true);
});
