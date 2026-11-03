/**
 * Host services whose names must not appear in the bundled peers: Apps Script
 * adds a scope for every service named anywhere in a project, comments included.
 */
export const HOST_SERVICES = [
  'SpreadsheetApp',
  'DocumentApp',
  'SlidesApp',
  'FormApp',
];

/**
 * Lists the host services that `code` names, in `HOST_SERVICES` order.
 * @param {string} code Source text to scan.
 * @returns {string[]} The matching service names.
 */
export function namedHostServices(code) {
  return HOST_SERVICES.filter((name) => new RegExp(`\\b${name}\\b`).test(code));
}
