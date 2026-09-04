import { MindustryVersionValue } from './mindustry-version-value';
import { MindustryVersionComparator } from './mindustry-version-comparator';

describe('MindustryVersionValue', () => {
  it('parses "159" as major-only', () => {
    const v = MindustryVersionValue.parse('159');
    expect(v).not.toBeNull();
    expect(v!.major).toBe(159);
    expect(v!.minor).toBeNull();
    expect(v!.toString()).toBe('159');
  });

  it('parses "159.1" as major.minor', () => {
    const v = MindustryVersionValue.parse('159.1');
    expect(v).not.toBeNull();
    expect(v!.major).toBe(159);
    expect(v!.minor).toBe(1);
    expect(v!.toString()).toBe('159.1');
  });

  it('parses "159.7"', () => {
    const v = MindustryVersionValue.parse('159.7');
    expect(v).not.toBeNull();
    expect(v!.major).toBe(159);
    expect(v!.minor).toBe(7);
  });

  it('returns null for invalid inputs', () => {
    expect(MindustryVersionValue.parse(null)).toBeNull();
    expect(MindustryVersionValue.parse(undefined)).toBeNull();
    expect(MindustryVersionValue.parse('')).toBeNull();
    expect(MindustryVersionValue.parse('abc')).toBeNull();
    expect(MindustryVersionValue.parse('159.')).toBeNull();
    expect(MindustryVersionValue.parse('.1')).toBeNull();
    expect(MindustryVersionValue.parse('159.1.2')).toBeNull();
  });

  it('equals checks structural equality', () => {
    const a = MindustryVersionValue.parse('159.1');
    const b = MindustryVersionValue.parse('159.1');
    const c = MindustryVersionValue.parse('159.2');
    expect(a!.equals(b!)).toBe(true);
    expect(a!.equals(c!)).toBe(false);
  });
});

describe('MindustryVersionComparator', () => {
  it('orders major versions ascending', () => {
    const a = MindustryVersionValue.parse('158')!;
    const b = MindustryVersionValue.parse('159')!;
    expect(MindustryVersionComparator.compare(a, b)).toBe(-1);
    expect(MindustryVersionComparator.compare(b, a)).toBe(1);
    expect(MindustryVersionComparator.compare(a, a)).toBe(0);
  });

  it('no-minor sorts before same major with minor', () => {
    const base = MindustryVersionValue.parse('159')!;
    const patch = MindustryVersionValue.parse('159.1')!;
    expect(MindustryVersionComparator.compare(base, patch)).toBe(-1);
  });

  it('compares minors within same major', () => {
    const a = MindustryVersionValue.parse('159.1')!;
    const b = MindustryVersionValue.parse('159.7')!;
    expect(MindustryVersionComparator.compare(a, b)).toBe(-1);
  });

  it('compareRaw returns null for unparseable input', () => {
    expect(MindustryVersionComparator.compareRaw('abc', '159')).toBeNull();
    expect(MindustryVersionComparator.compareRaw('159', null)).toBeNull();
  });

  it('compareRaw compares valid strings', () => {
    expect(MindustryVersionComparator.compareRaw('159', '159.1')).toBe(-1);
    expect(MindustryVersionComparator.compareRaw('159.7', '159.1')).toBe(1);
    expect(MindustryVersionComparator.compareRaw('160', '159.7')).toBe(1);
  });

  it('inRange checks bounds', () => {
    const v = MindustryVersionValue.parse('159.3')!;
    const min = MindustryVersionValue.parse('159')!;
    const max = MindustryVersionValue.parse('160')!;
    expect(MindustryVersionComparator.inRange(v, min, max)).toBe(true);
    expect(MindustryVersionComparator.inRange(v, min, null)).toBe(true);
    expect(MindustryVersionComparator.inRange(v, null, max)).toBe(true);
    expect(MindustryVersionComparator.inRange(v, null, null)).toBe(true);

    const low = MindustryVersionValue.parse('158')!;
    expect(MindustryVersionComparator.inRange(low, min, max)).toBe(false);
  });

  it('newest returns the highest version', () => {
    const versions = [
      MindustryVersionValue.parse('159')!,
      MindustryVersionValue.parse('159.7')!,
      MindustryVersionValue.parse('160')!,
      MindustryVersionValue.parse('159.1')!,
    ];
    const newest = MindustryVersionComparator.newest(versions);
    expect(newest!.toString()).toBe('160');
  });

  it('newest returns null for empty list', () => {
    expect(MindustryVersionComparator.newest([])).toBeNull();
  });

  it('sortAscending orders correctly', () => {
    const versions = [
      MindustryVersionValue.parse('159.7')!,
      MindustryVersionValue.parse('159')!,
      MindustryVersionValue.parse('160')!,
      MindustryVersionValue.parse('159.1')!,
    ];
    const sorted = MindustryVersionComparator.sortAscending(versions);
    expect(sorted.map(v => v.toString())).toEqual(['159', '159.1', '159.7', '160']);
  });
});
