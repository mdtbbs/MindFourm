import { readApprovalIntentId } from '../../frontend/src/hooks/use-forum-realtime';

describe('multiplayer realtime approval payloads', () => {
  it('reads the documented flat intent id', () => {
    expect(readApprovalIntentId({ join_request_id: 'jr_1', intent_id: 'intent_1' })).toBe('intent_1');
  });

  it('reads the projected join_intent.intent_id shape', () => {
    expect(readApprovalIntentId({ join_request_id: 'jr_1', join_intent: { intent_id: 'intent_1' } })).toBe('intent_1');
  });

  it('returns null when the payload carries no usable intent', () => {
    expect(readApprovalIntentId(undefined)).toBeNull();
    expect(readApprovalIntentId({})).toBeNull();
    expect(readApprovalIntentId({ intent_id: '' })).toBeNull();
    expect(readApprovalIntentId({ join_intent: {} })).toBeNull();
    expect(readApprovalIntentId({ join_intent: 'nope' })).toBeNull();
  });

  it('never returns a non-string value', () => {
    expect(readApprovalIntentId({ intent_id: 42 })).toBeNull();
  });
});
