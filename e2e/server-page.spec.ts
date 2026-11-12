import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createGasLoader, loadOrderFiles } from 'gasdev/test';
import { stubFonts } from './ui';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PAGE_URL = '/server-page.html';

/** What the compiled sources expose to this test. */
interface Library {
  GasConfig: new (options: unknown) => {
    createHtmlOutput(): { getContent(): string };
  };
}

const load = createGasLoader<Library>({
  files: loadOrderFiles(ROOT),
  exports: ['GasConfig'],
  root: ROOT,
});

/**
 * Runs the library sources, as compiled for Apps Script, against minimal
 * fakes and returns the page `createHtmlOutput` produces.
 */
function renderServerPage(): string {
  const properties: Record<string, string> = {
    'gasConfig:org.name': JSON.stringify('Rendered by the server </script>'),
  };
  let content = '';
  const output = {
    setTitle: () => output,
    addMetaTag: () => output,
    getContent: () => content,
  };
  const lock = { waitLock: () => undefined, releaseLock: () => undefined };

  const { GasConfig } = load({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => ({ ...properties }),
        setProperties: () => undefined,
      }),
    },
    LockService: { getScriptLock: () => lock },
    Session: {
      getActiveUser: () => ({ getEmail: () => 'editor@example.org' }),
    },
    Utilities: { getUuid: () => 'uuid-1' },
    HtmlService: {
      createHtmlOutput: (html: string) => ((content = html), output),
    },
    console,
    Error,
    Date,
  });

  const config = new GasConfig({
    title: 'Server settings',
    editors: ['editor@example.org'],
    theme: 'yorsh',
    brand: { primaryColor: '#7a1f5c' },
    groups: [{ id: 'general', label: 'General' }],
    schema: {
      'org.name': {
        type: 'string',
        label: 'Organisation name',
        group: 'general',
        required: true,
      },
    },
  });
  config.createHtmlOutput();
  return content;
}

/** Records every `GasConfigRpc` call and never answers. */
const GOOGLE_STUB = `
  window.__calls = [];
  window.google = { script: {
    run: { withSuccessHandler: function () { return this; },
           withFailureHandler: function () { return this; },
           GasConfigRpc: function (method) { window.__calls.push(method); } },
    host: { close: function () {} } } };
`;

test('renders the page the server code produced, with no getSettings call', async ({
  page,
}) => {
  const html = renderServerPage();
  expect(html).not.toContain('server </script>');

  await stubFonts(page);
  await page.addInitScript(GOOGLE_STUB);
  await page.route(`**${PAGE_URL}`, (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  await page.goto(PAGE_URL);

  await expect(page.getByLabel('Organisation name')).toHaveValue(
    'Rendered by the server </script>',
  );
  await expect(
    page.getByRole('heading', { name: 'Server settings' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-surface', 'page');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'yorsh');
  await expect(page.locator('html')).toHaveCSS('--color-primary', '#7a1f5c');
  await expect(page.locator('.skeleton')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as never as { __calls: string[] }).__calls,
    ),
  ).toEqual([]);
});
