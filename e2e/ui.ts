import { expect, type Page } from '@playwright/test';

export type Surface = 'sidebar' | 'dialog' | 'page';
export type Theme = 'workspace' | 'yorsh';

export const SIZES: Record<Surface, { width: number; height: number }> = {
  sidebar: { width: 300, height: 700 },
  dialog: { width: 600, height: 520 },
  page: { width: 1024, height: 768 },
};

export const VALID_FORM_URL = 'https://docs.google.com/forms/d/abc123/edit';

export interface OpenOptions {
  surface?: Surface;
  theme?: Theme;
  scenario?: string;
}

/** Console errors and uncaught exceptions seen by a page. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

/**
 * Keeps the suite offline: Google Fonts answers with an empty stylesheet, so
 * the page falls back to system fonts without a console error.
 */
export async function stubFonts(page: Page): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ contentType: 'text/css', body: '' }),
  );
  await page.route('https://fonts.gstatic.com/**', (route) =>
    route.fulfill({ status: 204 }),
  );
}

/** Opens the UI document directly, sized like its surface. */
export async function openUi(
  page: Page,
  { surface = 'dialog', theme = 'workspace', scenario }: OpenOptions = {},
): Promise<void> {
  await stubFonts(page);
  await page.setViewportSize(SIZES[surface]);
  const query = new URLSearchParams({ surface, theme });
  if (scenario) query.set('scenario', scenario);
  await page.goto(`/src/web/gas-config.ui.html?${query}`);
}

/** Opens the UI and waits for the form to render. */
export async function openReady(
  page: Page,
  options: OpenOptions = {},
): Promise<void> {
  await openUi(page, options);
  await expect(page.getByLabel('Organisation name')).toBeVisible();
}

/** Fills the one required field that starts empty so a save can succeed. */
export async function fillRequired(page: Page): Promise<void> {
  await page.getByLabel('Form link').fill(VALID_FORM_URL);
}

/**
 * Records the `saveId` of every `saveSettings` call the page makes, in order.
 * The returned array fills as the page runs.
 */
export async function recordSaveIds(page: Page): Promise<string[]> {
  const saveIds: string[] = [];
  await page.exposeFunction('recordSave', (saveId: string) =>
    saveIds.push(saveId),
  );
  await page.addInitScript(() => {
    type Runner = Record<string, unknown>;
    const wrap = (runner: Runner): Runner =>
      new Proxy(runner, {
        get: (target, name: string) => {
          const member = target[name];
          if (typeof member !== 'function') return member;
          return (...args: unknown[]) => {
            if (name === 'GasConfigRpc' && args[0] === 'saveSettings') {
              const record = (window as unknown as Record<string, unknown>)[
                'recordSave'
              ] as (saveId: string) => void;
              record((args[1] as { saveId: string }).saveId);
            }
            const result: unknown = (
              member as (...a: unknown[]) => unknown
            ).apply(target, args);
            return typeof result === 'object' && result !== null
              ? wrap(result as Runner)
              : result;
          };
        },
      });

    // The mock server assigns `google` after this script runs.
    let current: unknown;
    Object.defineProperty(window, 'google', {
      configurable: true,
      get: () => current,
      set: (value: { script: { run: Runner } }) => {
        value.script.run = wrap(value.script.run);
        current = value;
      },
    });
  });
  return saveIds;
}
