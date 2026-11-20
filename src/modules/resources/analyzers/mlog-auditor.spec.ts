import { createHash } from 'node:crypto';
import { auditMlogSource, MLOG_AUDIT_VERSION } from './mlog-auditor';

/** 用换行拼接测试源码，避免模板字符串里意外的空白。 */
function join(...lines: string[]): string {
  return lines.join('\n');
}

/** 与实现保持同一套 UTF-8 哈希口径。 */
function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** 生成 count 条 noop；末尾换行不会额外产生指令。 */
function noops(count: number): string {
  return 'noop\n'.repeat(count);
}

function findingCodes(source: string, options?: Parameters<typeof auditMlogSource>[1]): string[] {
  return auditMlogSource(source, options).findings.map((finding) => finding.code);
}

describe('mlog 静态审计：基础统计', () => {
  it('统计指令数、SHA-256、opcodes 与周期估算', () => {
    const source = join(
      'set x 0',
      'op add y x 1',
      'print "hello"',
    );
    const result = auditMlogSource(source);

    expect(result.version).toBe(MLOG_AUDIT_VERSION);
    expect(result.source_truncated).toBe(false);
    expect(result.source_sha256).toBe(sha256(source));
    expect(result.instruction_count).toBe(3);
    expect(result.estimated_cycle_ticks).toBe(1.5);
    expect(result.opcodes).toEqual(['op', 'print', 'set']);
    expect(result.findings).toEqual([]);
    expect(result.has_warnings).toBe(false);
    expect(result.searchable_text).toContain('set x 0');
    expect(result.searchable_text).toContain('op add y x 1');
    expect(result.searchable_text.length).toBeLessThanOrEqual(60_000);
  });

  it('原型链上的名字不会被误认为处理器类型或子命令表', () => {
    expect(auditMlogSource('noop', { processorType: 'constructor' }).estimated_cycle_ticks).toBe(0.5);
    expect(auditMlogSource('noop', { processorType: '__proto__' }).estimated_cycle_ticks).toBe(0.5);
    expect(findingCodes('constructor foo')).toEqual(['MLOG_UNKNOWN_OPCODE']);
    expect(() => auditMlogSource('__proto__ __proto__')).not.toThrow();
  });

  it('按处理器类型使用不同 IPT，未知类型回退到 2', () => {
    const source = noops(6);

    expect(auditMlogSource(source, { processorType: 'micro-processor' }).estimated_cycle_ticks).toBe(6);
    expect(auditMlogSource(source, { processorType: 'logic-processor' }).estimated_cycle_ticks).toBe(3);
    expect(auditMlogSource(source, { processorType: 'hyper-processor' }).estimated_cycle_ticks).toBe(2);
    expect(auditMlogSource(source, { processorType: 'world-processor' }).estimated_cycle_ticks).toBe(2);
    expect(auditMlogSource(source, { processorType: 'MICRO-PROCESSOR' }).estimated_cycle_ticks).toBe(6);
    expect(auditMlogSource(source, { processorType: 'quantum-processor' }).estimated_cycle_ticks).toBe(3);
    expect(auditMlogSource(source, { processorType: null }).estimated_cycle_ticks).toBe(3);
    // 2 / 3 = 0.666...，必须四舍五入到两位。
    expect(auditMlogSource(noops(2), { processorType: 'hyper-processor' }).estimated_cycle_ticks).toBe(0.67);
  });
});

describe('MLOG_UNKNOWN_OPCODE', () => {
  it('未知指令与未知子命令都报告，每条指令最多一条', () => {
    const source = join(
      'foo bar',
      'draw bogus',
      'op nonsense a b c',
      'ucontrol teleport',
    );
    const result = auditMlogSource(source);

    expect(result.findings.map((finding) => finding.code)).toEqual([
      'MLOG_UNKNOWN_OPCODE',
      'MLOG_UNKNOWN_OPCODE',
      'MLOG_UNKNOWN_OPCODE',
      'MLOG_UNKNOWN_OPCODE',
    ]);
    expect(result.findings.map((finding) => finding.instruction)).toEqual([0, 1, 2, 3]);
    expect(result.findings.map((finding) => finding.line)).toEqual([1, 2, 3, 4]);
    expect(result.findings.every((finding) => finding.severity === 'warning')).toBe(true);
    // 未知 opcode 不需要子命令 details；已知 opcode 的坏子命令必须带 subcommand。
    expect(result.findings[0].details).toBeUndefined();
    expect(result.findings[1].details).toEqual({ subcommand: 'bogus' });
    expect(result.findings[2].details).toEqual({ subcommand: 'nonsense' });
    expect(result.findings[3].details).toEqual({ subcommand: 'teleport' });
    expect(result.has_warnings).toBe(true);
  });

  it('注释、字符串和大小写混写的合法指令不误报', () => {
    const source = join(
      '# foo bar baz',
      'print "foo bar draw bogus"',
      'DRAW LINERECT 1 2 3 4',
      'Op ADD a b c',
      'CONTROL ENABLED core1 0',
      'uCoNtRoL tArGeTp unit1 0',
      'noop',
    );
    expect(auditMlogSource(source).findings).toEqual([]);
  });

  it('空行和注释不占指令序号，但保留原始行号', () => {
    const source = join('', '# 注释', 'FOO', '', 'noop');
    const result = auditMlogSource(source);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      code: 'MLOG_UNKNOWN_OPCODE',
      line: 3,
      instruction: 0,
    });
    expect(result.instruction_count).toBe(2);
  });

  it('引号字符串作为首个 token 时按未知指令处理且不抛异常', () => {
    const result = auditMlogSource('"print" "x"');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ code: 'MLOG_UNKNOWN_OPCODE', line: 1, instruction: 0 });
  });
});

describe('MLOG_UNREFERENCED_JUMP', () => {
  it('目标越界时报告，包括负目标和等于指令数的目标', () => {
    const positive = auditMlogSource(join('jump 5 always', 'noop'));
    expect(positive.findings).toEqual([expect.objectContaining({
      code: 'MLOG_UNREFERENCED_JUMP',
      severity: 'warning',
      line: 1,
      instruction: 0,
      details: { target: 5 },
    })]);

    const negative = auditMlogSource(join('noop', 'jump -1 notEqual x 0'));
    expect(negative.findings).toEqual([expect.objectContaining({
      code: 'MLOG_UNREFERENCED_JUMP',
      line: 2,
      instruction: 1,
      details: { target: -1 },
    })]);

    const equalToCount = auditMlogSource(join('jump 2 always', 'noop'));
    expect(equalToCount.findings).toEqual([expect.objectContaining({
      code: 'MLOG_UNREFERENCED_JUMP',
      details: { target: 2 },
    })]);
    expect(findingCodes(join('jump 2 always', 'noop'))).toEqual(['MLOG_UNREFERENCED_JUMP']);
  });

  it('合法目标、变量目标、小数、字符串与注释中的 jump 不报告', () => {
    const source = join(
      'jump 1 always',
      'noop',
      'jump x always',
      'jump 1.5 always',
      'print "jump 99"',
      '# jump 99',
    );
    expect(auditMlogSource(source).findings).toEqual([]);
  });
});

describe('MLOG_MEMORY_OUT_OF_RANGE', () => {
  it('cell 64/65 与 bank 512/513 越界', () => {
    const result = auditMlogSource(join(
      'read result cell1 64',
      'read result cell2 65',
      'write 1 bank1 512',
      'write 1 bank2 513',
    ));

    expect(result.findings).toEqual([
      expect.objectContaining({
        code: 'MLOG_MEMORY_OUT_OF_RANGE', line: 1, instruction: 0,
        details: { link: 'cell1', limit: 64, index: 64 },
      }),
      expect.objectContaining({
        code: 'MLOG_MEMORY_OUT_OF_RANGE', line: 2, instruction: 1,
        details: { link: 'cell2', limit: 64, index: 65 },
      }),
      expect.objectContaining({
        code: 'MLOG_MEMORY_OUT_OF_RANGE', line: 3, instruction: 2,
        details: { link: 'bank1', limit: 512, index: 512 },
      }),
      expect.objectContaining({
        code: 'MLOG_MEMORY_OUT_OF_RANGE', line: 4, instruction: 3,
        details: { link: 'bank2', limit: 512, index: 513 },
      }),
    ]);
  });

  it('边界内、非字面量索引和非 memory 链接不报告', () => {
    const source = join(
      'read result cell1 0',
      'read result cell1 63',
      'write 1 bank1 511',
      'read result cell1 i',
      'read result cell1 1.5',
      'read result conveyor1 999',
      'read result cell 999',
      'read result @cell1 999',
      '# read result cell1 999',
      'print "read result cell1 999"',
    );
    expect(auditMlogSource(source).findings).toEqual([]);
  });

  it('mlog 的十六进制和二进制整数字面量同样参与范围判断', () => {
    const result = auditMlogSource(join('read result cell1 0x40', 'write 1 bank1 0b1000000000'));
    expect(result.findings.map((finding) => finding.details)).toEqual([
      { link: 'cell1', limit: 64, index: 64 },
      { link: 'bank1', limit: 512, index: 512 },
    ]);
  });
});

describe('MLOG_HIGH_FREQ_UBIND_NO_WAIT', () => {
  it('无条件回跳与条件循环都报告，并给出循环范围', () => {
    const unconditional = auditMlogSource(join('ubind @flare', 'jump 0 always'));
    expect(unconditional.findings).toEqual([expect.objectContaining({
      code: 'MLOG_HIGH_FREQ_UBIND_NO_WAIT',
      severity: 'warning',
      line: 1,
      instruction: 0,
      details: { loop_start: 0, loop_end: 1, operations: ['ubind'] },
    })]);

    const conditional = auditMlogSource(join(
      'set i 0',
      'uradar enemy any any distance 0 result',
      'op add i i 1',
      'jump 1 lessThan i 10',
    ));
    expect(conditional.findings).toEqual([expect.objectContaining({
      code: 'MLOG_HIGH_FREQ_UBIND_NO_WAIT',
      line: 2,
      instruction: 1,
      details: { loop_start: 1, loop_end: 3, operations: ['uradar'] },
    })]);
  });

  it('同一循环中的 ubind/ulocate/radar/uradar 合并到 operations', () => {
    const source = join(
      'ubind @flare',
      'radar enemy any any distance turret1 result',
      'uradar enemy any any distance 0 result',
      'ulocate ore core true @copper outx outy found building',
      'jump 0 always',
    );
    const result = auditMlogSource(source);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      code: 'MLOG_HIGH_FREQ_UBIND_NO_WAIT',
      line: 1,
      instruction: 0,
      details: {
        loop_start: 0,
        loop_end: 4,
        operations: ['radar', 'ubind', 'ulocate', 'uradar'],
      },
    });
  });

  it('顺序 ubind、含 wait 的循环和不可达循环都不报告', () => {
    expect(auditMlogSource(join(
      'ubind @flare',
      'ucontrol move 10 10 0 0 0',
      'end',
    )).findings).toEqual([]);

    expect(auditMlogSource(join(
      'ubind @flare',
      'wait 1',
      'jump 0 always',
    )).findings).toEqual([]);

    expect(auditMlogSource(join(
      'jump 3 always',
      'ubind @flare',
      'jump 1 always',
      'noop',
    )).findings).toEqual([]);
  });

  it('嵌套循环分别判断：内层无 wait 报告，外层含 wait 不报告', () => {
    const source = join(
      'set i 0',
      'jump 7 greaterThanEq i 3',
      'ubind @flare',
      'op add i i 1',
      'jump 2 lessThan i 3',
      'wait 1',
      'jump 1 always',
      'end',
    );
    const result = auditMlogSource(source);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      code: 'MLOG_HIGH_FREQ_UBIND_NO_WAIT',
      line: 3,
      instruction: 2,
      details: { loop_start: 2, loop_end: 4, operations: ['ubind'] },
    });
  });

  it('循环外的 wait 不会掩盖真正的循环体', () => {
    const source = join(
      'wait 1',
      'jump 3 lessThan x 0',
      'ubind @flare',
      'jump 2 always',
    );
    const result = auditMlogSource(source);

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({
      code: 'MLOG_HIGH_FREQ_UBIND_NO_WAIT',
      line: 3,
      instruction: 2,
      details: { loop_start: 2, loop_end: 3, operations: ['ubind'] },
    });
  });

  it('大小写混写仍然识别，注释和字符串中的关键字不触发', () => {
    const caseInsensitive = auditMlogSource(join('UBIND @flare', 'JuMp 0 AlWaYs'));
    expect(caseInsensitive.findings.map((finding) => finding.code)).toEqual([
      'MLOG_HIGH_FREQ_UBIND_NO_WAIT',
    ]);

    const textual = auditMlogSource(join(
      '# ubind @flare',
      'print "ubind @flare jump 0 always"',
      'noop',
    ));
    expect(textual.findings).toEqual([]);
  });
});

describe('MLOG_LARGE_CYCLE_BUDGET', () => {
  it('超过 60 ticks 时为 info，并给出精确 details', () => {
    const micro = auditMlogSource(noops(61), { processorType: 'micro-processor' });
    const microFinding = micro.findings.find((finding) => finding.code === 'MLOG_LARGE_CYCLE_BUDGET');
    expect(microFinding).toEqual(expect.objectContaining({
      severity: 'info',
      line: null,
      instruction: null,
      details: { instructions: 61, instructions_per_tick: 1, ticks: 61 },
    }));
    expect(micro.has_warnings).toBe(false);

    const hyper = auditMlogSource(noops(181), { processorType: 'hyper-processor' });
    expect(hyper.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MLOG_LARGE_CYCLE_BUDGET',
        details: { instructions: 181, instructions_per_tick: 3, ticks: 60.33 },
      }),
    ]));

    const defaultIpt = auditMlogSource(noops(121), { processorType: 'unknown-processor' });
    expect(defaultIpt.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'MLOG_LARGE_CYCLE_BUDGET',
        details: { instructions: 121, instructions_per_tick: 2, ticks: 60.5 },
      }),
    ]));
  });

  it('恰好 60 ticks 或更少、空程序不报告', () => {
    expect(auditMlogSource(noops(60), { processorType: 'micro-processor' }).findings).toEqual([]);
    expect(auditMlogSource(noops(180), { processorType: 'hyper-processor' }).findings).toEqual([]);
    expect(auditMlogSource(noops(61), { processorType: 'logic-processor' }).findings).toEqual([]);
    expect(auditMlogSource('', { processorType: 'micro-processor' }).findings).toEqual([]);
  });
});

describe('词法：字符串、转义、注释、空行与换行', () => {
  it('引号内的 # 不是注释，转义和大小写正常工作', () => {
    const source = [
      '# 顶部注释 jump 99',
      'print "a # b jump 99"',
      '',
      'set a "say \\"hi\\""',
      'SET B "back\\\\slash\\nnext"   # 行尾注释',
      'draw CLEAR',
    ].join('\n');
    const result = auditMlogSource(source);

    expect(result.instruction_count).toBe(4);
    expect(result.opcodes).toEqual(['draw', 'print', 'set']);
    expect(result.findings).toEqual([]);
    expect(result.source_truncated).toBe(false);
  });

  it('未闭合字符串不会抛异常', () => {
    expect(() => auditMlogSource('print "unterminated')).not.toThrow();
    expect(findingCodes('print "unterminated')).toEqual([]);
  });

  it('CRLF、空行、纯注释源文本', () => {
    const crlf = auditMlogSource('noop\r\n# 注释\r\nnoop\r\n');
    expect(crlf.instruction_count).toBe(2);
    expect(crlf.findings).toEqual([]);

    const empty = auditMlogSource('');
    expect(empty).toMatchObject({
      instruction_count: 0,
      estimated_cycle_ticks: 0,
      opcodes: [],
      referenced_units: [],
      referenced_blocks: [],
      findings: [],
      has_warnings: false,
    });
    expect(empty.searchable_text).toBe('');

    expect(auditMlogSource('# only\n\n   \n').instruction_count).toBe(0);
  });
});

describe('引用收集', () => {
  it('只收集单位类型位置上的 @ 名称与 lookup unit', () => {
    const source = join(
      'ubind @flare',
      'ubind @flare',
      'lookup unit 0 result',
      'lookup unit @dagger result',
      'lookup unit mono result',
      'ulocate ore core true @copper outx outy found building',
      'radar enemy any any distance turret1 result',
      'uradar enemy any any distance 0 result',
      'ubind @unit',
      'ubind "@quasar"',
    );
    const result = auditMlogSource(source);

    expect(result.referenced_units).toEqual(['dagger', 'flare', 'mono']);
    expect(result.referenced_units).not.toContain('copper');
    expect(result.referenced_units).not.toContain('unit');
    expect(result.referenced_units).not.toContain('quasar');
  });

  it('linkedBlocks 与 read/write/getlink 的链接名', () => {
    const source = join(
      'read result cell1 0',
      'write 5 bank2 1',
      'getlink turret1 0',
      'getlink link conveyor1',
      'sensor value turret1 @health',
    );
    const result = auditMlogSource(source, {
      linkedBlocks: [
        { name: 'cell9' },
        { name: 'bad name' },
        { name: null },
        { block: 'memory-cell' },
        { type: 'mindustry.world.blocks.logic.MemoryBlock' },
        { name: 'cell1', block: 'memory-bank' },
      ],
    });

    expect(result.referenced_blocks).toEqual([
      'bank2',
      'cell1',
      'cell9',
      'conveyor1',
      'memory-bank',
      'memory-cell',
      'mindustry.world.blocks.logic.MemoryBlock',
    ].sort());
  });

  it('单位、方块与 opcode 列表按排序去重并截断到 100', () => {
    const unitSource = Array.from({ length: 150 }, (_, index) => `ubind @unit${index}`).join('\n');
    const units = auditMlogSource(unitSource).referenced_units;
    expect(units).toHaveLength(100);
    expect(units[0]).toBe('unit0');
    expect(new Set(units).size).toBe(100);

    const opcodeSource = Array.from({ length: 150 }, (_, index) => `zz${index}`).join('\n');
    const opcodes = auditMlogSource(opcodeSource).opcodes;
    expect(opcodes).toHaveLength(100);
    expect(new Set(opcodes).size).toBe(100);
  });

  it('searchable_text 同时包含处理器、opcode、单位、方块和源文本', () => {
    const source = join('ubind @flare', 'read r cell1 0');
    const searchable = auditMlogSource(source, {
      processorType: 'hyper-processor',
      linkedBlocks: [{ name: 'cell1' }],
    }).searchable_text;

    expect(searchable).toContain('hyper-processor');
    expect(searchable).toContain('ubind');
    expect(searchable).toContain('flare');
    expect(searchable).toContain('cell1');
    expect(searchable).toContain('read r cell1 0');
    expect(searchable.length).toBeLessThanOrEqual(60_000);
  });
});

describe('源文本截断', () => {
  it('正好 131072 个码元不截断，超过时只审计前缀', () => {
    const exact = 'a'.repeat(131_072);
    const exactResult = auditMlogSource(exact);
    expect(exactResult.source_truncated).toBe(false);
    expect(exactResult.instruction_count).toBe(1);

    const oversized = 'noop\n'.repeat(30_000); // 150000 个码元
    const result = auditMlogSource(oversized);
    expect(result.source_truncated).toBe(true);
    // 哈希针对完整输入，而不是审计前缀。
    expect(result.source_sha256).toBe(sha256(oversized));
    // 131072 = 26214 个完整的 "noop\n"，再加半行 "no"。
    expect(result.instruction_count).toBe(26_215);
    expect(result.searchable_text.length).toBeLessThanOrEqual(60_000);
  });

  it('截断点落在 surrogate 对中间时后退一个码元且不抛异常', () => {
    const source = 'a'.repeat(131_071) + '😀' + 'b';
    const result = auditMlogSource(source);

    expect(result.source_truncated).toBe(true);
    expect(result.source_sha256).toBe(sha256(source));
    expect(result.instruction_count).toBe(1);
    // searchable_text 命中不到 131072 边界，但仍应保证不含孤立代理项。
    const lastCode = result.searchable_text.charCodeAt(result.searchable_text.length - 1);
    expect(lastCode >= 0xd800 && lastCode <= 0xdfff).toBe(false);
  });
});

describe('finding 排序与截断', () => {
  const source = [
    'jump 99 notEqual x 0',
    'foo',
    'read r cell1 99',
    'ubind @flare',
    'jump 3 always',
    ...Array.from({ length: 65 }, () => 'noop'),
  ].join('\n');

  it('按 instruction 升序，无法定位的 info 排最后', () => {
    const result = auditMlogSource(source, { processorType: 'micro-processor' });

    expect(result.findings.map((finding) => finding.code)).toEqual([
      'MLOG_UNREFERENCED_JUMP',
      'MLOG_UNKNOWN_OPCODE',
      'MLOG_MEMORY_OUT_OF_RANGE',
      'MLOG_HIGH_FREQ_UBIND_NO_WAIT',
      'MLOG_LARGE_CYCLE_BUDGET',
    ]);
    expect(result.findings.map((finding) => finding.instruction)).toEqual([0, 1, 2, 3, null]);
    expect(result.has_warnings).toBe(true);
    expect(result.instruction_count).toBe(70);
  });

  it('maxFindings 在排序后截断，has_warnings 只反映返回的 findings', () => {
    const two = auditMlogSource(source, { processorType: 'micro-processor', maxFindings: 2 });
    expect(two.findings.map((finding) => finding.code)).toEqual([
      'MLOG_UNREFERENCED_JUMP',
      'MLOG_UNKNOWN_OPCODE',
    ]);
    expect(two.has_warnings).toBe(true);

    const none = auditMlogSource(source, { processorType: 'micro-processor', maxFindings: 0 });
    expect(none.findings).toEqual([]);
    expect(none.has_warnings).toBe(false);

    const four = auditMlogSource(source, { processorType: 'micro-processor', maxFindings: 4 });
    expect(four.findings).toHaveLength(4);
    expect(four.findings.some((finding) => finding.code === 'MLOG_LARGE_CYCLE_BUDGET')).toBe(false);
  });

  it('默认最多返回 100 条 findings', () => {
    const source = Array.from({ length: 150 }, (_, index) => `zz${index}`).join('\n');
    const result = auditMlogSource(source);

    expect(result.findings).toHaveLength(100);
    expect(result.findings[0].instruction).toBe(0);
    expect(result.findings[99].instruction).toBe(99);
  });

  it('maxInstructions 限制逐条规则与 CFG，但不改变指令总数', () => {
    const limited = auditMlogSource(join('foo', 'bar', 'baz'), { maxInstructions: 2 });
    expect(limited.instruction_count).toBe(3);
    expect(limited.findings.map((finding) => finding.instruction)).toEqual([0, 1]);
    expect(limited.opcodes).toEqual(['bar', 'baz', 'foo']);
  });
});
