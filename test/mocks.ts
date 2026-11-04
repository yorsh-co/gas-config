import { vi, type Mock } from 'vitest';

/** Message the fake throws for a failed Script Properties write. */
export const PROPERTIES_WRITE_FAILURE = 'Service error: PropertiesService';

type Scope = 'script' | 'document' | 'user';

/** Lock handle returned by the fake, with spies on every method. */
export interface MockLock {
  waitLock: Mock<(timeoutMs: number) => void>;
  tryLock: Mock<(timeoutMs: number) => boolean>;
  releaseLock: Mock<() => void>;
  hasLock: Mock<() => boolean>;
}

/** Meta tag recorded by the `HtmlOutput` fake. */
export interface MockMetaTag {
  name: string;
  content: string;
}

/** Chainable `HtmlOutput` fake that records what was set on it. */
export interface MockHtmlOutput {
  content: string;
  title: string | null;
  width: number | null;
  height: number | null;
  metaTags: MockMetaTag[];
  setTitle(title: string): MockHtmlOutput;
  setWidth(width: number): MockHtmlOutput;
  setHeight(height: number): MockHtmlOutput;
  addMetaTag(name: string, content: string): MockHtmlOutput;
}

/** Test switches for the Apps Script service fakes. */
export interface MockOptions {
  /** Scopes for which `LockService` returns `null`, e.g. `['document']`. */
  unavailable?: Scope[];
  /** Script Properties to start with, e.g. `{ 'gasConfig:org': '"Acme"' }`. */
  properties?: Record<string, string>;
  /**
   * Email `Session.getActiveUser().getEmail()` returns; an `Error` is thrown
   * instead, as when the scope is declined. Defaults to `DEFAULT_EMAIL`.
   */
  email?: string | Error;
}

/** Email of the signed-in user unless a test says otherwise. */
export const DEFAULT_EMAIL = 'editor@example.org';

/**
 * Fresh set of Apps Script service fakes injected as globals.
 *
 * `PropertiesService.getScriptProperties()` returns one store of strings,
 * as the real one does: `getProperties` returns a copy, `setProperties`
 * rejects non-string values and `deleteAllOthers` clears the rest. Setting
 * `failWrites` makes `setProperties` and `deleteProperty` throw.
 *
 * `Session.getActiveUser().getEmail()` returns `options.email`, or throws it
 * when it is an `Error`; both calls are spies.
 *
 * `LockService` models Apps Script's ownership rules: locks are owned per
 * execution and per scope, so every handle for a scope shares one "held"
 * flag. `propertyLockStates` records whether a lock was held at each
 * `getProperties` and `setProperties` call. `Utilities.getUuid` returns a
 * deterministic, incrementing UUID-shaped string.
 */
export function createMocks(options: MockOptions = {}) {
  const unavailable = new Set(options.unavailable);
  const heldScopes = new Set<Scope>();
  const locks: MockLock[] = [];
  const store = new Map<string, string>(
    Object.entries(options.properties ?? {}),
  );
  const state = { failWrites: false };
  const reads: boolean[] = [];
  const writes: boolean[] = [];

  const createLock = (scope: Scope): MockLock => {
    let acquired = false;
    const acquire = (): boolean => {
      heldScopes.add(scope);
      acquired = true;
      return true;
    };

    const lock: MockLock = {
      waitLock: vi.fn(() => void acquire()),
      tryLock: vi.fn(() => acquire()),
      releaseLock: vi.fn(() => {
        heldScopes.delete(scope);
      }),
      hasLock: vi.fn(() => acquired && heldScopes.has(scope)),
    };
    locks.push(lock);
    return lock;
  };

  const factory = (scope: Scope) =>
    vi.fn((): MockLock | null =>
      unavailable.has(scope) ? null : createLock(scope),
    );

  const assertWritable = (): void => {
    if (state.failWrites) throw new Error(PROPERTIES_WRITE_FAILURE);
  };

  const properties = {
    getProperties: vi.fn((): Record<string, string> => {
      reads.push(heldScopes.size > 0);
      return Object.fromEntries(store);
    }),
    getProperty: vi.fn((key: string): string | null => store.get(key) ?? null),
    setProperties: vi.fn(
      (values: Record<string, string>, deleteAllOthers?: boolean): void => {
        writes.push(heldScopes.size > 0);
        assertWritable();
        for (const value of Object.values(values)) {
          if (typeof value !== 'string') {
            throw new Error('Property values must be strings');
          }
        }
        if (deleteAllOthers) store.clear();
        for (const [key, value] of Object.entries(values)) {
          store.set(key, value);
        }
      },
    ),
    deleteProperty: vi.fn((key: string): void => {
      writes.push(heldScopes.size > 0);
      assertWritable();
      store.delete(key);
    }),
  };

  const user = {
    getEmail: vi.fn((): string => {
      const email = options.email ?? DEFAULT_EMAIL;
      if (email instanceof Error) throw email;
      return email;
    }),
  };

  const outputs: MockHtmlOutput[] = [];
  const createHtmlOutput = vi.fn((content: string): MockHtmlOutput => {
    const output: MockHtmlOutput = {
      content,
      title: null,
      width: null,
      height: null,
      metaTags: [],
      setTitle: (title) => ((output.title = title), output),
      setWidth: (width) => ((output.width = width), output),
      setHeight: (height) => ((output.height = height), output),
      addMetaTag: (name, metaContent) => (
        output.metaTags.push({ name, content: metaContent }),
        output
      ),
    };
    outputs.push(output);
    return output;
  });

  let uuidCounter = 0;

  return {
    /** The Script Properties as stored, for seeding and assertions. */
    store,
    properties,
    /** Makes writes to Script Properties throw while `true`. */
    state,
    /** Whether a lock was held at each `getProperties` call. */
    reads,
    /** Whether a lock was held at each `setProperties`/`deleteProperty` call. */
    writes,
    /** Every lock handle handed out, in request order. */
    locks,
    /** Whether this execution currently holds a lock of any scope. */
    isLocked: (): boolean => heldScopes.size > 0,
    Session: { getActiveUser: vi.fn(() => user), user },
    PropertiesService: {
      getScriptProperties: vi.fn(() => properties),
    },
    LockService: {
      getScriptLock: factory('script'),
      getDocumentLock: factory('document'),
      getUserLock: factory('user'),
    },
    HtmlService: { createHtmlOutput },
    /** Every `HtmlOutput` created, in order. */
    outputs,
    Utilities: {
      getUuid: vi.fn(
        (): string =>
          `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
      ),
    },
    console: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
    },
  };
}

export type Mocks = ReturnType<typeof createMocks>;

/** `Ui` fake that records the dialogs and sidebars it is asked to show. */
export function createUi() {
  return {
    showModalDialog: vi.fn((output: MockHtmlOutput, title: string): void => {
      void output;
      void title;
    }),
    showSidebar: vi.fn((output: MockHtmlOutput): void => {
      void output;
    }),
  };
}
