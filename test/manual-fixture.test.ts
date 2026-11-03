import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { namedHostServices } from '../scripts/host-services.js';
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

    it('defines getContainerName_', () => {
      expect(source).toMatch(/function getContainerName_\(\)/);
    });

    it('defines getUi_', () => {
      expect(source).toMatch(/function getUi_\(\)/);
    });
  });
});

describe('namedHostServices', () => {
  it('finds a service in code', () => {
    expect(namedHostServices('SpreadsheetApp.openById(x)')).toEqual([
      'SpreadsheetApp',
    ]);
  });

  it('counts comments', () => {
    expect(namedHostServices('// DocumentApp.getUi()')).toEqual([
      'DocumentApp',
    ]);
  });

  it('matches whole, case-sensitive words only', () => {
    expect(
      namedHostServices('const MySpreadsheetAppLike = 1; spreadsheetApp;'),
    ).toEqual([]);
  });

  it('returns every service in HOST_SERVICES order', () => {
    expect(
      namedHostServices('FormApp SlidesApp DocumentApp SpreadsheetApp'),
    ).toEqual(['SpreadsheetApp', 'DocumentApp', 'SlidesApp', 'FormApp']);
  });
});
