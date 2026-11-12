import { expect, test } from '@playwright/test';
import { stubFonts } from './ui';

const BOOTSTRAP_ELEMENT =
  '<script type="application/json" id="gas-config-bootstrap">{}</script>';

const state: GasConfigSettingsState = {
  title: 'Embedded settings',
  description: 'Rendered from the bootstrap.',
  canEdit: true,
  version: '7',
  groups: [{ id: 'general', label: 'General' }],
  fields: [
    {
      key: 'org.name',
      type: 'string',
      label: 'Organisation name',
      group: 'general',
      required: true,
      default: '',
    },
  ],
  values: { 'org.name': 'Embedded Trust' },
};

/** Counts calls and never answers: any call would leave a skeleton behind. */
const GOOGLE_STUB = `
  window.__calls = [];
  var google = { script: {
    run: { withSuccessHandler: function () { return this; },
           withFailureHandler: function () { return this; },
           GasConfigRpc: function (method) { window.__calls.push(method); } },
    host: { close: function () {} } } };
`;

/** Replaces the placeholder the way the server does, with "<" escaped. */
const embed = (bootstrap: GasConfigBootstrap): string =>
  `<script type="application/json" id="gas-config-bootstrap">${JSON.stringify(
    bootstrap,
  ).replace(/</g, '\\u003c')}</script>`;

async function openEmbedded(
  page: import('@playwright/test').Page,
  bootstrap: GasConfigBootstrap,
): Promise<void> {
  await stubFonts(page);
  await page.route('**/dev/mock-server.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: GOOGLE_STUB }),
  );
  await page.route('**/src/web/gas-config.ui.html**', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    expect(html).toContain(BOOTSTRAP_ELEMENT);
    await route.fulfill({
      response,
      body: html.replace(BOOTSTRAP_ELEMENT, embed(bootstrap)),
    });
  });
  await page.goto('/src/web/gas-config.ui.html');
}

test('renders an embedded state without calling getSettings', async ({
  page,
}) => {
  await openEmbedded(page, { surface: 'page', theme: 'workspace', state });

  await expect(page.getByLabel('Organisation name')).toHaveValue(
    'Embedded Trust',
  );
  await expect(
    page.getByRole('heading', { name: 'Embedded settings' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-surface', 'page');
  await expect(page.locator('.skeleton')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as never as { __calls: string[] }).__calls,
    ),
  ).toEqual([]);
});

test('takes surface and theme from the bootstrap over the query', async ({
  page,
}) => {
  await stubFonts(page);
  await page.route('**/dev/mock-server.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: GOOGLE_STUB }),
  );
  await page.route('**/src/web/gas-config.ui.html**', async (route) => {
    const response = await route.fetch();
    const html = await response.text();
    await route.fulfill({
      response,
      body: html.replace(
        BOOTSTRAP_ELEMENT,
        embed({ surface: 'sidebar', theme: 'yorsh' }),
      ),
    });
  });

  await page.goto('/src/web/gas-config.ui.html?surface=page&theme=workspace');

  await expect(page.locator('html')).toHaveAttribute('data-surface', 'sidebar');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'yorsh');
});

test('fetches the state when the bootstrap has none', async ({ page }) => {
  await openEmbedded(page, { surface: 'dialog' });

  await expect(page.locator('.skeleton').first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as never as { __calls: string[] }).__calls),
    )
    .toEqual(['getSettings']);
});

test('applies the brand colour as --color-primary on the root element', async ({
  page,
}) => {
  await openEmbedded(page, {
    surface: 'dialog',
    brand: { primaryColor: '#7a1f5c' },
    state,
  });

  await expect(page.getByLabel('Organisation name')).toBeVisible();
  await expect(page.locator('html')).toHaveCSS('--color-primary', '#7a1f5c');
  await expect(page.locator('html')).toHaveAttribute(
    'style',
    /--color-primary: #7a1f5c/,
  );
});

test('runs against the unreplaced placeholder', async ({ page }) => {
  await stubFonts(page);
  await page.goto(
    '/src/web/gas-config.ui.html?surface=sidebar&scenario=normal',
  );

  await expect(page.getByLabel('Organisation name')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-surface', 'sidebar');
});

test('renders a denied bootstrap without calling getSettings', async ({
  page,
}) => {
  await openEmbedded(page, {
    surface: 'page',
    theme: 'workspace',
    denied: { title: 'Locked settings', appName: 'Acme' },
  });

  await expect(
    page.getByRole('heading', { name: 'Locked settings' }),
  ).toBeVisible();
  await expect(
    page.getByText('You do not have access to these settings.'),
  ).toBeVisible();
  await expect(page.getByLabel('Organisation name')).toHaveCount(0);
  await expect(page.locator('.skeleton')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as never as { __calls: string[] }).__calls,
    ),
  ).toEqual([]);
});

test('renders the denied view when getSettings fails with a 401', async ({
  page,
}) => {
  await stubFonts(page);
  await page.route('**/dev/mock-server.js', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `
        var google = { script: {
          run: (function () {
            var failure;
            var runner = {
              withSuccessHandler: function () { return runner; },
              withFailureHandler: function (fn) { failure = fn; return runner; },
              GasConfigRpc: function () {
                failure(new Error(JSON.stringify({ ok: false, status: 401,
                  code: 'UNAUTHORIZED', error: 'Not authorized' })));
              },
            };
            return runner;
          })(),
          host: { close: function () {} } } };
      `,
    }),
  );
  await page.goto('/src/web/gas-config.ui.html?surface=page');

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(
    page.getByText('You do not have access to these settings.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
});
