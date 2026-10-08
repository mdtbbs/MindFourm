export const RULE_LABELS: Record<string, string> = {
  waves: '启用波次', waveTimer: '波次计时', waveSending: '允许提前出波', attackMode: '攻击模式', pvp: '玩家对战', infiniteResources: '无限资源', schematicsAllowed: '允许蓝图', logicUnitControl: '允许逻辑控制单位', logicUnitBuild: '允许逻辑建造', logicUnitDeconstruct: '允许逻辑拆除', reactorExplosions: '反应堆爆炸', fire: '允许火焰', damageExplosions: '建筑爆炸伤害', ghostBlocks: '显示被毁建筑', waitEnemies: '等待敌人清空', canGameOver: '允许游戏结束', coreCapture: '允许核心占领', disableUnitCap: '关闭单位上限', lighting: '启用光照', hideSpawns: '隐藏出生点', placeRangeCheck: '检查放置范围', onlyDepositCore: '仅允许存入核心', unitCap: '单位上限', winWave: '胜利波次', environment: '环境标志', solarMultiplier: '太阳能倍率', unitBuildSpeedMultiplier: '单位建造速度', unitCostMultiplier: '单位成本倍率', unitDamageMultiplier: '单位伤害倍率', unitHealthMultiplier: '单位生命倍率', blockHealthMultiplier: '建筑生命倍率', blockDamageMultiplier: '建筑伤害倍率', buildCostMultiplier: '建筑建造成本', buildSpeedMultiplier: '建筑建造速度', deconstructRefundMultiplier: '拆除返还倍率', enemyCoreBuildRadius: '敌方核心保护范围', dropZoneRadius: '出生点保护范围', waveSpacing: '波次间隔（游戏帧）', initialWaveSpacing: '初始等待（游戏帧）', modeName: '游戏模式名称', bannedBlocks: '禁用方块', bannedUnits: '禁用单位',
};
export const RULE_GROUPS: Record<string, string[]> = {
  '基础规则': ['waves', 'attackMode', 'pvp', 'infiniteResources', 'schematicsAllowed', 'logicUnitControl'],
  '波次': ['waveTimer', 'waveSending', 'waveSpacing', 'initialWaveSpacing', 'winWave', 'waitEnemies'],
  '单位': ['unitCap', 'unitHealthMultiplier', 'unitDamageMultiplier', 'unitBuildSpeedMultiplier', 'unitCostMultiplier', 'disableUnitCap'],
  '建筑': ['blockHealthMultiplier', 'blockDamageMultiplier', 'buildSpeedMultiplier', 'buildCostMultiplier', 'deconstructRefundMultiplier'],
  '环境': ['fire', 'reactorExplosions', 'lighting', 'enemyCoreBuildRadius', 'dropZoneRadius', 'solarMultiplier'],
};
export const TEAM_LABELS: Record<string, string> = { sharded: '蓝队', crux: '红队', malis: '紫队', green: '绿队', blue: '深蓝队', neoplastic: '粉队', derelict: '废弃' };
export const OBJECT_LABELS: Record<string, string> = { core: '核心', spawn: '出生点', building: '建筑', add: '添加', delete: '删除', move: '移动', team: '修改队伍' };
