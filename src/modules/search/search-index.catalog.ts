/**
 * MySQL FULLTEXT indexes used by the unified search. MySQL maintains these
 * indexes transactionally for INSERT/UPDATE/DELETE; the admin maintenance
 * action only rebuilds one allowlisted index at a time.
 */
export const SEARCH_INDEX_CATALOG = [
  { key: 'topics', table: 'posts', name: 'ft_search_posts', columns: ['title', 'content'] },
  { key: 'replies', table: 'replies', name: 'ft_search_replies', columns: ['content'] },
  { key: 'users', table: 'users', name: 'ft_search_users', columns: ['username', 'bio'] },
  { key: 'resources', table: 'resources', name: 'ft_search_resources', columns: ['title', 'description', 'summary'] },
  { key: 'resource_versions', table: 'resource_versions', name: 'ft_search_resource_versions', columns: ['version', 'release_notes_markdown', 'content'] },
  { key: 'mod_contents', table: 'mod_contents', name: 'ft_search_mod_contents', columns: ['internal_name', 'display_name', 'description'] },
  { key: 'tags', table: 'tags', name: 'ft_search_tags', columns: ['name', 'slug'] },
  { key: 'categories', table: 'categories', name: 'ft_search_categories', columns: ['name', 'slug', 'description'] },
  { key: 'resource_categories', table: 'resource_categories', name: 'ft_search_resource_categories', columns: ['name', 'slug', 'description'] },
  { key: 'servers', table: 'game_servers', name: 'ft_search_game_servers', columns: ['name', 'slug', 'description'] },
  { key: 'game_versions', table: 'game_versions', name: 'ft_search_game_versions', columns: ['version_value', 'build', 'display_name', 'changelog'] },
  { key: 'developer_feed', table: 'developer_feed_entries', name: 'ft_search_developer_feed', columns: ['repository', 'author_login', 'summary'] },
  { key: 'knowledge', table: 'knowledge_articles', name: 'ft_search_knowledge', columns: ['title', 'slug', 'summary', 'content_markdown', 'category'] },
] as const;

export type SearchIndexKey = typeof SEARCH_INDEX_CATALOG[number]['key'];
export type SearchIndexAction = 'reindex' | 'rebuild' | 'repair';
