import { of } from 'rxjs';
import { CloudSaveNoStoreInterceptor } from './cloud-save-no-store.interceptor';

describe('CloudSaveNoStoreInterceptor', () => {
  it('marks private metadata and signed-URL responses as non-cacheable', () => {
    const setHeader = jest.fn();
    const context = { switchToHttp: () => ({ getResponse: () => ({ setHeader }) }) } as any;
    const next = { handle: () => of({ data: { url: 'short-lived-grant' } }) } as any;

    const result = new CloudSaveNoStoreInterceptor().intercept(context, next);

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
    expect(setHeader).toHaveBeenCalledWith('Expires', '0');
    expect(result).toBeTruthy();
  });
});
