import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './harness';

/**
 * Apps Script derives a project's OAuth scopes by scanning its code for
 * service names, so a fixture that names all four host services asks for all
 * four hosts' data scopes.
 */
const FORBIDDEN = ['SpreadsheetApp', 'DocumentApp', 'SlidesApp', 'FormApp'];

const HOSTS: Record<string, string> = {
  sheets: 'SpreadsheetApp',
  docs: 'DocumentApp',
  slides: 'SlidesApp',
  forms: 'FormApp',
};

/** Whether `source` names the service `identifier`, comments included. */
function names(source: string, identifier: string): boolean {
  return new RegExp(`\\b${identifier}\\b`).test(source);
}

describe('manual fixture scopes', () => {
  it.each(FORBIDDEN)('app.js never names %s', (identifier) => {
    const source = readFileSync(join(ROOT, 'manual/app.js'), 'utf8');
    expect(names(source, identifier)).toBe(false);
  });

  describe.each(Object.entries(HOSTS))('%s host file', (host, service) => {
    const source = readFileSync(join(ROOT, `manual/hosts/${host}.js`), 'utf8');

    it(`names only ${service}`, () => {
      for (const identifier of FORBIDDEN) {
        expect(names(source, identifier)).toBe(identifier === service);
      }
    });

    it('narrows the scope to the current document', () => {
      expect(source).toMatch(/^\/\*\* @OnlyCurrentDoc \*\/$/m);
    });

    it('defines getUi_', () => {
      expect(source).toMatch(/function getUi_\(\)/);
    });
  });
});
