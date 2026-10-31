/**
 * Browser stand-in for `google.script.run` and `google.script.host`, backed by
 * an in-memory settings store. Scenarios are selected with `?scenario=`.
 */
var google = (function () {
  'use strict';

  var scenario =
    new URLSearchParams(window.location.search).get('scenario') || 'normal';
  var latency = scenario === 'slow' ? 2500 : 600;

  var emailPattern = '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$';
  var schema = {
    title: 'Settings',
    description:
      'These settings control how this project runs. Changes apply the next time it runs.',
    brand: { logoUrl: 'assets/yorsh-mark.svg' },
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
        default: '',
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
        default: '',
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

  var store = {
    values: {
      'org.name': 'Riverside Learning Trust',
      'system.locale': 'en-GB',
      'form.url': '',
      'form.closesOn': null,
      'scoring.passMark': 65,
      'scoring.maxAttempts': 3,
      'notify.enabled': true,
      'notify.replyTo': null,
      'notify.footer': 'Questions? Reply to this email.',
    },
    version: 1,
  };
  var loadFailed = false;
  var conflictServed = false;

  /**
   * @returns {object} A deep copy of the current SettingsState.
   */
  function snapshot() {
    return JSON.parse(
      JSON.stringify(
        Object.assign({}, schema, {
          canEdit: scenario !== 'readonly',
          version: String(store.version),
          values: store.values,
        }),
      ),
    );
  }

  var handlers = {
    getSettings: function () {
      if (scenario === 'load-error' && !loadFailed) {
        loadFailed = true;
        throw new Error('Settings could not be loaded.');
      }
      return snapshot();
    },

    saveSettings: function (request) {
      if (scenario === 'readonly') {
        throw new Error('Only the script owner can change these settings.');
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
      return {
        ok: true,
        values: JSON.parse(JSON.stringify(merged)),
        version: String(store.version),
      };
    },
  };

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
    Object.keys(handlers).forEach(function (name) {
      runner[name] = function (arg) {
        window.setTimeout(function () {
          var result;
          try {
            result = handlers[name](arg);
          } catch (error) {
            if (onFailure) onFailure(error);
            return;
          }
          if (onSuccess) onSuccess(result);
        }, latency);
      };
    });
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
