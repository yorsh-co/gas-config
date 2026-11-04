/**
 * Field validation shared by the settings UI and the server.
 *
 * Pure functions only: no DOM and no Apps Script services, as it is compiled
 * for both the backend and the browser. Apps Script has no `URL` global, so
 * URLs are checked syntactically.
 */
const GasConfigValidation = (() => {
  const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
  const HTTPS_URL_PATTERN = /^https:\/\/[^\s/?#]+(?:[/?#]\S*)?$/i;

  /** Whether the value counts as "not provided". */
  const isEmpty = (value: unknown): boolean =>
    value === null || value === undefined || value === '';

  /**
   * Whether the text is a real calendar date written as `YYYY-MM-DD`. Years
   * below 100 are rejected, as `Date.UTC` maps them to 1900-1999.
   */
  const isCalendarDate = (text: string): boolean => {
    const match = DATE_PATTERN.exec(text);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  };

  const isHttpsUrl = (text: string): boolean => HTTPS_URL_PATTERN.test(text);

  const validateNumber = (
    rules: GasConfigClientRules,
    value: unknown,
  ): string | null => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 'Enter a number';
    }
    if (rules.integer && !Number.isInteger(value)) {
      return 'Enter a whole number';
    }
    if (rules.min !== undefined && value < rules.min) {
      return `Enter a value of at least ${rules.min}`;
    }
    if (rules.max !== undefined && value > rules.max) {
      return `Enter a value of at most ${rules.max}`;
    }
    return null;
  };

  const validateText = (
    field: GasConfigClientField,
    value: unknown,
  ): string | null => {
    const rules = field.rules ?? {};

    if (typeof value !== 'string') return 'Enter a valid value';
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      return `Use ${rules.maxLength} characters or fewer`;
    }
    if (field.type === 'url' && !isHttpsUrl(value)) {
      return 'Enter a link starting with https://';
    }
    if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
      return rules.patternMessage || 'Enter a valid value';
    }
    return null;
  };

  /**
   * Validates a single value against its field definition.
   *
   * @param field The field definition.
   * @param value The normalised value.
   * @returns A friendly error message, or null when valid.
   */
  const validateField = (
    field: GasConfigClientField,
    value: unknown,
  ): string | null => {
    if (field.type === 'boolean') return null;
    if (isEmpty(value)) return field.required ? 'This field is required' : null;

    switch (field.type) {
      case 'number':
        return validateNumber(field.rules ?? {}, value);
      case 'select':
        return (field.options ?? []).some((option) => option.value === value)
          ? null
          : 'Choose one of the options';
      case 'date':
        return typeof value === 'string' && isCalendarDate(value)
          ? null
          : 'Enter a valid date';
      default:
        return validateText(field, value);
    }
  };

  /**
   * Validates every field and returns only the invalid ones.
   *
   * @param fields The field definitions.
   * @param values Current values keyed by field key.
   * @returns Error messages keyed by field key.
   */
  const validateAll = (
    fields: readonly GasConfigClientField[],
    values: Readonly<Record<string, unknown>>,
  ): Record<string, string> => {
    const errors: Record<string, string> = {};

    for (const field of fields) {
      const message = validateField(field, values[field.key]);
      if (message) errors[field.key] = message;
    }
    return errors;
  };

  /**
   * Converts raw control input into a stored value. Unparseable numbers are
   * kept as the raw string so that validation can report them.
   *
   * @param field The field definition.
   * @param rawInput The raw control value.
   */
  const normalize = (
    field: GasConfigClientField,
    rawInput: string | number | boolean | null | undefined,
  ): GasConfigValue => {
    if (field.type === 'boolean') return Boolean(rawInput);

    const text = String(
      rawInput === null || rawInput === undefined ? '' : rawInput,
    ).trim();
    if (text === '') return null;

    if (field.type === 'number') {
      const parsed = Number(text);
      return Number.isNaN(parsed) ? text : parsed;
    }
    return text;
  };

  return Object.freeze({ validateField, validateAll, normalize });
})();
