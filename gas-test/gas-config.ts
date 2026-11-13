/** Schema shared by the tests: a bit of each behaviour that matters. */
const testSchema = {
  org: { type: 'string', label: 'Organisation', required: true },
  note: { type: 'string', label: 'Note' },
  passMark: {
    type: 'number',
    label: 'Pass mark',
    default: 70,
    integer: true,
    min: 0,
    max: 100,
  },
  enabled: { type: 'boolean', label: 'Enabled', default: true },
} satisfies GasConfigSchema;

const PROPERTY_PREFIX = 'gasConfig:';

/** The account the tests run as, which is also the only editor. */
const runningUser = (): string =>
  Session.getActiveUser().getEmail().trim().toLowerCase();

/** Deletes every `gasConfig:*` Script Property, leaving the rest alone. */
function cleanProperties(): void {
  const properties = PropertiesService.getScriptProperties();
  for (const key of properties.getKeys()) {
    if (key.startsWith(PROPERTY_PREFIX)) properties.deleteProperty(key);
  }
}

/** Runs `fn` over a clean property store, and cleans up after it. */
function withCleanProperties<T>(fn: () => T): T {
  cleanProperties();
  try {
    return fn();
  } finally {
    cleanProperties();
  }
}

/** A config over `testSchema` with the running user as its only editor. */
function newConfig(
  options: Omit<Partial<GasConfigOptions>, 'schema'> = {},
): GasConfig<typeof testSchema> {
  return new GasConfig<typeof testSchema>({
    ...options,
    schema: testSchema,
    editors: options.editors ?? [runningUser()],
  });
}

let saveCounter = 0;
const saveRequest = (
  changes: Record<string, GasConfigValue>,
  version: string,
  saveId = `gas-test-${Date.now()}-${++saveCounter}`,
): GasConfigSaveRequest => ({ changes, version, saveId });

/** Runs `fn` and returns the envelope carried by the thrown message. */
function thrownEnvelope(fn: () => unknown): GasConfigErrorEnvelope {
  let message: string | undefined;
  try {
    fn();
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }
  assert(message !== undefined, 'expected the call to throw');
  return JSON.parse(message) as GasConfigErrorEnvelope;
}

/** The bootstrap JSON of a rendered page. */
function bootstrapOf(content: string): GasConfigBootstrap {
  const match =
    /<script type="application\/json" id="gas-config-bootstrap">(.*?)<\/script>/.exec(
      content,
    );
  assert(match?.[1], 'the page has no bootstrap element');
  return JSON.parse(match[1]) as GasConfigBootstrap;
}

test('bundled peers and gas-config load', () => {
  assert(typeof GasError === 'function', 'GasError should be defined');
  assert(typeof GasLock === 'object', 'GasLock should be defined');
  assert(typeof GasLogger === 'function', 'GasLogger should be defined');
  assert(typeof GasConfig === 'function', 'GasConfig should be defined');
  assert(typeof GasConfigRpc === 'function', 'GasConfigRpc should be defined');
});

test('Session identifies the running user', () => {
  assert(runningUser() !== '', 'Session.getActiveUser().getEmail() is empty');
});

test('values round-trip through real Script Properties', () => {
  withCleanProperties(() => {
    const config = newConfig();
    assert(config.get('passMark') === 70, 'the default should be served');
    assert(
      config.get('org') === null,
      'an unset value without a default is null',
    );

    const saved = config._saveChanges(saveRequest({ org: 'Acme' }, ''));
    assert(saved.ok, 'the save should succeed');
    assert(saved.version !== '', 'the save should stamp a version');
    assert(
      PropertiesService.getScriptProperties().getProperty('gasConfig:org') ===
        '"Acme"',
      'the value should be stored as JSON',
    );

    // A new instance has no cache: this reads the real store.
    assert(newConfig().get('org') === 'Acme', 'a new instance should read it');
  });
});

test('a cleared value is stored as null and reads as unset', () => {
  withCleanProperties(() => {
    const config = newConfig();
    const first = config._saveChanges(saveRequest({ note: 'Draft' }, ''));
    assert(first.ok, 'the first save should succeed');

    const cleared = config._saveChanges(
      saveRequest({ note: null }, first.version),
    );
    assert(cleared.ok, 'clearing should succeed');
    assert(
      PropertiesService.getScriptProperties().getProperty('gasConfig:note') ===
        'null',
      'a cleared value should be stored as JSON null',
    );
    assert(newConfig().get('note') === null, 'it should read as unset');
  });
});

test('a stale version is a conflict and writes nothing', () => {
  withCleanProperties(() => {
    const config = newConfig();
    const first = config._saveChanges(saveRequest({ org: 'Acme' }, ''));
    assert(first.ok, 'the first save should succeed');

    const stale = config._saveChanges(saveRequest({ org: 'Other' }, ''));
    assert(
      !stale.ok && stale.reason === 'conflict',
      `expected a conflict, got ${JSON.stringify(stale)}`,
    );
    assert(
      stale.version === first.version,
      'the conflict should carry the current version',
    );
    assert(newConfig().get('org') === 'Acme', 'nothing should be written');
  });
});

test('a repeated saveId replays the success', () => {
  withCleanProperties(() => {
    const config = newConfig();
    const request = saveRequest({ org: 'Acme' }, '', 'gas-test-replay');

    const first = config._saveChanges(request);
    const second = config._saveChanges(request);

    assert(first.ok && second.ok, 'both saves should succeed');
    assert(second.version === first.version, 'the version should not move');
    assert(second.changed.length === 0, 'a replay changes nothing');
  });
});

test('a save runs under the real script lock and releases it', () => {
  withCleanProperties(() => {
    let heldInside: boolean | undefined;
    let outer: GoogleAppsScript.Lock.Lock | undefined;
    const lockService: GasConfigLockService = {
      withLock(_scope, callback, options) {
        const lock = LockService.getScriptLock();
        lock.waitLock(options?.timeoutMs ?? 30000);
        outer = lock;
        try {
          heldInside = lock.hasLock();
          return callback();
        } finally {
          lock.releaseLock();
        }
      },
    };

    const saved = newConfig({ lockService })._saveChanges(
      saveRequest({ org: 'Acme' }, ''),
    );

    assert(saved.ok, 'the save should succeed');
    assert(heldInside === true, 'the lock should be held during the save');
    assert(outer?.hasLock() === false, 'the lock should be released');
    const again = LockService.getScriptLock();
    assert(again.tryLock(1000), 'the lock should be free afterwards');
    again.releaseLock();
  });
});

test('the default lock path (GasLock) saves and releases', () => {
  withCleanProperties(() => {
    const saved = newConfig()._saveChanges(saveRequest({ org: 'Acme' }, ''));
    assert(saved.ok, 'the save should succeed with the bundled GasLock');

    const lock = LockService.getScriptLock();
    assert(lock.tryLock(1000), 'the lock should be free afterwards');
    lock.releaseLock();
  });
});

test('the editors check uses the running account', () => {
  withCleanProperties(() => {
    const editor = newConfig();
    assert(editor._canEdit(), 'the running user should be an editor');

    const stranger = newConfig({ editors: ['nobody@example.invalid'] });
    assert(!stranger._canEdit(), 'a user who is not listed cannot edit');

    let thrown: unknown;
    try {
      stranger._saveChanges(saveRequest({ org: 'Acme' }, ''));
    } catch (error) {
      thrown = error;
    }
    const statusCode = (thrown as { statusCode?: unknown } | undefined)
      ?.statusCode;
    assert(statusCode === 401, `expected a 401 error, got ${String(thrown)}`);
    assert(
      PropertiesService.getScriptProperties().getProperty('gasConfig:org') ===
        null,
      'nothing should be written',
    );
  });
});

test('editors come from GAS_CONFIG_EDITORS when omitted', () => {
  const key = 'GAS_CONFIG_EDITORS';
  const properties = PropertiesService.getScriptProperties();
  const previous = properties.getProperty(key);

  try {
    properties.setProperty(key, runningUser());

    const config = new GasConfig({ schema: testSchema });
    assert(config._canEdit(), 'the property should list the running user');
  } finally {
    if (previous === null) properties.deleteProperty(key);
    else properties.setProperty(key, previous);
  }
});

test('createHtmlOutput produces a real page with a parseable bootstrap', () => {
  withCleanProperties(() => {
    const config = newConfig({
      title: 'Gas test settings',
      theme: 'yorsh',
      brand: { primaryColor: '#7a1f5c' },
    });
    config._saveChanges(saveRequest({ org: '</script><b>x' }, ''));

    const output = newConfig({
      title: 'Gas test settings',
      theme: 'yorsh',
      brand: { primaryColor: '#7a1f5c' },
    }).createHtmlOutput();
    const content = output.getContent();

    assert(
      output.getTitle() === 'Gas test settings',
      'the title should be set',
    );
    const viewport = output
      .getMetaTags()
      .find((tag) => tag.getName() === 'viewport');
    assert(
      viewport?.getContent() === 'width=device-width, initial-scale=1',
      'the viewport meta tag should be added',
    );
    assert(
      content.indexOf('id="gas-config-bootstrap"') ===
        content.lastIndexOf('id="gas-config-bootstrap"'),
      'there should be one bootstrap element',
    );
    assert(!content.includes('</script><b>x'), 'the value must be escaped');

    const boot = bootstrapOf(content);
    assert(boot.surface === 'page', 'the surface should be page');
    assert(boot.theme === 'yorsh', 'the theme should be yorsh');
    assert(boot.brand?.primaryColor === '#7a1f5c', 'the brand should be set');
    assert(boot.state?.canEdit === true, 'the running user can edit');
    assert(
      boot.state?.values['org'] === '</script><b>x',
      'the value should round-trip',
    );
  });
});

info('page size', () => {
  const content = newConfig().createHtmlOutput().getContent();
  return `${content.length} characters (HtmlService accepts several MB)`;
});

info('running user', () => {
  const email = runningUser();
  return email === '' ? 'no email' : `email present (${email.length} chars)`;
});

test('GasConfigRpc getSettings and saveSettings', () => {
  withCleanProperties(() => {
    const config = newConfig();
    const state = GasConfigRpc('getSettings') as GasConfigSettingsState;
    assert(state.canEdit, 'the running user can edit');
    assert(state.version === '', 'nothing is saved yet');
    assert(
      state.fields.length === Object.keys(testSchema).length,
      'every field should be listed',
    );

    const saved = GasConfigRpc(
      'saveSettings',
      saveRequest({ org: 'Acme' }, state.version),
    ) as GasConfigSaveSuccess;
    assert(saved.ok && saved.values['org'] === 'Acme', 'the save should apply');
    assert(!('changed' in saved), 'the change list stays internal');
    assert(config.get('org') === 'Acme', 'the value should be readable');

    const conflict = GasConfigRpc(
      'saveSettings',
      saveRequest({ org: 'Other' }, state.version),
    ) as GasConfigSaveConflict;
    assert(conflict.reason === 'conflict', 'a stale version conflicts');
  });
});

test('GasConfigRpc errors parse back to the envelope', () => {
  withCleanProperties(() => {
    newConfig();

    const unknown = thrownEnvelope(() => GasConfigRpc('nope'));
    assert(
      unknown.status === 400 && unknown.code === 'VALIDATION_ERROR',
      `unexpected envelope: ${JSON.stringify(unknown)}`,
    );

    newConfig({ editors: ['nobody@example.invalid'] });
    const refused = thrownEnvelope(() =>
      GasConfigRpc('saveSettings', saveRequest({ org: 'Acme' }, '')),
    );
    assert(
      refused.status === 401 &&
        refused.code === 'UNAUTHORIZED' &&
        refused.error === '[GasConfig] Not authorized',
      `unexpected envelope: ${JSON.stringify(refused)}`,
    );
    assert(
      !JSON.stringify(refused).includes('@'),
      'the envelope must not carry an email',
    );
  });
});

test('an invalid stored value is flagged with its raw value', () => {
  withCleanProperties(() => {
    PropertiesService.getScriptProperties().setProperty(
      'gasConfig:passMark',
      '"abc"',
    );
    newConfig();

    const state = GasConfigRpc('getSettings') as GasConfigSettingsState;

    assert(
      state.invalid?.join() === 'passMark',
      `unexpected invalid list: ${JSON.stringify(state.invalid)}`,
    );
    assert(state.values['passMark'] === 'abc', 'the raw value should show');
  });
});

test('GasError.handle shapes a bug and logs it through the logger', () => {
  withCleanProperties(() => {
    const warnings: string[] = [];
    const logger: GasConfigLogger = {
      info: () => undefined,
      warn: (message) => void warnings.push(message),
    };
    new GasConfig({
      schema: {
        boom: {
          type: 'string',
          label: 'Boom',
          validate: (): never => {
            throw new TypeError('internal detail');
          },
        },
      },
      editors: [runningUser()],
      logger,
    });

    const envelope = thrownEnvelope(() =>
      GasConfigRpc('saveSettings', saveRequest({ boom: 'x' }, '')),
    );

    assert(
      envelope.status === 500 && envelope.code === 'INTERNAL_ERROR',
      `unexpected envelope: ${JSON.stringify(envelope)}`,
    );
    assert(
      !JSON.stringify(envelope).includes('internal detail'),
      'the envelope must not leak the error',
    );
    assert(warnings.length === 1, `logged ${warnings.length} times, not once`);
  });
});

test('a real GasLogger works as the logger, and logs the change', () => {
  withCleanProperties(() => {
    const logger = new GasLogger({ level: 'info' });
    const infos: Record<string, unknown>[] = [];
    const spy: GasConfigLogger = {
      info: (message, meta) => {
        logger.info(message, meta);
        infos.push({ message, ...meta });
      },
      warn: (message, meta) => logger.warn(message, meta),
    };
    newConfig({ logger: spy });

    GasConfigRpc('saveSettings', saveRequest({ org: 'Acme' }, ''));

    assert(infos.length === 1, `expected one change log, got ${infos.length}`);
    assert(infos[0]?.['message'] === '[GasConfig] Settings changed', 'message');
    assert(infos[0]?.['user'] === runningUser(), 'the user should be logged');

    // A GasLogger instance is accepted directly.
    assert(
      newConfig({ logger }).get('passMark') === 70,
      'a GasLogger instance should be accepted',
    );
  });
});
