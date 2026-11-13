/**
 * Field validation shared by the settings UI and the server.
 *
 * Pure functions only: no DOM and no Apps Script services, as it is compiled
 * for both the backend and the browser. Apps Script has no `URL` global, so
 * URLs are checked syntactically.
 */
declare const GasConfigValidation: Readonly<{
    validateField: (field: GasConfigClientField, value: unknown) => string | null;
    validateAll: (fields: readonly GasConfigClientField[], values: Readonly<Record<string, unknown>>) => Record<string, string>;
    normalize: (field: GasConfigClientField, rawInput: string | number | boolean | null | undefined) => GasConfigValue;
}>;
