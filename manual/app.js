/**
 * Fixture app for the manual checks in manual/README.md.
 *
 * Pushed by `npm run manual:build` after the bundled peers and the compiled
 * library, as a global-scope Apps Script file. It is consumer code: it
 * declares the one `GasConfig` at global scope (so it exists in every
 * execution, including the `google.script.run` call), adds the menu and serves
 * the page. The host document's `Ui` comes from `getUi_()` in the host file
 * (manual/hosts/), which `npm run manual:build` pushes just before this one.
 *
 * Behaviour is switched with Script Properties (Project Settings, Script
 * properties), so the fixture needs no re-push between checks:
 *
 * - MANUAL_EDITORS: comma-separated editor emails. Falls back to
 *   FALLBACK_EDITORS below.
 * - MANUAL_THEME: `workspace` or `yorsh` (default `yorsh`).
 * - MANUAL_LOGO: `true` to show a `data:` image logo (the yorsh theme only).
 * - MANUAL_BRAND_COLOR: a hex colour such as `#7a1f5c`, overriding the
 *   primary colour.
 * - MANUAL_APP_NAME: the app name shown above the page title. Falls back to
 *   the container's name from `getContainerName_()` in the host file, only where a container is active (not in the web app).
 * - MANUAL_LARGE_SCHEMA: `true` to add 150 extra fields in 5 groups.
 */

/** TESTER: replace with your own email, or set MANUAL_EDITORS instead. */
const FALLBACK_EDITORS = ['you@example.org'];

const LOGO_SVG =
  '<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="32" cy="32" r="32" fill="#276182"/>' +
  '<g filter="url(#filter0_d_517_60)">' +
  '<path d="M18.1621 38.3298C18.1621 78.0427 35.9117 28.7645 35.9117 7.25342L49.2972 37.3849H37.8839" stroke="white" stroke-width="2" stroke-linecap="square" stroke-linejoin="bevel"/>' +
  '</g>' +
  '<g filter="url(#filter1_d_517_60)">' +
  '<path d="M18.1621 38.3298C18.1621 78.0427 35.9117 28.7645 35.9117 7.25342L49.2972 37.3849H37.8839" stroke="white" stroke-width="2" stroke-linecap="square" stroke-linejoin="bevel"/>' +
  '</g>' +
  '<defs>' +
  '<filter id="filter0_d_517_60" x="13.1621" y="6.84741" width="41.0491" height="55.4866" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">' +
  '<feFlood flood-opacity="0" result="BackgroundImageFix"/>' +
  '<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>' +
  '<feOffset dy="4"/>' +
  '<feGaussianBlur stdDeviation="2"/>' +
  '<feComposite in2="hardAlpha" operator="out"/>' +
  '<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>' +
  '<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_517_60"/>' +
  '<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_517_60" result="shape"/>' +
  '</filter>' +
  '<filter id="filter1_d_517_60" x="13.1621" y="6.84741" width="41.0491" height="55.4866" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">' +
  '<feFlood flood-opacity="0" result="BackgroundImageFix"/>' +
  '<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>' +
  '<feOffset dy="4"/>' +
  '<feGaussianBlur stdDeviation="2"/>' +
  '<feComposite in2="hardAlpha" operator="out"/>' +
  '<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>' +
  '<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_517_60"/>' +
  '<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_517_60" result="shape"/>' +
  '</filter>' +
  '</defs>' +
  '</svg>';

/** Reads a fixture switch from Script Properties. */
function setting_(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

/** The app name: the switch, else the container's name, else none. */
function appName_() {
  const named = setting_('MANUAL_APP_NAME');
  if (named) return named;
  try {
    return getContainerName_() || undefined;
  } catch (error) {
    return undefined;
  }
}

function editors_() {
  const listed = setting_('MANUAL_EDITORS');
  return listed
    ? listed
        .split(',')
        .map((email) => email.trim())
        .filter(Boolean)
    : FALLBACK_EDITORS;
}

function brand_() {
  const brand = {};
  const color = setting_('MANUAL_BRAND_COLOR');
  if (color) brand.primaryColor = color;
  if (setting_('MANUAL_LOGO') === 'true') {
    brand.logoUrl = `data:image/svg+xml,${encodeURIComponent(LOGO_SVG)}`;
  }
  return brand;
}

/** The demo schema of the development mock server. */
function schema_() {
  const schema = {
    'org.name': {
      type: 'string',
      label: 'Organisation name',
      description: 'Shown in email subject lines and report headers.',
      group: 'general',
      required: true,
      maxLength: 60,
    },
    'system.locale': {
      type: 'select',
      label: 'Language and region',
      description: 'Used to format dates and numbers.',
      group: 'general',
      required: true,
      default: 'en-GB',
      options: [
        { value: 'en-GB', label: 'English (United Kingdom)' },
        { value: 'en-US', label: 'English (United States)' },
        { value: 'pt-BR', label: 'Português (Brasil)' },
        { value: 'es-ES', label: 'Español (España)' },
        { value: 'fr-FR', label: 'Français (France)' },
      ],
    },
    'form.url': {
      type: 'url',
      label: 'Form link',
      description: "Paste the form's edit link. It ends in /edit.",
      placeholder: 'https://docs.google.com/forms/d/…/edit',
      group: 'form',
      required: true,
      pattern: '^https://docs\\.google\\.com/forms/d/[\\w-]+/edit',
      patternMessage: "Paste the form's edit link. It ends in /edit.",
    },
    'form.closesOn': {
      type: 'date',
      label: 'Closing date',
      description:
        'Responses after this date are ignored. Leave blank to keep the form open.',
      group: 'form',
    },
    'scoring.passMark': {
      type: 'number',
      label: 'Pass mark (%)',
      group: 'scoring',
      required: true,
      default: 70,
      integer: true,
      min: 0,
      max: 100,
    },
    'scoring.maxAttempts': {
      type: 'number',
      label: 'Attempts allowed',
      group: 'scoring',
      required: true,
      default: 3,
      integer: true,
      min: 1,
      max: 10,
    },
    'notify.enabled': {
      type: 'boolean',
      label: 'Email results to respondents',
      description: 'Sends each respondent their score after they submit.',
      group: 'notify',
      default: true,
    },
    'notify.replyTo': {
      type: 'string',
      label: 'Reply-to address',
      placeholder: 'name@example.org',
      group: 'notify',
      pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
      patternMessage: 'Enter an email address',
    },
    'notify.footer': {
      type: 'text',
      label: 'Email footer',
      description: 'Added to the end of every results email.',
      group: 'notify',
      maxLength: 500,
    },
  };

  if (setting_('MANUAL_LARGE_SCHEMA') === 'true') {
    for (let i = 1; i <= 150; i++) {
      schema[`extra.field${i}`] = {
        type: 'string',
        label: `Extra setting ${i}`,
        description: 'Generated to check that a large schema stays usable.',
        group: `extra${(i % 5) + 1}`,
        maxLength: 200,
      };
    }
  }
  return schema;
}

function groups_() {
  const groups = [
    { id: 'general', label: 'General' },
    { id: 'form', label: 'Google Form' },
    { id: 'scoring', label: 'Scoring' },
    { id: 'notify', label: 'Notifications' },
  ];
  if (setting_('MANUAL_LARGE_SCHEMA') === 'true') {
    for (let i = 1; i <= 5; i++) {
      groups.push({ id: `extra${i}`, label: `Extra group ${i}` });
    }
  }
  return groups;
}

/** GasLogger when bundled, else the execution log. */
function logger_() {
  return typeof GasLogger === 'function'
    ? new GasLogger({ level: 'info' })
    : console;
}

// Declared once, at global scope, so it exists in every execution.
const config = new GasConfig({
  title: 'Fixture settings',
  appName: appName_(),
  description:
    'These settings control how this project runs. Changes apply the next time it runs.',
  theme: setting_('MANUAL_THEME') === 'workspace' ? 'workspace' : 'yorsh',
  brand: brand_(),
  editors: editors_(),
  groups: groups_(),
  schema: schema_(),
  logger: logger_(),
});

function onOpen() {
  getUi_()
    .createMenu('Settings')
    .addItem('Open dialog', 'openDialog')
    .addItem('Open sidebar', 'openSidebar')
    .addToUi();
}

// Menu handlers are top-level functions whose names do not end in "_".
function openDialog() {
  config.showDialog(getUi_());
}

function openSidebar() {
  config.showSidebar(getUi_());
}

function doGet() {
  return config.createHtmlOutput();
}
