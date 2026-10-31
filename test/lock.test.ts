import { describe, expect, it, vi } from 'vitest';
import { createLockService, prop, request, setup } from './helpers';

describe('lock: fallback to LockService', () => {
  it('acquires the script lock with the default timeout', () => {
    const { config, mocks } = setup();

    config._saveChanges(request({ org: 'A' }));

    expect(mocks.LockService.getScriptLock).toHaveBeenCalledTimes(1);
    expect(mocks.LockService.getDocumentLock).not.toHaveBeenCalled();
    expect(mocks.LockService.getUserLock).not.toHaveBeenCalled();
    expect(mocks.locks[0]?.waitLock).toHaveBeenCalledWith(30000);
    expect(mocks.locks[0]?.releaseLock).toHaveBeenCalledTimes(1);
  });

  it('passes a custom lockTimeoutMs', () => {
    const { config, mocks } = setup({ lockTimeoutMs: 5000 });

    config._saveChanges(request({ org: 'A' }));

    expect(mocks.locks[0]?.waitLock).toHaveBeenCalledWith(5000);
  });

  it('holds the lock for the re-read and the writes, and releases it', () => {
    const { config, mocks } = setup();

    config._saveChanges(request({ org: 'A', notes: null }));

    expect(mocks.reads).toEqual([true]);
    expect(mocks.writes.length).toBeGreaterThan(0);
    expect(mocks.writes.every(Boolean)).toBe(true);
    expect(mocks.isLocked()).toBe(false);
  });

  it('does not lock to read', () => {
    const { config, mocks } = setup();

    config.get('org');
    config.getAll();

    expect(mocks.LockService.getScriptLock).not.toHaveBeenCalled();
    expect(mocks.reads).toEqual([false]);
  });

  it('does not lock a request it rejects as malformed', () => {
    const { config, mocks } = setup();

    expect(() => config._saveChanges(request({ nope: 1 }))).toThrow();

    expect(mocks.LockService.getScriptLock).not.toHaveBeenCalled();
  });

  it('throws a plain Error when LockService returns no lock', () => {
    const { config } = setup({}, { unavailable: ['script'] });

    expect(() => config._saveChanges(request({ org: 'A' }))).toThrow(
      /^\[GasConfig\] LockService returned no lock for scope "script"/,
    );
  });

  it('releases the lock when the callback throws', () => {
    const { config, mocks } = setup();
    mocks.properties.getProperties.mockImplementationOnce(() => {
      throw new Error('read failed');
    });

    expect(() => config._saveChanges(request({ org: 'A' }))).toThrow(
      'read failed',
    );
    expect(mocks.isLocked()).toBe(false);
  });
});

describe('lock: GasLock', () => {
  it('is preferred when loaded', () => {
    const withLock = vi.fn((scope: string, callback: () => unknown) => {
      void scope;
      return callback();
    });
    const { config, mocks } = setup({}, {}, { GasLock: { withLock } });

    config._saveChanges(request({ org: 'A' }));

    expect(withLock).toHaveBeenCalledTimes(1);
    expect(withLock).toHaveBeenCalledWith('script', expect.any(Function), {
      timeoutMs: 30000,
    });
    expect(mocks.LockService.getScriptLock).not.toHaveBeenCalled();
  });

  it('receives a custom timeout', () => {
    const withLock = vi.fn((scope: string, callback: () => unknown) => {
      void scope;
      return callback();
    });
    const { config } = setup(
      { lockTimeoutMs: 1234 },
      {},
      { GasLock: { withLock } },
    );

    config._saveChanges(request({ org: 'A' }));

    expect(withLock).toHaveBeenCalledWith('script', expect.any(Function), {
      timeoutMs: 1234,
    });
  });

  it('is looked up at call time, not at construction', () => {
    const gasLock: { withLock?: unknown } = {};
    const { config, mocks } = setup({}, {}, { GasLock: gasLock });

    config._saveChanges(request({ org: 'A' }));
    expect(mocks.LockService.getScriptLock).toHaveBeenCalledTimes(1);

    const withLock = vi.fn((scope: string, callback: () => unknown) => {
      void scope;
      return callback();
    });
    gasLock.withLock = withLock;
    config._saveChanges(request({ org: 'B' }, config._readSnapshot().version));

    expect(withLock).toHaveBeenCalledTimes(1);
    expect(mocks.LockService.getScriptLock).toHaveBeenCalledTimes(1);
  });

  it('is ignored when GasLock is not an object with withLock', () => {
    const { config, mocks } = setup({}, {}, { GasLock: 'not a lock' });

    config._saveChanges(request({ org: 'A' }));

    expect(mocks.LockService.getScriptLock).toHaveBeenCalledTimes(1);
  });
});

describe('lock: injected lockService', () => {
  it('is used instead of both GasLock and LockService', () => {
    const { withLock, lockService } = createLockService();
    const gasLock = { withLock: vi.fn() };
    const { config, mocks } = setup(
      { lockService, lockTimeoutMs: 777 },
      {},
      { GasLock: gasLock },
    );

    config._saveChanges(request({ org: 'A' }));

    expect(withLock).toHaveBeenCalledWith('script', expect.any(Function), {
      timeoutMs: 777,
    });
    expect(gasLock.withLock).not.toHaveBeenCalled();
    expect(mocks.LockService.getScriptLock).not.toHaveBeenCalled();
    expect(mocks.store.get(prop('org'))).toBe('"A"');
  });

  it('propagates a lock timeout and writes nothing', () => {
    const lockService = {
      withLock: vi.fn(() => {
        throw new Error('Could not obtain lock');
      }),
    };
    const { config, mocks } = setup({ lockService });

    expect(() => config._saveChanges(request({ org: 'A' }))).toThrow(
      'Could not obtain lock',
    );
    expect(mocks.properties.setProperties).not.toHaveBeenCalled();
  });
});
