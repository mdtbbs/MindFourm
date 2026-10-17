import { withTimeout } from './with-timeout.util';

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('withTimeout', () => {
  it('resolves with the work result when it beats the deadline', async () => {
    await expect(withTimeout(Promise.resolve('done'), 50, 'Probe')).resolves.toBe('done');
  });

  it('rejects with a labelled timeout error once the deadline passes', async () => {
    await expect(withTimeout(tick(200).then(() => 'late'), 10, 'Home discussions'))
      .rejects.toThrow('Home discussions timed out');
  });

  it('propagates the original rejection instead of the timeout', async () => {
    await expect(withTimeout(Promise.reject(new Error('database down')), 50, 'Probe'))
      .rejects.toThrow('database down');
  });

  it('clears the timer so a late settlement cannot keep the process alive', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    await withTimeout(Promise.resolve(1), 50, 'Probe');
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('clears the timer on the timeout path too', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    await expect(withTimeout(tick(50), 5, 'Probe')).rejects.toThrow('Probe timed out');
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});
