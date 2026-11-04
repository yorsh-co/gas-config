import { describe, expect, it } from 'vitest';
import { loadBare } from './harness';

const { GasConfigValidation: v } = loadBare();

/** Builds a client field with the given type and overrides. */
function field(
  type: GasConfigFieldType,
  overrides: Partial<GasConfigClientField> = {},
): GasConfigClientField {
  return {
    key: 'k',
    type,
    label: 'K',
    required: false,
    default: null,
    ...overrides,
  };
}

describe('GasConfigValidation', () => {
  it('is frozen and exposes exactly the shared functions', () => {
    expect(Object.isFrozen(v)).toBe(true);
    expect(Object.keys(v).sort()).toEqual([
      'normalize',
      'validateAll',
      'validateField',
    ]);
  });

  it('runs in a context without Apps Script services, console or URL', () => {
    expect(
      v.validateField(field('url'), 'https://example.org/path?q=1#top'),
    ).toBeNull();
  });
});

describe('validateField: required and empty', () => {
  it.each([null, undefined, ''])('rejects %j when required', (value) => {
    expect(v.validateField(field('string', { required: true }), value)).toBe(
      'This field is required',
    );
  });

  it.each(['string', 'text', 'number', 'select', 'url', 'date'] as const)(
    'accepts an empty optional %s',
    (type) => {
      expect(v.validateField(field(type), null)).toBeNull();
      expect(v.validateField(field(type), '')).toBeNull();
    },
  );

  it('never reports a boolean as empty or invalid', () => {
    const required = field('boolean', { required: true, default: false });

    expect(v.validateField(required, false)).toBeNull();
    expect(v.validateField(required, true)).toBeNull();
  });
});

describe('validateField: number', () => {
  const number = (rules: GasConfigClientRules = {}) =>
    field('number', { rules });

  it('accepts finite numbers, including zero and negatives', () => {
    expect(v.validateField(number(), 0)).toBeNull();
    expect(v.validateField(number(), -3.5)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity, '12', true, {}])(
    'rejects %j as not a number',
    (value) => {
      expect(v.validateField(number(), value)).toBe('Enter a number');
    },
  );

  it('enforces integer', () => {
    expect(v.validateField(number({ integer: true }), 1.5)).toBe(
      'Enter a whole number',
    );
    expect(v.validateField(number({ integer: true }), 2)).toBeNull();
  });

  it('enforces min and max inclusively', () => {
    const rules = { min: 1, max: 10 };

    expect(v.validateField(number(rules), 0)).toBe(
      'Enter a value of at least 1',
    );
    expect(v.validateField(number(rules), 11)).toBe(
      'Enter a value of at most 10',
    );
    expect(v.validateField(number(rules), 1)).toBeNull();
    expect(v.validateField(number(rules), 10)).toBeNull();
  });

  it('checks integer before the range', () => {
    expect(v.validateField(number({ integer: true, min: 5 }), 1.5)).toBe(
      'Enter a whole number',
    );
  });
});

describe('validateField: text types', () => {
  it.each(['string', 'text'] as const)('rejects a non-string %s', (type) => {
    expect(v.validateField(field(type), 5)).toBe('Enter a valid value');
  });

  it('enforces maxLength inclusively', () => {
    const limited = field('string', { rules: { maxLength: 3 } });

    expect(v.validateField(limited, 'abcd')).toBe('Use 3 characters or fewer');
    expect(v.validateField(limited, 'abc')).toBeNull();
  });

  it('enforces pattern with patternMessage', () => {
    const pattern = field('string', {
      rules: { pattern: '^[a-z]+$', patternMessage: 'Letters only' },
    });

    expect(v.validateField(pattern, 'ab1')).toBe('Letters only');
    expect(v.validateField(pattern, 'ab')).toBeNull();
  });

  it('falls back to a generic message without patternMessage', () => {
    const pattern = field('string', { rules: { pattern: '^a$' } });

    expect(v.validateField(pattern, 'b')).toBe('Enter a valid value');
  });

  it('checks maxLength before pattern', () => {
    const both = field('text', {
      rules: { maxLength: 2, pattern: '^x$', patternMessage: 'Nope' },
    });

    expect(v.validateField(both, 'abc')).toBe('Use 2 characters or fewer');
  });
});

describe('validateField: url', () => {
  it.each([
    'https://example.org',
    'https://example.org/a/b?c=d#e',
    'HTTPS://EXAMPLE.ORG',
    'https://user@example.org:8080/',
  ])('accepts %s', (url) => {
    expect(v.validateField(field('url'), url)).toBeNull();
  });

  it.each([
    'http://example.org',
    'example.org',
    'ftp://example.org',
    'https://',
    'https:///path',
    'https://exa mple.org',
    'javascript:alert(1)',
  ])('rejects %s', (url) => {
    expect(v.validateField(field('url'), url)).toBe(
      'Enter a link starting with https://',
    );
  });

  it('applies pattern after the https check', () => {
    const forms = field('url', {
      rules: {
        pattern: '^https://forms\\.',
        patternMessage: 'Use a form link',
      },
    });

    expect(v.validateField(forms, 'https://example.org')).toBe(
      'Use a form link',
    );
    expect(v.validateField(forms, 'https://forms.example.org')).toBeNull();
  });
});

describe('validateField: select', () => {
  const select = field('select', {
    options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ],
  });

  it('accepts an option value', () => {
    expect(v.validateField(select, 'b')).toBeNull();
  });

  it.each(['c', 'A', 1])('rejects %j', (value) => {
    expect(v.validateField(select, value)).toBe('Choose one of the options');
  });

  it('rejects everything when the field has no options', () => {
    expect(v.validateField(field('select'), 'a')).toBe(
      'Choose one of the options',
    );
  });
});

describe('validateField: date', () => {
  it.each(['2026-10-31', '2024-02-29', '1900-01-01'])('accepts %s', (date) => {
    expect(v.validateField(field('date'), date)).toBeNull();
  });

  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-1-1',
    '31/10/2026',
    '2026-10-31T00:00:00Z',
    20261031,
  ])('rejects %j', (date) => {
    expect(v.validateField(field('date'), date)).toBe('Enter a valid date');
  });
});

describe('validateAll', () => {
  const fields = [
    field('string', { key: 'a', required: true }),
    field('number', { key: 'b', rules: { max: 5 } }),
    field('boolean', { key: 'c' }),
  ];

  it('returns only the invalid fields, keyed', () => {
    expect(v.validateAll(fields, { a: '', b: 9, c: false })).toEqual({
      a: 'This field is required',
      b: 'Enter a value of at most 5',
    });
  });

  it('treats a missing value as empty', () => {
    expect(v.validateAll(fields, {})).toEqual({
      a: 'This field is required',
    });
  });

  it('returns an empty object when everything is valid', () => {
    expect(v.validateAll(fields, { a: 'x', b: 5, c: true })).toEqual({});
  });
});

describe('normalize', () => {
  it('turns blank input into null', () => {
    expect(v.normalize(field('string'), '')).toBeNull();
    expect(v.normalize(field('text'), '   ')).toBeNull();
    expect(v.normalize(field('number'), ' ')).toBeNull();
    expect(v.normalize(field('string'), null)).toBeNull();
    expect(v.normalize(field('string'), undefined)).toBeNull();
  });

  it('trims text', () => {
    expect(v.normalize(field('string'), '  hi ')).toBe('hi');
  });

  it('parses numbers', () => {
    expect(v.normalize(field('number'), ' 12.5 ')).toBe(12.5);
    expect(v.normalize(field('number'), 0)).toBe(0);
    expect(v.normalize(field('number'), '0')).toBe(0);
  });

  it('keeps unparseable numbers as text for validation to report', () => {
    const number = field('number');
    const raw = v.normalize(number, 'abc');

    expect(raw).toBe('abc');
    expect(v.validateField(number, raw)).toBe('Enter a number');
  });

  it('keeps Infinity so validation rejects it', () => {
    const number = field('number');
    const raw = v.normalize(number, 'Infinity');

    expect(v.validateField(number, raw)).toBe('Enter a number');
  });

  it('coerces booleans', () => {
    expect(v.normalize(field('boolean'), true)).toBe(true);
    expect(v.normalize(field('boolean'), false)).toBe(false);
    expect(v.normalize(field('boolean'), null)).toBe(false);
    expect(v.normalize(field('boolean'), '')).toBe(false);
  });

  it('leaves select and date text untouched apart from trimming', () => {
    expect(v.normalize(field('select'), ' pt-BR ')).toBe('pt-BR');
    expect(v.normalize(field('date'), '2026-10-31')).toBe('2026-10-31');
  });
});
