import { describe, expect, it } from 'vitest';
import { loadGasConfigWithPage } from './harness';
import { SCHEMA, createLogger, prop, setup } from './helpers';
import { DEFAULT_EMAIL, createUi, type MockHtmlOutput } from './mocks';

/** Parses the bootstrap element out of a rendered page. */
function bootstrapOf(output: MockHtmlOutput): GasConfigBootstrap {
  const match =
    /<script type="application\/json" id="gas-config-bootstrap">(.*?)<\/script>/s.exec(
      output.content,
    );
  expect(match).not.toBeNull();
  return JSON.parse(
    (match as RegExpExecArray)[1] as string,
  ) as GasConfigBootstrap;
}

const lastOutput = (outputs: MockHtmlOutput[]): MockHtmlOutput =>
  outputs[outputs.length - 1] as MockHtmlOutput;

describe('showDialog', () => {
  it('shows a modal dialog with the default title and size', () => {
    const { config, mocks } = setup();
    const ui = createUi();

    config.showDialog(ui as never);

    expect(ui.showModalDialog).toHaveBeenCalledTimes(1);
    const [output, title] = ui.showModalDialog.mock.calls[0] ?? [];
    expect(title).toBe('Settings');
    expect(output).toBe(lastOutput(mocks.outputs));
    expect(output).toMatchObject({ width: 600, height: 560 });
    expect(bootstrapOf(output as MockHtmlOutput)).toMatchObject({
      surface: 'dialog',
      theme: 'workspace',
      brand: {},
    });
  });

  it('uses the instance title, then the option', () => {
    const { config } = setup({ title: 'Trust settings' });
    const ui = createUi();

    config.showDialog(ui as never);
    config.showDialog(ui as never, { title: 'Other', width: 420, height: 300 });

    expect(ui.showModalDialog.mock.calls[0]?.[1]).toBe('Trust settings');
    expect(ui.showModalDialog.mock.calls[1]?.[1]).toBe('Other');
    expect(ui.showModalDialog.mock.calls[1]?.[0]).toMatchObject({
      width: 420,
      height: 300,
    });
  });

  it('embeds the full state for the current user', () => {
    const { config, mocks } = setup(
      { description: 'Tune it.' },
      { properties: { [prop('passMark')]: '55' } },
    );

    config.showDialog(createUi() as never);

    const { state } = bootstrapOf(lastOutput(mocks.outputs));
    expect(state).toMatchObject({
      title: 'Settings',
      description: 'Tune it.',
      canEdit: true,
      version: '',
    });
    expect(state?.values['passMark']).toBe(55);
    expect(state?.fields.map((field) => field.key)).toEqual(
      Object.keys(SCHEMA),
    );
  });

  it.each([
    ['null', null],
    ['an object without the method', {}],
    ['a ui with only showSidebar', { showSidebar: () => undefined }],
  ])('rejects %s as the ui', (_name, ui) => {
    const { config, mocks } = setup();

    expect(() => config.showDialog(ui as never)).toThrow(
      /^\[GasConfig\] Invalid "ui"/,
    );
    expect(mocks.outputs).toHaveLength(0);
  });

  it.each([
    ['width', { width: 0 }],
    ['width', { width: 12.5 }],
    ['width', { width: '600' }],
    ['height', { height: -1 }],
    ['height', { height: Number.NaN }],
    ['title', { title: '' }],
    ['title', { title: '  ' }],
    ['title', { title: 5 }],
  ])('rejects an invalid %s', (name, options) => {
    const { config } = setup();

    expect(() =>
      config.showDialog(createUi() as never, options as never),
    ).toThrow(new RegExp(`^\\[GasConfig\\] Invalid "${name}"`));
  });

  it('rejects options that are not an object', () => {
    const { config } = setup();

    expect(() => config.showDialog(createUi() as never, 'x' as never)).toThrow(
      /^\[GasConfig\] Invalid options/,
    );
  });
});

describe('showSidebar', () => {
  it('shows the sidebar with a title', () => {
    const { config, mocks } = setup({ title: 'Trust settings' });
    const ui = createUi();

    config.showSidebar(ui as never);

    const output = lastOutput(mocks.outputs);
    expect(ui.showSidebar).toHaveBeenCalledWith(output);
    expect(output.title).toBe('Trust settings');
    expect(bootstrapOf(output).surface).toBe('sidebar');
  });

  it('takes the title option and validates its inputs', () => {
    const { config, mocks } = setup();
    const ui = createUi();

    config.showSidebar(ui as never, { title: 'Mine' });

    expect(lastOutput(mocks.outputs).title).toBe('Mine');
    expect(() => config.showSidebar({} as never)).toThrow(/Invalid "ui"/);
    expect(() => config.showSidebar(ui as never, { title: '' })).toThrow(
      /Invalid "title"/,
    );
  });
});

describe('createHtmlOutput', () => {
  it('returns the page with a title and the viewport meta tag', () => {
    const { config } = setup({ title: 'Trust settings' });

    const output = config.createHtmlOutput() as unknown as MockHtmlOutput;

    expect(output.title).toBe('Trust settings');
    expect(output.metaTags).toEqual([
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ]);
    expect(bootstrapOf(output).surface).toBe('page');
  });

  it('takes the title option and validates it', () => {
    const { config } = setup();

    expect(
      (config.createHtmlOutput({ title: 'Mine' }) as unknown as MockHtmlOutput)
        .title,
    ).toBe('Mine');
    expect(() => config.createHtmlOutput({ title: 3 as never })).toThrow(
      /Invalid "title"/,
    );
  });

  it('appends the appName to the tab title', () => {
    const named = setup({ title: 'Trust settings', appName: 'Portal' });
    const plain = setup({ title: 'Trust settings' });

    expect(
      (named.config.createHtmlOutput() as unknown as MockHtmlOutput).title,
    ).toBe('Trust settings · Portal');
    expect(
      (
        named.config.createHtmlOutput({
          title: 'Mine',
        }) as unknown as MockHtmlOutput
      ).title,
    ).toBe('Mine · Portal');
    expect(
      (plain.config.createHtmlOutput() as unknown as MockHtmlOutput).title,
    ).toBe('Trust settings');
  });

  it('includes the appName in the state only when set', () => {
    const named = setup({ appName: 'Portal' }).config.createHtmlOutput();
    const plain = setup().config.createHtmlOutput();

    expect(bootstrapOf(named as unknown as MockHtmlOutput).state?.appName).toBe(
      'Portal',
    );
    expect(
      bootstrapOf(plain as unknown as MockHtmlOutput).state,
    ).not.toHaveProperty('appName');
  });

  it('rejects an invalid appName', () => {
    for (const appName of ['', '   ', 3 as never]) {
      expect(() => setup({ appName })).toThrow(/Invalid "appName"/);
    }
  });

  it('leaves sidebar and dialog titles unchanged by appName', () => {
    const { config, mocks } = setup({ title: 'Trust settings', appName: 'P' });
    const ui = createUi();

    config.showSidebar(ui as never);
    expect(lastOutput(mocks.outputs).title).toBe('Trust settings');

    config.showDialog(ui as never);
    expect(ui.showModalDialog.mock.calls[0]?.[1]).toBe('Trust settings');
  });

  it('reports a read-only view to a user who is not an editor', () => {
    const { config } = setup({}, { email: 'visitor@example.org' });

    const output = config.createHtmlOutput() as unknown as MockHtmlOutput;

    expect(bootstrapOf(output).state?.canEdit).toBe(false);
  });
});

describe('theme and brand', () => {
  it('defaults to the workspace theme with no brand', () => {
    const { config } = setup();

    expect(config.theme).toBe('workspace');
    expect(config.brand).toEqual({});
  });

  it('embeds the theme, brand and logo of the state', () => {
    const { config, mocks } = setup({
      theme: 'yorsh',
      brand: { primaryColor: '#7a1f5c', logoUrl: 'https://example.org/l.svg' },
    });

    config.createHtmlOutput();

    const boot = bootstrapOf(lastOutput(mocks.outputs));
    expect(boot.theme).toBe('yorsh');
    expect(boot.brand).toEqual({
      primaryColor: '#7a1f5c',
      logoUrl: 'https://example.org/l.svg',
    });
    expect(boot.state?.brand).toEqual({ logoUrl: 'https://example.org/l.svg' });
  });

  it.each(['#fff', '#FFFFFF', '#7a1f5c'])('accepts the colour %s', (color) => {
    expect(() => setup({ brand: { primaryColor: color } })).not.toThrow();
  });

  it.each(['red', '#ff', '#ffff', '#12345g', 'fff', '#fff;}', 7])(
    'rejects the colour %s',
    (color) => {
      expect(() => setup({ brand: { primaryColor: color as never } })).toThrow(
        /^\[GasConfig\] Invalid "brand.primaryColor"/,
      );
    },
  );

  it.each([
    'https://example.org/logo.png',
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/png,abc',
  ])('accepts the logo %s', (logoUrl) => {
    expect(() => setup({ brand: { logoUrl } })).not.toThrow();
  });

  it.each([
    'http://example.org/logo.png',
    'javascript:alert(1)',
    'data:text/html;base64,PGI+',
    'https://exa mple.org',
    'https://',
    '/relative.png',
    9,
  ])('rejects the logo %s', (logoUrl) => {
    expect(() => setup({ brand: { logoUrl: logoUrl as never } })).toThrow(
      /^\[GasConfig\] Invalid "brand.logoUrl"/,
    );
  });

  it('rejects an unknown theme and a malformed brand', () => {
    expect(() => setup({ theme: 'neon' as never })).toThrow(
      /^\[GasConfig\] Invalid "theme"/,
    );
    expect(() => setup({ brand: 'x' as never })).toThrow(
      /^\[GasConfig\] Invalid "brand"/,
    );
    expect(() => setup({ brand: null as never })).toThrow(
      /^\[GasConfig\] Invalid "brand"/,
    );
  });

  it('copies the brand', () => {
    const brand = { primaryColor: '#fff' };
    const { config } = setup({ brand });

    brand.primaryColor = '#000';

    expect(config.brand.primaryColor).toBe('#fff');
  });
});

describe('construction', () => {
  it('touches no Apps Script service', () => {
    const { mocks } = setup({
      theme: 'yorsh',
      brand: { primaryColor: '#fff' },
    });

    expect(mocks.PropertiesService.getScriptProperties).not.toHaveBeenCalled();
    expect(mocks.Session.getActiveUser).not.toHaveBeenCalled();
    expect(mocks.LockService.getScriptLock).not.toHaveBeenCalled();
    expect(mocks.HtmlService.createHtmlOutput).not.toHaveBeenCalled();
  });
});

describe('bootstrap escaping', () => {
  const ATTACK = '</script><script>alert(1)</script>';

  it('keeps a stored value from closing the script element', () => {
    const { config, mocks } = setup(
      {},
      { properties: { [prop('org')]: JSON.stringify(ATTACK) } },
    );

    config.createHtmlOutput();

    const { content } = lastOutput(mocks.outputs);
    expect(content).not.toContain(ATTACK);
    expect(content.split('<script type="application/json"')).toHaveLength(2);
    expect(content).not.toContain('<script>alert(1)');
    expect(bootstrapOf(lastOutput(mocks.outputs)).state?.values['org']).toBe(
      ATTACK,
    );
  });

  it('keeps the title and description from closing it', () => {
    const { config, mocks } = setup({
      title: ATTACK,
      description: `${ATTACK} <!-- x`,
    });

    config.createHtmlOutput();

    const { content } = lastOutput(mocks.outputs);
    expect(content).not.toContain(ATTACK);
    const { state } = bootstrapOf(lastOutput(mocks.outputs));
    expect(state?.title).toBe(ATTACK);
    expect(state?.description).toBe(`${ATTACK} <!-- x`);
  });

  it('escapes the line separators and round-trips the state', () => {
    const value = 'a b c $& $1 `${x}`';
    const { config, mocks } = setup(
      {},
      { properties: { [prop('org')]: JSON.stringify(value) } },
    );

    config.createHtmlOutput();

    const { content } = lastOutput(mocks.outputs);
    expect(content).not.toContain(' ');
    expect(content).not.toContain(' ');
    const state = bootstrapOf(lastOutput(mocks.outputs)).state;
    expect(state?.values['org']).toBe(value);
  });

  it('parses back to exactly the state the RPC returns', () => {
    const { config, mocks, GasConfigRpc } = setup(
      { title: ATTACK },
      { properties: { [prop('notes')]: JSON.stringify(ATTACK) } },
    );

    config.createHtmlOutput();

    expect(bootstrapOf(lastOutput(mocks.outputs)).state).toEqual(
      GasConfigRpc('getSettings'),
    );
  });
});

describe('page integrity', () => {
  it('leaves the rest of the page as shipped', () => {
    const { config, mocks } = setup();

    config.createHtmlOutput();

    const { content } = lastOutput(mocks.outputs);
    expect(content.startsWith('<!doctype html>')).toBe(true);
    expect(content).toContain('GasConfigRpcClient');
  });

  it('throws a clear error when the bootstrap element is missing', () => {
    // A build mismatch: the generated constant lacks the placeholder.
    const { GasConfig } = loadGasConfigWithPage('<html><body></body></html>');
    const config = new GasConfig({
      schema: SCHEMA as GasConfigSchema,
      logger: createLogger(),
      editors: [DEFAULT_EMAIL],
    });

    expect(() => config.createHtmlOutput()).toThrow(
      /^\[GasConfig\] The settings page has no bootstrap element/,
    );
  });
});
