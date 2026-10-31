/**
 * Field validation shared by the settings UI and the server.
 * Pure functions only: no DOM, no Apps Script services.
 */
var GasConfigValidation = (function () {
  'use strict';

  var DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

  /**
   * @param {*} value
   * @returns {boolean} True when the value counts as "not provided".
   */
  function isEmpty(value) {
    return value === null || value === undefined || value === '';
  }

  /**
   * @param {string} text A YYYY-MM-DD string.
   * @returns {boolean} True when the text is a real calendar date.
   */
  function isCalendarDate(text) {
    var match = DATE_PATTERN.exec(text);
    if (!match) return false;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  /**
   * @param {string} text
   * @returns {boolean} True when the text is a parseable https URL.
   */
  function isHttpsUrl(text) {
    try {
      return new URL(text).protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validates a number value against the field rules.
   *
   * @param {object} rules The field's `rules`.
   * @param {*} value
   * @returns {string|null} An error message, or null when valid.
   */
  function validateNumber(rules, value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 'Enter a number';
    }
    if (rules.integer && !Number.isInteger(value))
      return 'Enter a whole number';
    if (rules.min !== undefined && value < rules.min) {
      return 'Enter a value of at least ' + rules.min;
    }
    if (rules.max !== undefined && value > rules.max) {
      return 'Enter a value of at most ' + rules.max;
    }
    return null;
  }

  /**
   * Validates a string-like value against the field rules.
   *
   * @param {object} field
   * @param {string} value
   * @returns {string|null} An error message, or null when valid.
   */
  function validateText(field, value) {
    var rules = field.rules || {};
    if (typeof value !== 'string') return 'Enter a valid value';
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      return 'Use ' + rules.maxLength + ' characters or fewer';
    }
    if (field.type === 'url' && !isHttpsUrl(value)) {
      return 'Enter a link starting with https://';
    }
    if (rules.pattern && !new RegExp(rules.pattern).test(value)) {
      return rules.patternMessage || 'Enter a valid value';
    }
    return null;
  }

  /**
   * Validates a single value against its field definition.
   *
   * @param {object} field A ClientField.
   * @param {string|number|boolean|null} value The normalised value.
   * @returns {string|null} A friendly error message, or null when valid.
   */
  function validateField(field, value) {
    if (field.type === 'boolean') return null;
    if (isEmpty(value)) return field.required ? 'This field is required' : null;

    var rules = field.rules || {};
    switch (field.type) {
      case 'number':
        return validateNumber(rules, value);
      case 'select':
        var options = field.options || [];
        return options.some(function (option) {
          return option.value === value;
        })
          ? null
          : 'Choose one of the options';
      case 'date':
        return typeof value === 'string' && isCalendarDate(value)
          ? null
          : 'Enter a valid date';
      default:
        return validateText(field, value);
    }
  }

  /**
   * Validates every field and returns only the invalid ones.
   *
   * @param {object[]} fields ClientField definitions.
   * @param {Object<string, *>} values Current values keyed by field key.
   * @returns {Object<string, string>} Error messages keyed by field key.
   */
  function validateAll(fields, values) {
    var errors = {};
    fields.forEach(function (field) {
      var message = validateField(field, values[field.key]);
      if (message) errors[field.key] = message;
    });
    return errors;
  }

  /**
   * Converts raw control input into a stored value. Unparseable numbers are
   * kept as the raw string so that validation can report them.
   *
   * @param {object} field A ClientField.
   * @param {string|boolean} rawInput The raw control value.
   * @returns {string|number|boolean|null}
   */
  function normalize(field, rawInput) {
    if (field.type === 'boolean') return Boolean(rawInput);
    var text = String(
      rawInput === null || rawInput === undefined ? '' : rawInput,
    ).trim();
    if (text === '') return null;
    if (field.type === 'number') {
      var parsed = Number(text);
      return Number.isNaN(parsed) ? text : parsed;
    }
    return text;
  }

  return {
    validateField: validateField,
    validateAll: validateAll,
    normalize: normalize,
  };
})();
