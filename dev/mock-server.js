/**
 * Browser stand-in for `google.script.run` and `google.script.host`, backed by
 * an in-memory settings store. It implements `GasConfigRpc(method, payload)`
 * like the server, failures included: they are errors whose message is the
 * JSON error envelope. Scenarios are selected with `?scenario=`.
 *
 * Marked `data-dev-only` in the UI document, so it is never built into it.
 */
var google = (function () {
  'use strict';

  var scenario =
    new URLSearchParams(window.location.search).get('scenario') || 'normal';
  var latency = scenario === 'slow' ? 2500 : 600;

  var emailPattern = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';
  var schema = {
    title: 'Settings',
    appName: 'Quiz marker',
    description:
      'These settings control how this project runs. Changes apply the next time it runs.',
    brand: { logoUrl: '/dev/assets/yorsh-mark.svg' },
    groups: [
      { id: 'general', label: 'General' },
      { id: 'form', label: 'Google Form' },
      { id: 'scoring', label: 'Scoring' },
      { id: 'notify', label: 'Notifications' },
    ],
    fields: [
      {
        key: 'org.name',
        type: 'string',
        label: 'Organisation name',
        description: 'Shown in email subject lines and report headers.',
        group: 'general',
        required: true,
        default: null,
        rules: { maxLength: 60 },
      },
      {
        key: 'system.locale',
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
      {
        key: 'form.url',
        type: 'url',
        label: 'Form link',
        description: "Paste the form's edit link. It ends in /edit.",
        placeholder: 'https://docs.google.com/forms/d/…/edit',
        group: 'form',
        required: true,
        default: null,
        rules: {
          pattern: '^https://docs\\.google\\.com/forms/d/[\\w-]+/edit',
          patternMessage: "Paste the form's edit link. It ends in /edit.",
        },
      },
      {
        key: 'form.closesOn',
        type: 'date',
        label: 'Closing date',
        description:
          'Responses after this date are ignored. Leave blank to keep the form open.',
        group: 'form',
        required: false,
        default: null,
      },
      {
        key: 'scoring.passMark',
        type: 'number',
        label: 'Pass mark (%)',
        group: 'scoring',
        required: true,
        default: 70,
        rules: { integer: true, min: 0, max: 100 },
      },
      {
        key: 'scoring.maxAttempts',
        type: 'number',
        label: 'Attempts allowed',
        group: 'scoring',
        required: true,
        default: 3,
        rules: { integer: true, min: 1, max: 10 },
      },
      {
        key: 'notify.enabled',
        type: 'boolean',
        label: 'Email results to respondents',
        description: 'Sends each respondent their score after they submit.',
        group: 'notify',
        required: false,
        default: true,
      },
      {
        key: 'notify.replyTo',
        type: 'string',
        label: 'Reply-to address',
        placeholder: 'name@example.org',
        group: 'notify',
        required: false,
        default: null,
        rules: {
          pattern: emailPattern,
          patternMessage: 'Enter an email address',
        },
      },
      {
        key: 'notify.footer',
        type: 'text',
        label: 'Email footer',
        description: 'Added to the end of every results email.',
        group: 'notify',
        required: false,
        default: null,
        rules: { maxLength: 500 },
      },
    ],
  };

  var NEVER = {};

  var store = {
    values: {
      'org.name': 'Riverside Learning Trust',
      'system.locale': 'en-GB',
      'form.url': null,
      'form.closesOn': null,
      'scoring.passMark': 65,
      'scoring.maxAttempts': 3,
      'notify.enabled': true,
      'notify.replyTo': null,
      'notify.footer': 'Questions? Reply to this email.',
    },
    version: 1,
    lastSaveId: null,
  };
  var loadFailed = false;
  var conflictServed = false;
  var unanswered = 0;

  /**
   * @param {number} status
   * @param {string} code
   * @param {string} message
   * @returns {Error} An error carrying the server's JSON error envelope.
   */
  function envelopeError(status, code, message) {
    return new Error(
      JSON.stringify({ ok: false, status: status, code: code, error: message }),
    );
  }

  /**
   * @returns {object} A deep copy of the current SettingsState.
   */
  function snapshot() {
    var state = JSON.parse(
      JSON.stringify(
        Object.assign({}, schema, {
          canEdit: scenario !== 'readonly',
          version: String(store.version),
          values: store.values,
        }),
      ),
    );
    if (scenario === 'stored-invalid') {
      state.values['form.url'] = 'http://docs.google.com/forms/d/abc/edit';
      state.invalid = ['form.url'];
    }
    return state;
  }

  var handlers = {
    getSettings: function () {
      if (scenario === 'denied') {
        throw envelopeError(401, 'UNAUTHORIZED', 'Not authorized');
      }
      if (scenario === 'load-error' && !loadFailed) {
        loadFailed = true;
        throw envelopeError(
          500,
          'INTERNAL_ERROR',
          'Settings could not be loaded.',
        );
      }
      return snapshot();
    },

    saveSettings: function (request) {
      if (scenario === 'readonly' || scenario === 'unauthorized') {
        throw envelopeError(401, 'UNAUTHORIZED', 'Not authorized');
      }
      var unansweredSaves = { timeout: 1, 'timeout-twice': 2 }[scenario] || 0;
      if (unanswered < unansweredSaves) {
        unanswered += 1;
        return NEVER;
      }
      if (scenario === 'conflict' && !conflictServed) {
        conflictServed = true;
        store.version += 1;
        return {
          ok: false,
          reason: 'conflict',
          version: String(store.version),
        };
      }
      if (request.saveId && request.saveId === store.lastSaveId) {
        return {
          ok: true,
          values: JSON.parse(JSON.stringify(store.values)),
          version: String(store.version),
        };
      }
      if (request.version !== String(store.version)) {
        return {
          ok: false,
          reason: 'conflict',
          version: String(store.version),
        };
      }

      var merged = Object.assign({}, store.values, request.changes);
      var errors = GasConfigValidation.validateAll(schema.fields, merged);
      if (scenario === 'invalid' && 'form.url' in request.changes) {
        errors['form.url'] =
          'This form could not be opened. Check that you have access to it.';
      }
      if (Object.keys(errors).length > 0) {
        return { ok: false, reason: 'invalid', errors: errors };
      }

      store.values = merged;
      store.version += 1;
      store.lastSaveId = request.saveId;
      return {
        ok: true,
        values: JSON.parse(JSON.stringify(merged)),
        version: String(store.version),
      };
    },
  };

  /**
   * Routes a call like the server's `GasConfigRpc`.
   *
   * @param {string} method
   * @param {*} payload
   * @returns {*} The result; `NEVER` when the call is never answered.
   */
  function GasConfigRpc(method, payload) {
    if (!Object.prototype.hasOwnProperty.call(handlers, method)) {
      throw envelopeError(400, 'VALIDATION_ERROR', 'Unknown method: ' + method);
    }
    return handlers[method](payload);
  }

  /**
   * Creates a runner carrying the given callbacks, like `google.script.run`.
   *
   * @param {?function(*): void} onSuccess
   * @param {?function(Error): void} onFailure
   * @returns {object} A chainable runner exposing the server methods.
   */
  function createRunner(onSuccess, onFailure) {
    var runner = {
      withSuccessHandler: function (fn) {
        return createRunner(fn, onFailure);
      },
      withFailureHandler: function (fn) {
        return createRunner(onSuccess, fn);
      },
    };
    runner.GasConfigRpc = function (method, payload) {
      window.setTimeout(function () {
        var result;
        try {
          result = GasConfigRpc(method, payload);
        } catch (error) {
          if (onFailure) onFailure(error);
          return;
        }
        if (result === NEVER) return;
        if (onSuccess) onSuccess(result);
      }, latency);
    };
    return runner;
  }

  var host = {
    close: function () {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'gas-config:close' }, '*');
      } else {
        console.log('google.script.host.close()');
      }
    },
    setHeight: function () {},
    setWidth: function () {},
  };

  return { script: { run: createRunner(null, null), host: host } };
})();
