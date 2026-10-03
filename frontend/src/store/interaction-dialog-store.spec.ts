import {
  alertDialog,
  confirmDialog,
  promptDialog,
  useInteractionDialogStore,
} from './interaction-dialog-store';

describe('interaction dialog requests', () => {
  beforeEach(() => {
    useInteractionDialogStore.setState({ active: null, queue: [] });
  });

  it('serializes requests and returns the submitted values', async () => {
    const confirmed = confirmDialog({ message: 'Delete this item?' });
    const prompted = promptDialog({ title: 'Rename', label: 'New name' });
    const store = useInteractionDialogStore.getState();

    expect(store.active?.kind).toBe('confirm');
    expect(store.queue).toHaveLength(1);
    store.settle(store.active!.id, true);
    await expect(confirmed).resolves.toBe(true);

    const promptRequest = useInteractionDialogStore.getState().active!;
    expect(promptRequest.kind).toBe('prompt');
    useInteractionDialogStore.getState().settle(promptRequest.id, 'saved name');
    await expect(prompted).resolves.toBe('saved name');
    expect(useInteractionDialogStore.getState().active).toBeNull();
  });

  it('treats dismissal as cancel for confirms and prompts', async () => {
    const confirmed = confirmDialog('Proceed?');
    const request = useInteractionDialogStore.getState().active!;
    useInteractionDialogStore.getState().settle(request.id);
    await expect(confirmed).resolves.toBe(false);

    const prompted = promptDialog({ title: 'Input', label: 'Value' });
    const prompt = useInteractionDialogStore.getState().active!;
    useInteractionDialogStore.getState().settle(prompt.id);
    await expect(prompted).resolves.toBeNull();
  });

  it('keeps informational alerts open until the user closes them', async () => {
    const alerted = alertDialog('Saved');
    const request = useInteractionDialogStore.getState().active!;
    expect(request.kind).toBe('alert');
    useInteractionDialogStore.getState().settle(request.id);
    await expect(alerted).resolves.toBeUndefined();
  });
});
