import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BOOTSTRAP_ELEMENT =
  '<script type="application/json" id="gas-config-bootstrap">{}</script>';

/** The generated page, as the constant the library ships. */
const html = (): string =>
  new Function(
    readFileSync(`${ROOT}src/generated/gas-config.ui.html.ts`, 'utf8')
      .replace(/^\/\/.*$/gm, '')
      .replace('const _GAS_CONFIG_UI_HTML: string =', 'return'),
  )() as string;

describe('generated UI page', () => {
  it('holds no development-only content', () => {
    expect(html()).not.toContain('data-dev-only');
    expect(html()).not.toContain('mock-server');
  });

  it('inlines every local script and stylesheet', () => {
    expect(html()).not.toMatch(/<script[^>]* src="(?!https?:)/);
    expect(html()).not.toMatch(/<link[^>]* href="(?!https?:)/);
    expect(html()).toContain('GasConfigRpcClient');
    expect(html()).toContain('--color-primary');
  });

  it('contains the bootstrap element exactly once', () => {
    expect(html().split(BOOTSTRAP_ELEMENT)).toHaveLength(2);
  });
});
