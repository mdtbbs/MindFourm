import { createHash } from 'node:crypto';

/**
 * Mindustry v160.5 `mlog` 纯静态审计器。
 *
 * 本模块只做三件事：按行切分源文本、按引号/转义规则切分 token、在静态控制流图上
 * 执行白名单与边界检查。源文本不会被执行，也不会被解析成任何可运行的处理器对象；
 * 处理器在游戏内的真实状态、Mod 内容解析和建筑配置解析都不在这里发生。
 *
 * 所有上限都必须在进入分析前生效：源文本最多审计 131072 个 UTF-16 码元，逐条指令
 * 规则最多检查 maxInstructions 条指令，findings 最多返回 maxFindings 条。
 */

export const MLOG_AUDIT_VERSION = 'mdtbbs-mlog-static-1';

export type MlogSeverity = 'error' | 'warning' | 'info';

export type MlogFinding = {
  code: 'MLOG_UNKNOWN_OPCODE' | 'MLOG_HIGH_FREQ_UBIND_NO_WAIT' | 'MLOG_LARGE_CYCLE_BUDGET'
    | 'MLOG_UNREFERENCED_JUMP' | 'MLOG_MEMORY_OUT_OF_RANGE';
  severity: MlogSeverity;
  message: string;
  line: number | null;        // 1-based；无法定位时 null
  instruction: number | null; // 0-based 指令序号
  details?: Record<string, unknown>;
};

export type MlogAuditOptions = {
  processorType?: string | null; // 例如 'micro-processor'、'logic-processor'、'hyper-processor' 等
  linkedBlocks?: Array<{ name?: string | null; block?: string | null; type?: string | null }>;
  maxInstructions?: number;      // 默认 8192
  maxFindings?: number;          // 默认 100
};

export type MlogAuditResult = {
  version: 'mdtbbs-mlog-static-1';
  source_sha256: string;         // 对 UTF-8 源文本求 SHA-256 hex
  source_truncated: boolean;     // 源文本超过 maxSourceChars 时只审计前缀并置 true
  instruction_count: number;
  estimated_cycle_ticks: number; // 指令数 / IPT，四舍五入 2 位
  opcodes: string[];             // 去重、排序，最多 100
  referenced_units: string[];    // 排序，最多 100
  referenced_blocks: string[];   // 排序，最多 100
  has_warnings: boolean;
  findings: MlogFinding[];
  searchable_text: string;       // 行数/长度有界，含源文本
};

/** 源文本审计上限：128 KiB 对应的 UTF-16 码元数。 */
const MAX_SOURCE_CHARS = 131_072;
/** 公开检索文本上限。 */
const MAX_SEARCHABLE_TEXT_CHARS = 60_000;
const DEFAULT_MAX_INSTRUCTIONS = 8_192;
const DEFAULT_MAX_FINDINGS = 100;
const MAX_LIST_ITEMS = 100;
const MAX_LABEL_CHARS = 100;
const MAX_LINKED_BLOCKS = 500;
/** 自然循环反查的节点访问预算，避免极端跳转图把静态审计拖成平方级。 */
const MAX_LOOP_WORK = 250_000;

/** v160.5 官方逻辑指令白名单（严格按协议清单，不在此表中的一律视为未知）。 */
const OFFICIAL_OPCODES: ReadonlySet<string> = new Set([
  'read', 'write', 'draw', 'print', 'printchar', 'format', 'drawflush', 'printflush',
  'getlink', 'control', 'radar', 'sensor', 'set', 'op', 'wait', 'lookup', 'packcolor',
  'end', 'jump', 'ubind', 'ucontrol', 'uradar', 'ulocate', 'noop',
]);

/** 需要额外校验第二个 token 的指令及其合法子命令（全部按小写比较）。 */
const SUBCOMMANDS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['draw', new Set([
    'clear', 'color', 'col', 'stroke', 'line', 'rect', 'linerect', 'poly', 'linepoly',
    'triangle', 'image', 'translate', 'scale', 'rotate', 'reset',
  ])],
  ['control', new Set(['enabled', 'shoot', 'shootp', 'config', 'color'])],
  ['ucontrol', new Set([
    'idle', 'stop', 'move', 'approach', 'boost', 'pathfind', 'target', 'targetp',
    'itemdrop', 'itemtake', 'paydrop', 'paytake', 'payenter', 'mine', 'flag', 'build',
    'getblock', 'within', 'unbind',
  ])],
  ['ulocate', new Set(['ore', 'building', 'spawn', 'damaged'])],
  ['op', new Set([
    'add', 'sub', 'mul', 'div', 'idiv', 'mod', 'emod', 'pow', 'equal', 'notequal',
    'land', 'lessthan', 'lessthaneq', 'greaterthan', 'greaterthaneq', 'strictequal',
    'shl', 'shr', 'or', 'and', 'xor', 'not', 'max', 'min', 'angle', 'anglediff',
    'len', 'noise', 'abs', 'log', 'log10', 'floor', 'ceil', 'sqrt', 'rand', 'sin',
    'cos', 'tan', 'asin', 'acos', 'atan',
  ])],
]);

/** 高频单位操作：出现在循环且整条循环没有 wait 时给出提示。 */
const HIGH_FREQUENCY_OPCODES: ReadonlySet<string> = new Set(['ubind', 'ulocate', 'radar', 'uradar']);

/** findings 的规则声明顺序，用于同一指令上的稳定排序。 */
const RULE_ORDER: Record<MlogFinding['code'], number> = {
  MLOG_UNKNOWN_OPCODE: 0,
  MLOG_UNREFERENCED_JUMP: 1,
  MLOG_MEMORY_OUT_OF_RANGE: 2,
  MLOG_HIGH_FREQ_UBIND_NO_WAIT: 3,
  MLOG_LARGE_CYCLE_BUDGET: 4,
};

const INSTRUCTIONS_PER_TICK: ReadonlyMap<string, number> = new Map([
  ['micro-processor', 1],
  ['logic-processor', 2],
  ['hyper-processor', 3],
  ['world-processor', 3],
]);
const DEFAULT_INSTRUCTIONS_PER_TICK = 2;

/** 整数/十六进制/二进制字面量；mlog 的变量名不会被当成跳转目标。 */
const INTEGER_LITERAL = /^([+-]?)(0[xX][0-9a-fA-F]+|0[bB][01]+|\d+)$/;
/** 记忆体链接名（大小写按源文本严格匹配，与 v160.5 的链接名规则一致）。 */
const MEMORY_LINK = /^(cell|bank)\d+$/;
const MEMORY_LINK_PARTS = /^(cell|bank)(\d+)$/;
/** 逻辑链接名必须是合法标识符。 */
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;
/** 内容内部名：允许连字符和点号（Mod 内部名、类型名都可能出现）。 */
const INTERNAL_NAME = /^[A-Za-z0-9_.-]{1,100}$/;
/** 单位内容名：允许数字、字母、下划线和连字符，但不能是纯数字。 */
const CONTENT_NAME = /^[A-Za-z0-9_-]{1,100}$/;

type Token = {
  value: string;
  quoted: boolean;
};

type Instruction = {
  index: number;
  line: number;
  opcode: string;
  tokens: Token[];
  quotedOpcode: boolean;
};

type CfgFrame = {
  node: number;
  child: number;
};

/**
 * 审计一段 mlog 源文本。
 *
 * maxInstructions 是“逐条指令规则”和 CFG 分析的工作上限；instruction_count 仍报告
 * 截断后源文本中的完整指令数，因此跳转越界判断不会被分析上限误伤。
 */
export function auditMlogSource(source: string, options?: MlogAuditOptions): MlogAuditResult {
  const settings: MlogAuditOptions = options ?? {};
  const original = typeof source === 'string' ? source : '';
  // 哈希始终针对完整输入，便于识别原始文件；截断只影响后续审计范围。
  const sourceSha256 = createHash('sha256').update(original, 'utf8').digest('hex');
  const { text: auditedSource, truncated } = truncateSource(original);
  const instructions = parseInstructions(auditedSource);
  const instructionCount = instructions.length;
  const analysisLimit = Math.min(
    resolveLimit(settings.maxInstructions, DEFAULT_MAX_INSTRUCTIONS),
    instructionCount,
  );

  const findings: MlogFinding[] = [];

  // 逐条指令规则：未知指令/子命令、跳转目标、记忆体越界。
  for (let index = 0; index < analysisLimit; index += 1) {
    const instruction = instructions[index];
    const unknown = auditInstruction(instruction);
    if (unknown) findings.push(unknown);
    const jump = auditJumpInstruction(instruction, instructionCount);
    if (jump) findings.push(jump);
    const memory = auditMemoryInstruction(instruction);
    if (memory) findings.push(memory);
  }

  // 控制流规则必须在可达指令集合上执行，避免把不可达代码里的环算进来。
  findings.push(...auditHighFrequencyLoops(instructions, analysisLimit));

  const processorType = typeof settings.processorType === 'string' ? settings.processorType.trim() : '';
  const instructionsPerTick = resolveInstructionsPerTick(processorType);
  const ticks = instructionCount / instructionsPerTick;
  const estimatedCycleTicks = roundToTwoDecimals(ticks);
  if (instructionCount > 0 && ticks > 60) {
    findings.push({
      code: 'MLOG_LARGE_CYCLE_BUDGET',
      severity: 'info',
      message: `Program needs about ${estimatedCycleTicks} ticks per cycle (${instructionCount} instructions at ${instructionsPerTick} IPT).`,
      line: null,
      instruction: null,
      details: {
        instructions: instructionCount,
        instructions_per_tick: instructionsPerTick,
        ticks: estimatedCycleTicks,
      },
    });
  }

  // 先按指令序号、再按规则声明顺序稳定排序，最后才截断。
  findings.sort(compareFindings);
  const limitedFindings = findings.slice(0, resolveLimit(settings.maxFindings, DEFAULT_MAX_FINDINGS));

  const opcodes = collectOpcodes(instructions);
  const referencedUnits = collectReferencedUnits(instructions);
  const referencedBlocks = collectReferencedBlocks(instructions, settings.linkedBlocks);

  return {
    version: MLOG_AUDIT_VERSION,
    source_sha256: sourceSha256,
    source_truncated: truncated,
    instruction_count: instructionCount,
    estimated_cycle_ticks: estimatedCycleTicks,
    opcodes,
    referenced_units: referencedUnits,
    referenced_blocks: referencedBlocks,
    has_warnings: limitedFindings.some((finding) => finding.severity === 'warning' || finding.severity === 'error'),
    findings: limitedFindings,
    searchable_text: buildSearchableText(processorType, opcodes, referencedUnits, referencedBlocks, auditedSource),
  };
}

/* -------------------------------------------------------------------------- */
/* 词法                                                                       */
/* -------------------------------------------------------------------------- */

/** 只保留审计前缀；若最后一个保留字符是高代理项，则退一个码元避免拆开 surrogate 对。 */
function truncateSource(source: string): { text: string; truncated: boolean } {
  if (source.length <= MAX_SOURCE_CHARS) return { text: source, truncated: false };
  return { text: truncateText(source, MAX_SOURCE_CHARS), truncated: true };
}

/** 通用安全截断：不把 UTF-16 surrogate 对拆成两半。 */
function truncateText(value: string, max: number): string {
  if (max <= 0) return '';
  if (value.length <= max) return value;
  let end = max;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return end > 0 ? value.slice(0, end) : '';
}

function parseInstructions(source: string): Instruction[] {
  const instructions: Instruction[] = [];
  const lines = source.split('\n');
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const tokens = tokenizeLine(lines[lineIndex]);
    if (tokens.length === 0) continue; // 空行与纯注释行不占指令序号，但行号仍按原文本保留
    const first = tokens[0];
    instructions.push({
      index: instructions.length,
      line: lineIndex + 1,
      opcode: first.value.toLowerCase(),
      tokens,
      quotedOpcode: first.quoted,
    });
  }
  return instructions;
}

/**
 * 按空白切分 token。
 * - `#` 在引号字符串外开启行注释；
 * - 双引号字符串支持 \"、\\、\n 转义；
 * - 未闭合字符串消费到行尾而不抛异常（静态审计必须能处理任意输入）。
 */
function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let position = 0;
  while (position < line.length) {
    const code = line.charCodeAt(position);
    if (isWhitespaceCode(code)) {
      position += 1;
      continue;
    }
    const char = line[position];
    if (char === '#') break;

    if (char === '"') {
      position += 1;
      let value = '';
      while (position < line.length) {
        const current = line[position];
        if (current === '\\' && position + 1 < line.length) {
          const escaped = line[position + 1];
          if (escaped === 'n') value += '\n';
          else if (escaped === '"') value += '"';
          else if (escaped === '\\') value += '\\';
          else value += escaped;
          position += 2;
          continue;
        }
        if (current === '"') {
          position += 1;
          break;
        }
        value += current;
        position += 1;
      }
      tokens.push({ value, quoted: true });
      continue;
    }

    const start = position;
    while (position < line.length) {
      const currentCode = line.charCodeAt(position);
      if (isWhitespaceCode(currentCode) || line[position] === '#') break;
      position += 1;
    }
    tokens.push({ value: line.slice(start, position), quoted: false });
  }
  return tokens;
}

function isWhitespaceCode(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0d || code === 0x0b || code === 0x0c || code === 0xa0;
}

/* -------------------------------------------------------------------------- */
/* 逐条指令规则                                                               */
/* -------------------------------------------------------------------------- */

/** MLOG_UNKNOWN_OPCODE：未知指令，或已知指令的未知子命令；每条指令最多一条。 */
function auditInstruction(instruction: Instruction): MlogFinding | null {
  if (instruction.quotedOpcode || !OFFICIAL_OPCODES.has(instruction.opcode)) {
    return {
      code: 'MLOG_UNKNOWN_OPCODE',
      severity: 'warning',
      message: `Unknown mlog opcode "${clipLabel(instruction.opcode)}".`,
      line: instruction.line,
      instruction: instruction.index,
    };
  }

  const allowed = SUBCOMMANDS.get(instruction.opcode);
  if (!allowed) return null;

  const subcommandToken = instruction.tokens[1];
  const subcommand = subcommandToken ? subcommandToken.value.toLowerCase() : '';
  if (!subcommandToken || subcommandToken.quoted || !allowed.has(subcommand)) {
    return {
      code: 'MLOG_UNKNOWN_OPCODE',
      severity: 'warning',
      message: `Unknown ${instruction.opcode} subcommand "${clipLabel(subcommandToken ? subcommandToken.value : '')}".`,
      line: instruction.line,
      instruction: instruction.index,
      details: { subcommand: subcommandToken ? clipLabel(subcommandToken.value) : '' },
    };
  }
  return null;
}

/** MLOG_UNREFERENCED_JUMP：目标必须是能解析成整数的指令序号且落在程序范围内。 */
function auditJumpInstruction(instruction: Instruction, instructionCount: number): MlogFinding | null {
  if (!isOpcode(instruction, 'jump')) return null;
  const targetToken = instruction.tokens[1];
  if (!targetToken || targetToken.quoted) return null;
  const target = parseIntegerLiteral(targetToken.value);
  if (target === null) return null; // 变量、字符串、小数等非整数目标不报告
  if (target >= 0 && target < instructionCount) return null;
  const displayTarget = boundedDetailNumber(target);
  return {
    code: 'MLOG_UNREFERENCED_JUMP',
    severity: 'warning',
    message: `Jump target ${displayTarget} is outside 0..${instructionCount - 1}.`,
    line: instruction.line,
    instruction: instruction.index,
    details: { target: displayTarget },
  };
}

/** MLOG_MEMORY_OUT_OF_RANGE：静态常量索引超出 memory-cell 64 / memory-bank 512。 */
function auditMemoryInstruction(instruction: Instruction): MlogFinding | null {
  if (instruction.quotedOpcode) return null;
  const opcode = instruction.opcode;
  if (opcode !== 'read' && opcode !== 'write') return null;

  const linkToken = instruction.tokens[2];
  const indexToken = instruction.tokens[3];
  if (!linkToken || !indexToken || linkToken.quoted || indexToken.quoted) return null;
  if (!MEMORY_LINK.test(linkToken.value)) return null;

  const index = parseIntegerLiteral(indexToken.value);
  if (index === null) return null; // 非字面量索引无法静态判断，不报告

  const parts = MEMORY_LINK_PARTS.exec(linkToken.value);
  if (!parts) return null;
  const limit = parts[1] === 'cell' ? 64 : 512;
  if (index >= 0 && index < limit) return null;

  return {
    code: 'MLOG_MEMORY_OUT_OF_RANGE',
    severity: 'warning',
    message: `Memory index ${boundedDetailNumber(index)} is outside ${parts[1]}[0..${limit - 1}].`,
    line: instruction.line,
    instruction: instruction.index,
    details: {
      link: clipLabel(linkToken.value),
      limit,
      index: boundedDetailNumber(index),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* 控制流与循环规则                                                           */
/* -------------------------------------------------------------------------- */

/**
 * MLOG_HIGH_FREQ_UBIND_NO_WAIT。
 *
 * 控制流图只包含前 limit 条指令；顺序边默认存在，`end` 终止本帧执行，
 * `jump <target> always` 只有目标边（不产生 fallthrough），其余 jump 同时保留
 * 目标边与顺序边。先求入口 0 的可达集合，再迭代 DFS 找返祖回边；回边按 header
 * 聚合，并在 header 所在 SCC 内反查自然循环，避免循环外前驱把外部的 wait 带进来。
 */
function auditHighFrequencyLoops(instructions: Instruction[], limit: number): MlogFinding[] {
  if (limit <= 0) return [];

  const adjacency: number[][] = Array.from({ length: limit }, () => []);
  const predecessors: number[][] = Array.from({ length: limit }, () => []);
  const addEdge = (from: number, to: number): void => {
    if (from < 0 || to < 0 || from >= limit || to >= limit) return;
    adjacency[from].push(to);
    predecessors[to].push(from);
  };

  for (let index = 0; index < limit; index += 1) {
    const instruction = instructions[index];
    if (isOpcode(instruction, 'end')) continue; // end 结束本帧，不落到下一条
    if (isOpcode(instruction, 'jump')) {
      const target = resolveJumpTarget(instruction, instructions.length);
      if (target !== null) addEdge(index, target);
      const condition = instruction.tokens[2];
      const unconditional = !!condition && !condition.quoted && condition.value.toLowerCase() === 'always';
      if (!unconditional) addEdge(index, index + 1);
    } else {
      addEdge(index, index + 1);
    }
  }

  // 只分析从入口可达的指令。
  const reachable = new Uint8Array(limit);
  reachable[0] = 1;
  const pending: number[] = [0];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) break;
    for (const next of adjacency[node]) {
      if (reachable[next] === 0) {
        reachable[next] = 1;
        pending.push(next);
      }
    }
  }

  // 迭代 DFS：state=1 表示节点仍在当前 DFS 栈上，此时指向它的边就是回边。
  // finishOrder 同时保留完成顺序，供后面的 SCC 计算使用。
  const state = new Uint8Array(limit);
  const backEdges: Array<[number, number]> = [];
  const finishOrder: number[] = [];
  if (reachable[0] === 1) {
    const frames: CfgFrame[] = [{ node: 0, child: 0 }];
    state[0] = 1;
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      const children = adjacency[frame.node];
      if (frame.child < children.length) {
        const next = children[frame.child];
        frame.child += 1;
        if (reachable[next] === 0) continue;
        if (state[next] === 0) {
          state[next] = 1;
          frames.push({ node: next, child: 0 });
        } else if (state[next] === 1) {
          backEdges.push([frame.node, next]);
        }
      } else {
        state[frame.node] = 2;
        finishOrder.push(frame.node);
        frames.pop();
      }
    }
  }
  if (backEdges.length === 0) return [];

  // Kosaraju 第二遍：在反向图上按完成顺序求强连通分量。
  // 自然循环可能把循环外的前驱节点也收进来（不可规约控制流），
  // 与 header 所在 SCC 求交后才得到真正的循环体，避免循环外的 wait 掩盖告警。
  const component = new Int32Array(limit);
  component.fill(-1);
  let componentCount = 0;
  for (let index = finishOrder.length - 1; index >= 0; index -= 1) {
    const root = finishOrder[index];
    if (component[root] !== -1) continue;
    component[root] = componentCount;
    const stack: number[] = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node === undefined) break;
      for (const predecessor of predecessors[node]) {
        if (reachable[predecessor] === 1 && component[predecessor] === -1) {
          component[predecessor] = componentCount;
          stack.push(predecessor);
        }
      }
    }
    componentCount += 1;
  }

  // 按 header 聚合回边：同一个 header 的所有自然循环一次反查完成，避免重复遍历。
  // 只保留同一 SCC 内的尾部；不可规约控制流下的跨分量回边不构成自然循环。
  const tailsByHeader = new Map<number, number[]>();
  for (const [tail, header] of backEdges) {
    if (component[tail] !== component[header]) continue;
    const tails = tailsByHeader.get(header);
    if (tails) tails.push(tail);
    else tailsByHeader.set(header, [tail]);
  }
  if (tailsByHeader.size === 0) return [];

  // 没有高频操作的 SCC 不可能触发本规则，先做分量级剪枝。
  const componentHasHighFrequency = new Uint8Array(componentCount);
  for (let index = 0; index < limit; index += 1) {
    if (reachable[index] !== 1) continue;
    const instruction = instructions[index];
    if (!instruction.quotedOpcode && HIGH_FREQUENCY_OPCODES.has(instruction.opcode)) {
      componentHasHighFrequency[component[index]] = 1;
    }
  }

  const findings: MlogFinding[] = [];
  let workBudget = MAX_LOOP_WORK;
  for (const [header, tails] of tailsByHeader) {
    const headerComponent = component[header];
    if (componentHasHighFrequency[headerComponent] !== 1) continue;
    if (workBudget <= 0) break;

    const headerInstruction = instructions[header];
    // header 本身也属于循环体；若它就是 wait，直接跳过这个循环。
    if (isOpcode(headerInstruction, 'wait')) continue;
    let minIndex = header;
    let maxIndex = header;
    let hasWait = false;
    let incomplete = false;
    let firstHighFrequency: Instruction | null = null;
    const operations = new Set<string>();
    if (!headerInstruction.quotedOpcode && HIGH_FREQUENCY_OPCODES.has(headerInstruction.opcode)) {
      operations.add(headerInstruction.opcode);
      firstHighFrequency = headerInstruction;
    }

    // 以 header 为唯一入口，反向收集所有能到达回边尾部的节点。
    // 只走同一 SCC 的前驱：跨分量的前驱属于循环外部，不能用来判断 wait。
    const visited = new Set<number>([header]);
    const work: number[] = [];
    for (const tail of tails) {
      if (!visited.has(tail)) work.push(tail);
    }
    while (work.length > 0) {
      if (workBudget <= 0) {
        incomplete = true;
        break;
      }
      const node = work.pop();
      if (node === undefined) break;
      workBudget -= 1;
      if (visited.has(node)) continue;
      visited.add(node);
      if (node < minIndex) minIndex = node;
      if (node > maxIndex) maxIndex = node;
      const instruction = instructions[node];
      if (isOpcode(instruction, 'wait')) {
        hasWait = true;
        break; // 已确定该循环带 wait，无需继续反查
      }
      if (!instruction.quotedOpcode && HIGH_FREQUENCY_OPCODES.has(instruction.opcode)) {
        operations.add(instruction.opcode);
        if (!firstHighFrequency || instruction.index < firstHighFrequency.index) {
          firstHighFrequency = instruction;
        }
      }
      for (const predecessor of predecessors[node]) {
        if (component[predecessor] === headerComponent && !visited.has(predecessor)) {
          work.push(predecessor);
        }
      }
    }

    // 预算耗尽时循环体不完整，放弃该结果，避免用残缺集合误判 wait。
    if (incomplete) break;
    if (hasWait || !firstHighFrequency) continue;

    const sortedOperations = Array.from(operations).sort();
    findings.push({
      code: 'MLOG_HIGH_FREQ_UBIND_NO_WAIT',
      severity: 'warning',
      message: `Loop ${minIndex}-${maxIndex} uses ${sortedOperations.join('/')} without a wait instruction.`,
      line: firstHighFrequency.line,
      instruction: firstHighFrequency.index,
      details: {
        loop_start: minIndex,
        loop_end: maxIndex,
        operations: sortedOperations,
      },
    });
  }
  return findings;
}

/** 返回合法的静态跳转目标；非整数、越界或变量目标返回 null。 */
function resolveJumpTarget(instruction: Instruction, instructionCount: number): number | null {
  if (!isOpcode(instruction, 'jump')) return null;
  const targetToken = instruction.tokens[1];
  if (!targetToken || targetToken.quoted) return null;
  const target = parseIntegerLiteral(targetToken.value);
  if (target === null || target < 0 || target >= instructionCount) return null;
  return target;
}

/* -------------------------------------------------------------------------- */
/* 元数据收集                                                                 */
/* -------------------------------------------------------------------------- */

function collectOpcodes(instructions: Instruction[]): string[] {
  const opcodes = new Set<string>();
  for (const instruction of instructions) {
    if (instruction.quotedOpcode) continue;
    const opcode = clipLabel(instruction.opcode);
    if (opcode) opcodes.add(opcode);
  }
  return finalizeList(opcodes);
}

/**
 * 只收集“单位类型”出现位置的值：
 * - ubind 的第一个参数；
 * - radar / uradar 中以 @ 开头的单位内容；
 * - lookup unit 的第二个参数（允许带或不带 @）。
 * ulocate 的 @ 参数在 v160.5 中是矿石/建筑内容（例如 @copper），不是单位类型，
 * 因此不会被计入 referenced_units；@unit 本身是当前绑定单位变量，也不是单位名。
 */
function collectReferencedUnits(instructions: Instruction[]): string[] {
  const units = new Set<string>();
  for (const instruction of instructions) {
    if (instruction.quotedOpcode) continue;
    switch (instruction.opcode) {
      case 'ubind':
        addAtPrefixedUnit(instruction.tokens[1], units);
        break;
      case 'lookup': {
        const typeToken = instruction.tokens[1];
        if (typeToken && !typeToken.quoted && typeToken.value.toLowerCase() === 'unit') {
          addNamedUnit(instruction.tokens[2], units);
        }
        break;
      }
      case 'radar':
      case 'uradar':
        for (let index = 1; index < instruction.tokens.length; index += 1) {
          addAtPrefixedUnit(instruction.tokens[index], units);
        }
        break;
      default:
        break;
    }
  }
  return finalizeList(units);
}

/**
 * 逻辑链接名：linkedBlocks 的合法 name、block/type 内部名，以及 read / write /
 * getlink 的链接参数。getlink 的普通形式第二个参数是数字槽位，不会被误收。
 */
function collectReferencedBlocks(
  instructions: Instruction[],
  linkedBlocks: MlogAuditOptions['linkedBlocks'],
): string[] {
  const blocks = new Set<string>();

  if (Array.isArray(linkedBlocks)) {
    for (const entry of linkedBlocks.slice(0, MAX_LINKED_BLOCKS)) {
      if (!entry || typeof entry !== 'object') continue;
      addBlockIdentifier(entry.name, blocks);
      addInternalName(entry.block, blocks);
      addInternalName(entry.type, blocks);
    }
  }

  for (const instruction of instructions) {
    if (instruction.quotedOpcode) continue;
    if (instruction.opcode === 'read' || instruction.opcode === 'write' || instruction.opcode === 'getlink') {
      addLinkToken(instruction.tokens[2], blocks);
    }
  }
  return finalizeList(blocks);
}

function addAtPrefixedUnit(token: Token | undefined, units: Set<string>): void {
  if (!token || token.quoted || !token.value.startsWith('@')) return;
  addUnitName(token.value.slice(1), units);
}

function addNamedUnit(token: Token | undefined, units: Set<string>): void {
  if (!token || token.quoted) return;
  const name = token.value.startsWith('@') ? token.value.slice(1) : token.value;
  addUnitName(name, units);
}

function addUnitName(name: string, units: Set<string>): void {
  if (!CONTENT_NAME.test(name) || !/[A-Za-z]/.test(name)) return;
  if (name.toLowerCase() === 'unit') return; // @unit 不是单位类型
  units.add(clipLabel(name));
}

function addBlockIdentifier(value: unknown, blocks: Set<string>): void {
  if (typeof value !== 'string') return;
  const name = value.trim();
  if (!IDENTIFIER.test(name)) return;
  blocks.add(clipLabel(name));
}

function addInternalName(value: unknown, blocks: Set<string>): void {
  if (typeof value !== 'string') return;
  const name = value.trim();
  if (!INTERNAL_NAME.test(name)) return;
  blocks.add(clipLabel(name));
}

function addLinkToken(token: Token | undefined, blocks: Set<string>): void {
  if (!token || token.quoted || !IDENTIFIER.test(token.value)) return;
  blocks.add(clipLabel(token.value));
}

/* -------------------------------------------------------------------------- */
/* 检索文本与通用工具                                                         */
/* -------------------------------------------------------------------------- */

function buildSearchableText(
  processorType: string,
  opcodes: string[],
  units: string[],
  blocks: string[],
  source: string,
): string {
  const headerParts: string[] = [];
  if (processorType) headerParts.push(clipLabel(processorType));
  if (opcodes.length > 0) headerParts.push(opcodes.join(' '));
  if (units.length > 0) headerParts.push(units.join(' '));
  if (blocks.length > 0) headerParts.push(blocks.join(' '));
  const header = headerParts.join('\n');

  if (!source) return truncateText(header, MAX_SEARCHABLE_TEXT_CHARS);
  if (!header) return truncateText(source, MAX_SEARCHABLE_TEXT_CHARS);

  const separator = '\n';
  const remaining = MAX_SEARCHABLE_TEXT_CHARS - header.length - separator.length;
  if (remaining <= 0) return truncateText(header, MAX_SEARCHABLE_TEXT_CHARS);
  // 源文本原样追加，保留换行；只截断尾部，且不会拆开 surrogate 对。
  return header + separator + truncateText(source, remaining);
}

function collectInstructionsPerTickKey(processorType: string): string {
  return processorType.trim().toLowerCase();
}

function resolveInstructionsPerTick(processorType: string): number {
  return INSTRUCTIONS_PER_TICK.get(collectInstructionsPerTickKey(processorType)) ?? DEFAULT_INSTRUCTIONS_PER_TICK;
}

function roundToTwoDecimals(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function resolveLimit(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function parseIntegerLiteral(raw: string): number | null {
  const match = INTEGER_LITERAL.exec(raw);
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const body = match[2];
  let magnitude: number;
  if (body.length > 2 && (body[1] === 'x' || body[1] === 'X')) {
    magnitude = Number.parseInt(body.slice(2), 16);
  } else if (body.length > 2 && (body[1] === 'b' || body[1] === 'B')) {
    magnitude = Number.parseInt(body.slice(2), 2);
  } else {
    magnitude = Number(body);
  }
  if (Number.isNaN(magnitude)) return null;
  return sign * magnitude;
}

/** details 中的数字必须可序列化；超大整数字面量用安全整数边界表示。 */
function boundedDetailNumber(value: number): number {
  if (Number.isFinite(value)) return value;
  return value > 0 ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
}

function compareFindings(left: MlogFinding, right: MlogFinding): number {
  const leftInstruction = left.instruction;
  const rightInstruction = right.instruction;
  if (leftInstruction === null && rightInstruction === null) {
    return RULE_ORDER[left.code] - RULE_ORDER[right.code];
  }
  if (leftInstruction === null) return 1;
  if (rightInstruction === null) return -1;
  if (leftInstruction !== rightInstruction) return leftInstruction - rightInstruction;
  return RULE_ORDER[left.code] - RULE_ORDER[right.code];
}

function finalizeList(values: Set<string>): string[] {
  return Array.from(values).sort().slice(0, MAX_LIST_ITEMS);
}

function clipLabel(value: string): string {
  if (typeof value !== 'string') return '';
  return value.length > MAX_LABEL_CHARS ? truncateText(value, MAX_LABEL_CHARS) : value;
}

function isOpcode(instruction: Instruction, opcode: string): boolean {
  return !instruction.quotedOpcode && instruction.opcode === opcode;
}
