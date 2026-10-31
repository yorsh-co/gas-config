import { describe, expect, it } from 'vitest';
import { createMocks, PROPERTIES_WRITE_FAILURE } from './mocks';

describe('fake Script Properties', () => {
  it('returns one store from getScriptProperties', () => {
    const mocks = createMocks();

    expect(mocks.PropertiesService.getScriptProperties()).toBe(
      mocks.PropertiesService.getScriptProperties(),
    );
  });

  it('starts with the given properties', () => {
    const mocks = createMocks({ properties: { a: '1' } });

    expect(mocks.properties.getProperties()).toEqual({ a: '1' });
  });

  it('returns a copy from getProperties', () => {
    const mocks = createMocks({ properties: { a: '1' } });

    const copy = mocks.properties.getProperties();
    copy.a = 'changed';
    copy.b = '2';

    expect(mocks.properties.getProperties()).toEqual({ a: '1' });
  });

  it('merges with setProperties(props, false)', () => {
    const mocks = createMocks({ properties: { a: '1', b: '2' } });

    mocks.properties.setProperties({ b: '3', c: '4' }, false);

    expect(mocks.properties.getProperties()).toEqual({
      a: '1',
      b: '3',
      c: '4',
    });
  });

  it('replaces everything with setProperties(props, true)', () => {
    const mocks = createMocks({ properties: { a: '1', b: '2' } });

    mocks.properties.setProperties({ c: '4' }, true);

    expect(mocks.properties.getProperties()).toEqual({ c: '4' });
  });

  it('accepts only string values', () => {
    const mocks = createMocks();

    expect(() =>
      mocks.properties.setProperties({ a: 1 } as never, false),
    ).toThrow('Property values must be strings');
    expect(mocks.properties.getProperties()).toEqual({});
  });

  it('deletes a property, silently when it is absent', () => {
    const mocks = createMocks({ properties: { a: '1' } });

    mocks.properties.deleteProperty('a');
    mocks.properties.deleteProperty('missing');

    expect(mocks.properties.getProperties()).toEqual({});
  });

  it('fails writes on demand and leaves the store untouched', () => {
    const mocks = createMocks({ properties: { a: '1' } });
    mocks.state.failWrites = true;

    expect(() => mocks.properties.setProperties({ a: '2' }, false)).toThrow(
      PROPERTIES_WRITE_FAILURE,
    );
    expect(() => mocks.properties.deleteProperty('a')).toThrow(
      PROPERTIES_WRITE_FAILURE,
    );
    expect(mocks.properties.getProperties()).toEqual({ a: '1' });
  });
});

describe('fake LockService', () => {
  it('records whether a lock is held at each properties call', () => {
    const mocks = createMocks();
    const lock = mocks.LockService.getScriptLock();

    mocks.properties.getProperties();
    lock?.waitLock(1);
    mocks.properties.getProperties();
    mocks.properties.setProperties({}, false);
    lock?.releaseLock();
    mocks.properties.getProperties();

    expect(mocks.reads).toEqual([false, true, false]);
    expect(mocks.writes).toEqual([true]);
  });

  it('returns null for unavailable scopes', () => {
    const mocks = createMocks({ unavailable: ['document'] });

    expect(mocks.LockService.getDocumentLock()).toBeNull();
    expect(mocks.LockService.getScriptLock()).not.toBeNull();
  });
});

describe('fake Utilities', () => {
  it('returns distinct, deterministic UUIDs', () => {
    const mocks = createMocks();

    expect(mocks.Utilities.getUuid()).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(mocks.Utilities.getUuid()).toBe(
      '00000000-0000-4000-8000-000000000002',
    );
  });
});
