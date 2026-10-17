import { RULE_LABELS, TEAM_LABELS } from './map-rule-labels';

const labels: Record<string, string> = {
  ...RULE_LABELS, ...TEAM_LABELS,
  schematic: '蓝图', map: '地图', mod: '模组', other: '其他资源', primary: '主文件', source: '源文件', attachment: '附件', preview: '预览',
  managed: '托管文件', external: '外部链接', torrent: '种子', verified: '已校验', unknown: '未确认', unverified: '未校验', unavailable: '暂不可用', available: '可用', failed: '失败', ready: '就绪', none: '无',
  published: '已发布', approved: '已审核', pending: '待审核', pending_review: '待审核', draft: '草稿', rejected: '未通过', upload_pending: '待上传', public: '公开', private: '私有',
  release: '正式版', beta: '测试版', alpha: '预览版', snapshot: '开发快照', semver: '语义版本', compatibility: '兼容版本', working: '可用', partial: '部分可用', cannot_start: '无法启动',
  width: '宽度', height: '高度', block_count: '方块数量', min_supported_build: '最低游戏版本', parser_version: '解析器版本', game_mode: '游戏模式', game_modes: '游戏模式', planet: '星球',
  serpulo: '赛普罗', erekir: '埃里克尔', survival: '生存', attack: '攻击', sandbox: '沙盒', pvp: '对战',
  block: '方块', unit: '单位', item: '物品', liquid: '液体', status: '状态效果', blocks: '方块', requirements: '建造材料',
  internal_name: '内部名称', display_name: '显示名称', count: '数量', amount: '数量', size: '占地大小', rotation: '朝向', team: '队伍', cores: '核心', spawns: '出生点', core_count: '核心数量', waves: '波次', wave_groups: '波次组',
  power_production: '发电量', power_consumption: '耗电量', net_power: '净电力', generated: '发电', consumed: '耗电', net: '净电力', production: '生产', materials: '材料', dependencies: '依赖',
  runtime: '运行环境', build: '游戏构建', version: '版本', name: '名称', author: '作者', description: '说明', tags: '标签', labels: '标签', core_teams: '核心队伍', teams: '队伍',
  terrain: '地形', floor: '地形', overlay: '覆盖层', buildings: '建筑', enemy_spawns: '敌人出生点', tile_layers_truncated: '图层数据是否截断', objects_truncated: '对象数据是否截断',
};
export function playerLabel(value: string | null | undefined, locale: string): string {
  if (!value) return '';
  return locale === 'zh-CN' ? labels[value] || value : value;
}
