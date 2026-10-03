import { applyPostVisibility, applyPublicPostVisibility } from './post-visibility.util';

function builder() { return { andWhere: jest.fn().mockReturnThis() } as any; }

describe('post query visibility', () => {
  it.each(['draft', 'pending', 'hidden', 'deleted'])('cannot expose %s with an explicit anonymous filter', status => {
    const qb = builder(); applyPostVisibility(qb, 'post', undefined, status);
    expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
    expect(qb.andWhere).toHaveBeenCalledWith('post.required_group_id IS NULL', undefined);
  });
  it('restricts an explicit nonpublic status to its author and group membership', () => {
    const qb = builder(); applyPostVisibility(qb, 'thread', { id: 7, role: 'user' }, 'draft');
    expect(qb.andWhere).toHaveBeenCalledWith('thread.user_id = :postVisibilityUser', { postVisibilityUser: 7 });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('EXISTS (SELECT 1 FROM group_members'), { postVisibilityUser: 7 });
  });
  it('keeps default own-pending visibility and checks the wall before pagination', () => {
    const qb = builder(); applyPostVisibility(qb, 'post', { id: 7, role: 'user' });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('post.user_id = :postVisibilityUser'), expect.objectContaining({postVisibilityPending: 'pending', postVisibilityUser: 7}));
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('post_visibility_member.group_id = post.required_group_id'), { postVisibilityUser: 7 });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining("COALESCE(post.post_type, 'normal') <> 'resource_discussion'"), { postVisibilityUser: 7 });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('post_visibility_resource.status IN (\'approved\', \'published\')'), { postVisibilityUser: 7 });
  });
  it('lets staff inspect nonpublic posts and restricted groups', () => {
    const qb = builder(); applyPostVisibility(qb, 'post', { id: 7, role: 'moderator' }, 'draft');
    expect(qb.andWhere).toHaveBeenCalledTimes(1);
  });
  it('shared feeds/cache are always anonymous public projections', () => {
    const qb = builder(); applyPublicPostVisibility(qb);
    expect(qb.andWhere).toHaveBeenCalledWith('post.status = :postVisibilityStatus', { postVisibilityStatus:'published' });
    expect(qb.andWhere).toHaveBeenCalledWith('post.required_group_id IS NULL', undefined);
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('post_visibility_resource'), undefined);
  });
});
