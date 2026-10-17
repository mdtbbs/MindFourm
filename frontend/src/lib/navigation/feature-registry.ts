export type FeatureGroup = 'navigation' | 'tools' | 'resources' | 'multiplayer' | 'account' | 'developer';

export type FeatureEntry = {
  id: string;
  href: string;
  titleKey: string;
  descriptionKey: string;
  group: FeatureGroup;
  keywords: readonly string[];
  adminOnly?: boolean;
};

/** Small, local route index for command search; content search remains on Public V1. */
export const FEATURE_REGISTRY: readonly FeatureEntry[] = [
  { id: 'community', href: '/community', titleKey: 'community.title', descriptionKey: 'community.description', group: 'navigation', keywords: ['community', 'forum', '讨论', '社区', 'комьюнити', 'コミュニティ'] },
  { id: 'resources', href: '/resources', titleKey: 'navigation.resources', descriptionKey: 'searchCommand.resourcesDescription', group: 'navigation', keywords: ['resource', '资源', '素材', 'ресурсы', 'リソース'] },
  { id: 'multiplayer', href: '/multiplayer', titleKey: 'multiplayer.title', descriptionKey: 'multiplayer.description', group: 'navigation', keywords: ['multiplayer', 'online', '联机', '多人', 'совместная игра', 'マルチプレイ'] },
  { id: 'tools', href: '/tools', titleKey: 'tools.title', descriptionKey: 'tools.description', group: 'navigation', keywords: ['tools', 'toolbox', '工具', 'ツール', 'инструменты'] },
  { id: 'blueprint-editor', href: '/tools/blueprint-editor', titleKey: 'tools.blueprintEditor', descriptionKey: 'tools.blueprintEditorDescription', group: 'tools', keywords: ['blueprint', 'schematic', 'editor', 'edit', '蓝图', '编辑', '設計図', 'редактор чертежей'] },
  { id: 'map-editor', href: '/tools/map-editor', titleKey: 'tools.mapEditor', descriptionKey: 'tools.mapEditorDescription', group: 'tools', keywords: ['map', 'editor', '地图', '编辑', 'マップ', 'карта'] },
  { id: 'wave-editor', href: '/tools/wave-editor', titleKey: 'tools.waveEditor', descriptionKey: 'tools.waveEditorDescription', group: 'tools', keywords: ['wave', 'waves', 'editor', '波次', '波', 'волны', 'ウェーブ'] },
  { id: 'blueprint-analysis', href: '/tools/blueprint-analysis', titleKey: 'tools.blueprintAnalysis', descriptionKey: 'tools.blueprintAnalysisDescription', group: 'tools', keywords: ['blueprint', 'schematic', 'analysis', 'analyze', '分析', '蓝图', '解析', '分析'] },
  { id: 'cloud-saves', href: '/tools/cloud-saves', titleKey: 'tools.cloudSaves', descriptionKey: 'tools.cloudSavesDescription', group: 'tools', keywords: ['cloud saves', 'cloud save', 'save', '存档', '云存档', 'クラウドセーブ', 'облачные сохранения'] },
  { id: 'mods', href: '/resources?resource_kind=mod', titleKey: 'searchCommand.mods', descriptionKey: 'searchCommand.modsDescription', group: 'resources', keywords: ['mod', 'mods', '模组', '模組', 'мод', 'モッド'] },
  { id: 'maps', href: '/resources?resource_kind=map', titleKey: 'searchCommand.maps', descriptionKey: 'searchCommand.mapsDescription', group: 'resources', keywords: ['map', 'maps', '地图', 'карта', 'マップ'] },
  { id: 'schematics', href: '/resources?resource_kind=schematic', titleKey: 'searchCommand.schematics', descriptionKey: 'searchCommand.schematicsDescription', group: 'resources', keywords: ['blueprint', 'schematic', '蓝图', '設計図', 'схема'] },
  { id: 'servers', href: '/servers', titleKey: 'navigation.servers', descriptionKey: 'multiplayer.serversDescription', group: 'multiplayer', keywords: ['server', 'servers', '服务器', 'サーバー', 'сервер'] },
  { id: 'friends', href: '/friends', titleKey: 'navigation.friends', descriptionKey: 'multiplayer.friendsDescription', group: 'multiplayer', keywords: ['friend', 'friends', '好友', '朋友', 'друзья', 'フレンド'] },
  { id: 'developer-center', href: '/developers', titleKey: 'navigation.developerCenter', descriptionKey: 'searchCommand.developerDescription', group: 'developer', keywords: ['developer', 'api', 'openapi', 'oauth', '开发者', '接口', '開発者', 'разработчик'] },
  { id: 'openapi', href: '/api/v1/reference', titleKey: 'searchCommand.apiDocs', descriptionKey: 'searchCommand.apiDocsDescription', group: 'developer', keywords: ['api', 'openapi', 'docs', '接口', '文档', 'API ドキュメント', 'документация API'] },
  { id: 'my-resources', href: '/resources/my', titleKey: 'navigation.myResources', descriptionKey: 'searchCommand.myResourcesDescription', group: 'account', keywords: ['my resources', 'resource management', '我的资源', '资源管理', 'мои ресурсы', '自分のリソース'] },
  { id: 'bookmarks', href: '/bookmarks', titleKey: 'navigation.bookmarks', descriptionKey: 'searchCommand.bookmarksDescription', group: 'account', keywords: ['bookmark', 'favorite', '收藏', 'お気に入り', 'закладки'] },
  { id: 'notifications', href: '/notifications', titleKey: 'navigation.notifications', descriptionKey: 'searchCommand.notificationsDescription', group: 'account', keywords: ['notification', '通知', 'お知らせ', 'уведомления'] },
  { id: 'settings', href: '/settings', titleKey: 'navigation.settings', descriptionKey: 'searchCommand.settingsDescription', group: 'account', keywords: ['settings', '设置', '設定', 'настройки'] },
];

export function searchFeatureRegistry(query: string, options: { isAdmin?: boolean; limit?: number } = {}): FeatureEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return FEATURE_REGISTRY.filter((entry) => {
    if (entry.adminOnly && !options.isAdmin) return false;
    return [entry.id, entry.href, ...entry.keywords].some((value) => value.toLocaleLowerCase().includes(normalized));
  }).slice(0, options.limit || 8);
}
