import { DOCS_RATE_LIMIT_MAX, SharedBudget } from './shared-budget.util';

function at(clock: { now: number }) {
  return new SharedBudget(3, 1_000, () => clock.now);
}

describe('SharedBudget', () => {
  it('allows requests up to the limit and rejects the next one', () => {
    const clock = { now: 0 };
    const budget = at(clock);

    expect(budget.consume('1.2.3.4').allowed).toBe(true);
    expect(budget.consume('1.2.3.4').allowed).toBe(true);
    expect(budget.consume('1.2.3.4').allowed).toBe(true);

    const blocked = budget.consume('1.2.3.4');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks identities independently', () => {
    const clock = { now: 0 };
    const budget = at(clock);

    budget.consume('a');
    budget.consume('a');
    budget.consume('a');
    expect(budget.consume('a').allowed).toBe(false);
    expect(budget.consume('b').allowed).toBe(true);
  });

  it('starts a fresh window once the old one expires', () => {
    const clock = { now: 0 };
    const budget = at(clock);
    budget.consume('a');
    budget.consume('a');
    budget.consume('a');
    expect(budget.consume('a').allowed).toBe(false);

    clock.now = 1_001;
    expect(budget.consume('a').allowed).toBe(true);
  });

  it('reports a retry-after of at least one second so clients never busy-loop', () => {
    const clock = { now: 0 };
    const budget = at(clock);
    for (let i = 0; i < 3; i += 1) budget.consume('a');

    // 999ms left in the window rounds up to 1 second rather than reporting 0.
    clock.now = 999;
    expect(budget.consume('a').retryAfterSeconds).toBe(1);
  });

  it('sweeps expired identities instead of growing without bound', () => {
    const clock = { now: 0 };
    const budget = new SharedBudget(DOCS_RATE_LIMIT_MAX, 1_000, () => clock.now);

    // Cross the tracking ceiling with identities that all expire immediately after.
    for (let i = 0; i < 5_001; i += 1) budget.consume(`crawler-${i}`);

    clock.now = 10_000;
    // The next call triggers the sweep; nothing should be carried over.
    expect(budget.consume('crawler-0').allowed).toBe(true);
  });

  it('defaults to the documented limit and window', () => {
    const budget = new SharedBudget();
    for (let i = 0; i < DOCS_RATE_LIMIT_MAX; i += 1) {
      expect(budget.consume('x').allowed).toBe(true);
    }
    expect(budget.consume('x').allowed).toBe(false);
  });
});
