import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadClient } from './client-harness';

const envelope = (overrides: Partial<GasConfigErrorEnvelope> = {}) =>
  JSON.stringify({
    ok: false,
    status: 401,
    code: 'UNAUTHORIZED',
    error: 'Not authorized',
    ...overrides,
  });

describe('GasConfigRpcClient.call', () => {
  it('resolves with the success value', async () => {
    const { GasConfigRpcClient: rpc } = loadClient((_call, h) =>
      h.success({ title: 'Settings' }),
    );

    await expect(rpc.getSettings()).resolves.toEqual({ title: 'Settings' });
  });

  it('routes the method and payload through GasConfigRpc', async () => {
    const { GasConfigRpcClient: rpc, calls } = loadClient((_call, h) =>
      h.success({ ok: true }),
    );
    const request = { changes: { a: 1 }, version: '3', saveId: 'abc' };

    await rpc.saveSettings(request);
    await rpc.getSettings();

    expect(calls).toEqual([
      { method: 'saveSettings', payload: request },
      { method: 'getSettings', payload: undefined },
    ]);
  });

  it('is frozen', () => {
    expect(Object.isFrozen(loadClient().GasConfigRpcClient)).toBe(true);
  });
});

describe('GasConfigRpcClient failures', () => {
  it('parses the error envelope into status and code', async () => {
    const { GasConfigRpcClient: rpc } = loadClient((_call, h) =>
      h.failure(new Error(envelope({ details: { why: 'x' } }))),
    );

    const error = await rpc.getSettings().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      message: 'Not authorized',
      status: 401,
      code: 'UNAUTHORIZED',
      details: { why: 'x' },
    });
  });

  it('finds the envelope behind a message prefix', async () => {
    const { GasConfigRpcClient: rpc } = loadClient((_call, h) =>
      h.failure(
        new Error('Exception: ' + envelope({ status: 409, code: 'CONFLICT' })),
      ),
    );

    await expect(rpc.getSettings()).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
    });
  });

  it.each([
    ['plain text', new Error('Exception: Service unavailable')],
    ['broken JSON', new Error('{not json')],
    ['JSON that is not an envelope', new Error('{"hello":"world"}')],
    ['a bare string', 'Service unavailable'],
  ])('turns %s into a client error', async (_name, failure) => {
    const { GasConfigRpcClient: rpc } = loadClient((_call, h) =>
      h.failure(failure),
    );

    const error = await rpc.getSettings().catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 0, code: rpc.CLIENT_ERROR_CODE });
    expect((error as Error).message).not.toBe('');
  });

  it('keeps a friendly message when the failure has none', async () => {
    const { GasConfigRpcClient: rpc } = loadClient((_call, h) =>
      h.failure(undefined),
    );

    await expect(rpc.getSettings()).rejects.toMatchObject({
      message: 'Something went wrong. Try again.',
      code: 'CLIENT_ERROR',
    });
  });

  it('turns a synchronous dispatch error into a client error', async () => {
    const { GasConfigRpcClient: rpc } = loadClient(() => {
      throw new Error('Payload too large');
    });

    await expect(rpc.getSettings()).rejects.toMatchObject({
      message: 'Payload too large',
      status: 0,
      code: 'CLIENT_ERROR',
    });
  });

  it('parseFailure returns an existing failure unchanged', async () => {
    const { GasConfigRpcClient: rpc } = loadClient((_call, h) =>
      h.failure(new Error(envelope())),
    );
    const failure = await rpc.getSettings().catch((e: unknown) => e);

    expect(rpc.parseFailure(failure)).toBe(failure);
  });
});

describe('GasConfigRpcClient timeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('exposes a 30 second default', () => {
    expect(loadClient().GasConfigRpcClient.DEFAULT_TIMEOUT_MS).toBe(30000);
  });

  it('rejects with the timeout code once the default deadline passes', async () => {
    const { GasConfigRpcClient: rpc } = loadClient();
    const outcome = rpc.getSettings().catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(29999);
    let settled = false;
    void outcome.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(outcome).resolves.toMatchObject({
      status: 504,
      code: rpc.TIMEOUT_CODE,
    });
  });

  it('honours a per-call deadline', async () => {
    const { GasConfigRpcClient: rpc } = loadClient();
    const outcome = rpc.getSettings({ timeoutMs: 50 }).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(50);

    await expect(outcome).resolves.toMatchObject({ code: 'CLIENT_TIMEOUT' });
  });

  it('ignores a response that arrives after the deadline', async () => {
    let late: ((value: unknown) => void) | undefined;
    const { GasConfigRpcClient: rpc } = loadClient((_call, h) => {
      late = h.success;
    });
    const outcome = rpc.getSettings({ timeoutMs: 10 }).catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(10);
    late?.({ title: 'late' });

    await expect(outcome).resolves.toMatchObject({ code: 'CLIENT_TIMEOUT' });
  });

  it('clears the deadline once the call settles', async () => {
    const { GasConfigRpcClient: rpc } = loadClient((_call, h) => h.success({}));

    await rpc.getSettings();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('GasConfigBootstrapReader.read', () => {
  const state = { title: 'Settings', fields: [], groups: [], values: {} };

  it('reads every key of the bootstrap', () => {
    const { GasConfigBootstrapReader: reader } = loadClient();
    const json = JSON.stringify({
      surface: 'page',
      theme: 'yorsh',
      brand: { primaryColor: '#7a1f5c', logoUrl: 'https://x.test/logo.svg' },
      state,
    });

    expect(reader.read(json, '?surface=sidebar&theme=workspace')).toEqual({
      surface: 'page',
      theme: 'yorsh',
      brand: { primaryColor: '#7a1f5c', logoUrl: 'https://x.test/logo.svg' },
      state,
    });
  });

  it('falls back to the query for what the bootstrap lacks', () => {
    const { GasConfigBootstrapReader: reader } = loadClient();

    expect(
      reader.read('{"theme":"yorsh"}', '?surface=sidebar&theme=workspace'),
    ).toMatchObject({ surface: 'sidebar', theme: 'yorsh', state: null });
  });

  it.each([[''], [null], [undefined], ['{}'], ['not json'], ['[1]'], ['"x"']])(
    'defaults when the bootstrap is %j',
    (json) => {
      const { GasConfigBootstrapReader: reader } = loadClient();

      expect(reader.read(json, '')).toEqual({
        surface: 'dialog',
        theme: 'workspace',
        brand: {},
        state: null,
      });
    },
  );

  it('ignores unknown surfaces, themes and brand values', () => {
    const { GasConfigBootstrapReader: reader } = loadClient();
    const json = JSON.stringify({
      surface: 'popup',
      theme: 7,
      brand: { primaryColor: 3, logoUrl: '' },
      state: 'nope',
    });

    expect(reader.read(json, '?surface=nope')).toEqual({
      surface: 'dialog',
      theme: 'workspace',
      brand: {},
      state: null,
    });
  });
});
