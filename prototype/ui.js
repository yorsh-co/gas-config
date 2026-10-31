/**
 * Schema-driven settings UI. Fetches a SettingsState from the server, renders
 * it for the current surface and theme, and saves only the changed values.
 */
(function () {
  'use strict';

  var SNACKBAR_MS = 4000;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var RESTART_ALT_PATH =
    'M480-80q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-440h80q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720h-6l62 62-56 58-160-160 160-160 56 58-62 62h6q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-440q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80Z';
  var SKELETON_SHAPE = [2, 3];

  var params = new URLSearchParams(window.location.search);
  var surface = pick(params.get('surface'), ['dialog', 'sidebar', 'page']);
  var theme = pick(params.get('theme'), ['workspace', 'yorsh']);
  document.documentElement.dataset.surface = surface;
  document.documentElement.dataset.theme = theme;

  var run = google.script.run;
  var validation = GasConfigValidation;

  var state;
  var views;
  var dom = {};
  var snackbarTimer;

  /**
   * @param {?string} value A query parameter value.
   * @param {string[]} allowed Accepted values; the first is the default.
   * @returns {string} The value when allowed, otherwise the default.
   */
  function pick(value, allowed) {
    return allowed.indexOf(value) === -1 ? allowed[0] : value;
  }

  /**
   * Creates an element. Text is always assigned as textContent, never markup.
   *
   * @param {string} tag
   * @param {Object<string, string|boolean|null>} [props] Attributes; `class`
   *   and `text` are special-cased and `true` renders a boolean attribute.
   * @param {...(Node|null)} children
   * @returns {HTMLElement}
   */
  function el(tag, props) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (name) {
      var value = props[name];
      if (value === false || value === null || value === undefined) return;
      if (name === 'class') node.className = value;
      else if (name === 'text') node.textContent = value;
      else node.setAttribute(name, value === true ? '' : value);
    });
    for (var i = 2; i < arguments.length; i++) {
      if (arguments[i]) node.appendChild(arguments[i]);
    }
    return node;
  }

  /**
   * @param {string} className
   * @returns {SVGSVGElement} The "restart_alt" icon.
   */
  function restoreIcon(className) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 -960 960 960');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', className);
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', RESTART_ALT_PATH);
    svg.appendChild(path);
    return svg;
  }

  /**
   * @param {string} text
   * @param {string} variant `filled`, `outlined` or `text`.
   * @param {function(): void} onClick
   * @param {boolean} [disabled]
   * @returns {HTMLButtonElement}
   */
  function button(text, variant, onClick, disabled) {
    var node = el('button', {
      type: 'button',
      class: 'btn btn--' + variant,
      text: text,
      disabled: disabled,
    });
    node.addEventListener('click', onClick);
    return node;
  }

  /**
   * @param {*} value
   * @returns {*} The value, with empty strings treated as null.
   */
  function canonical(value) {
    return value === '' || value === undefined ? null : value;
  }

  /**
   * @param {*} a
   * @param {*} b
   * @returns {boolean} True when both values are equivalent.
   */
  function sameValue(a, b) {
    return canonical(a) === canonical(b);
  }

  /** @returns {boolean} True when any value differs from the baseline. */
  function isDirty() {
    return state.settings.fields.some(function (field) {
      return !sameValue(state.values[field.key], state.baseline[field.key]);
    });
  }

  /** @returns {boolean} True when the current user may edit the values. */
  function canEdit() {
    return state.settings.canEdit;
  }

  /** Builds the static page skeleton and starts the first load. */
  function init() {
    dom.app = document.getElementById('app');
    dom.content = el('div', { class: 'content' });
    dom.sentinel = el('div', { class: 'sentinel', 'aria-hidden': 'true' });
    dom.main = el('main', { class: 'main' }, dom.content, dom.sentinel);
    dom.status = el('p', { class: 'status', 'aria-live': 'polite' });
    dom.actions = el('div', { class: 'actions' });
    dom.footer = el(
      'footer',
      { class: 'footer', hidden: true },
      el('div', { class: 'footer-inner' }, dom.status, dom.actions),
    );
    dom.snackbar = el('div', { class: 'snackbar', role: 'status' });
    dom.app.append(dom.main, dom.footer, dom.snackbar);

    new IntersectionObserver(
      function (entries) {
        dom.footer.classList.toggle('is-raised', !entries[0].isIntersecting);
      },
      { root: dom.main },
    ).observe(dom.sentinel);

    load();
  }

  /** Shows the loading state and fetches the settings. */
  function load() {
    state = { status: 'loading' };
    views = new Map();
    render();
    run
      .withSuccessHandler(onLoaded)
      .withFailureHandler(onLoadFailed)
      .getSettings();
  }

  /** @param {object} settings The SettingsState from the server. */
  function onLoaded(settings) {
    state = {
      status: 'ready',
      settings: settings,
      values: Object.assign({}, settings.values),
      baseline: Object.assign({}, settings.values),
      version: settings.version,
      shown: new Set(),
      serverErrors: {},
      banner: settings.canEdit
        ? null
        : {
            kind: 'info',
            text: 'Only the script owner can change these settings.',
          },
      saving: false,
      conflict: false,
      saved: false,
      confirming: false,
    };
    render();
  }

  /** @param {Error} error */
  function onLoadFailed(error) {
    state = { status: 'error', message: error.message };
    render();
  }

  /** Renders the current top-level state. */
  function render() {
    dom.app.setAttribute('aria-busy', String(state.status === 'loading'));
    dom.content.replaceChildren();
    if (state.status === 'loading') renderSkeleton();
    else if (state.status === 'error') renderError();
    else renderReady();
    dom.footer.hidden = state.status !== 'ready' || !hasFooter();
    dom.main.scrollTop = 0;
    if (state.status === 'ready') {
      refreshAll();
      views.forEach(autoGrow);
    }
  }

  /** @returns {boolean} True when the footer applies to this state. */
  function hasFooter() {
    return !(surface === 'page' && !canEdit());
  }

  /** Renders placeholder blocks that match the field layout. */
  function renderSkeleton() {
    var bar = function (className) {
      return el('div', { class: 'skeleton ' + className });
    };
    var fields = function (count) {
      var nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push(
          el(
            'div',
            { class: 'field' },
            bar('skeleton-label'),
            bar('skeleton-control'),
            bar('skeleton-help'),
          ),
        );
      }
      return nodes;
    };
    dom.content.append(
      el('span', { class: 'sr-only', text: 'Loading settings' }),
      el(
        'div',
        { class: 'intro-skeleton' },
        bar('skeleton-help'),
        bar('skeleton-help skeleton-short'),
      ),
    );
    SKELETON_SHAPE.forEach(function (count) {
      var section = el(
        'section',
        { class: 'section' },
        bar('skeleton-heading'),
      );
      section.append.apply(section, fields(count));
      dom.content.appendChild(section);
    });
  }

  /** Renders the load failure message with a retry action. */
  function renderError() {
    dom.content.appendChild(
      el(
        'div',
        { class: 'state-message', role: 'alert' },
        el('p', { text: state.message }),
        button('Try again', 'outlined', load),
      ),
    );
  }

  /** Renders the settings form for the ready state. */
  function renderReady() {
    var settings = state.settings;
    dom.banner = el('div', { class: 'banner-slot' });
    dom.content.appendChild(dom.banner);

    if (surface === 'page') {
      var showLogo =
        theme === 'yorsh' && settings.brand && settings.brand.logoUrl;
      dom.content.appendChild(
        el(
          'header',
          { class: 'page-header' },
          showLogo
            ? el('img', {
                class: 'logo',
                src: settings.brand.logoUrl,
                alt: '',
                width: '40',
                height: '40',
              })
            : null,
          el(
            'div',
            { class: 'page-heading' },
            el('h1', { class: 'page-title', text: settings.title }),
            settings.description
              ? el('p', { class: 'intro', text: settings.description })
              : null,
          ),
        ),
      );
    } else if (settings.description) {
      dom.content.appendChild(
        el('p', { class: 'intro', text: settings.description }),
      );
    }

    var form = el('form', { class: 'form', novalidate: true });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      save();
    });
    sectionsFor(settings).forEach(function (section) {
      form.appendChild(section);
    });
    dom.content.appendChild(form);
    renderBanner();
  }

  /**
   * Groups fields into sections: ungrouped fields first, then each group in
   * schema order. Groups without fields are skipped.
   *
   * @param {object} settings
   * @returns {HTMLElement[]}
   */
  function sectionsFor(settings) {
    var known = {};
    settings.groups.forEach(function (group) {
      known[group.id] = true;
    });
    var buckets = [{ group: null, fields: [] }];
    settings.groups.forEach(function (group) {
      buckets.push({ group: group, fields: [] });
    });
    settings.fields.forEach(function (field) {
      var index = known[field.group]
        ? 1 +
          settings.groups.findIndex(function (g) {
            return g.id === field.group;
          })
        : 0;
      buckets[index].fields.push(field);
    });

    return buckets
      .filter(function (bucket) {
        return bucket.fields.length > 0;
      })
      .map(function (bucket, index) {
        var group = bucket.group;
        var headingId = 'group-' + (group ? group.id : 'general-' + index);
        var section = el('section', {
          class: 'section',
          'aria-labelledby': group ? headingId : null,
        });
        if (group) {
          section.appendChild(
            el('h2', {
              class: 'section-title',
              id: headingId,
              text: group.label,
            }),
          );
          if (group.description) {
            section.appendChild(
              el('p', {
                class: 'section-description',
                text: group.description,
              }),
            );
          }
        }
        bucket.fields.forEach(function (field) {
          var view = buildField(field);
          views.set(field.key, view);
          section.appendChild(view.root);
        });
        return section;
      });
  }

  /**
   * Builds the control for a field.
   *
   * @param {object} field
   * @param {string} id
   * @param {string} describedBy
   * @returns {HTMLElement}
   */
  function buildControl(field, id, describedBy) {
    var common = {
      id: id,
      name: field.key,
      'aria-describedby': describedBy,
      'aria-required': field.required ? 'true' : null,
    };
    var control;
    switch (field.type) {
      case 'text':
        control = el(
          'textarea',
          Object.assign({ class: 'control control--text', rows: '3' }, common),
        );
        break;
      case 'select':
        control = el(
          'select',
          Object.assign({ class: 'control control--select' }, common),
        );
        field.options.forEach(function (option) {
          control.appendChild(
            el('option', { value: option.value, text: option.label }),
          );
        });
        break;
      case 'boolean':
        control = el(
          'input',
          Object.assign(
            { class: 'switch', type: 'checkbox', role: 'switch' },
            common,
          ),
        );
        break;
      case 'date':
        control = el(
          'input',
          Object.assign({ class: 'control', type: 'date' }, common),
        );
        break;
      case 'number':
        control = el(
          'input',
          Object.assign(
            {
              class: 'control',
              type: 'text',
              inputmode:
                field.rules && field.rules.integer ? 'numeric' : 'decimal',
              autocomplete: 'off',
            },
            common,
          ),
        );
        break;
      default:
        control = el(
          'input',
          Object.assign(
            {
              class: 'control',
              type: field.type === 'url' ? 'url' : 'text',
              placeholder: field.placeholder,
              autocomplete: 'off',
              spellcheck: 'false',
            },
            common,
          ),
        );
    }
    if (field.type === 'text' && field.placeholder) {
      control.setAttribute('placeholder', field.placeholder);
    }
    return control;
  }

  /**
   * Builds the DOM and event wiring for one field.
   *
   * @param {object} field
   * @returns {{field: object, root: HTMLElement, control: HTMLElement,
   *   help: HTMLElement, counter: ?HTMLElement, restore: HTMLButtonElement}}
   */
  function buildField(field) {
    var id = 'field-' + field.key.replace(/[^\w-]/g, '-');
    var isBoolean = field.type === 'boolean';
    var control = buildControl(field, id, id + '-help');
    var label = el('label', { class: 'label', for: id, text: field.label });
    if (!field.required && !isBoolean) {
      label.appendChild(el('span', { class: 'optional', text: ' (optional)' }));
    }
    var restore = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Restore default',
        hidden: true,
      },
      restoreIcon('icon'),
    );
    var help = el('p', { class: 'help', id: id + '-help' });
    var counter =
      field.type === 'text' && field.rules && field.rules.maxLength
        ? el('span', { class: 'counter' })
        : null;

    var root = el('div', { class: 'field field--' + field.type });
    if (isBoolean) {
      root.append(
        el('div', { class: 'switch-row' }, control, label, restore),
        el('div', { class: 'meta' }, help),
      );
    } else {
      root.append(
        el('div', { class: 'label-row' }, label, restore),
        control,
        el('div', { class: 'meta' }, help, counter),
      );
    }

    var view = {
      field: field,
      root: root,
      control: control,
      help: help,
      counter: counter,
      restore: restore,
    };
    control.addEventListener('input', function () {
      onInput(view);
    });
    control.addEventListener('blur', function () {
      state.shown.add(field.key);
      refreshField(view);
      refreshChrome();
    });
    restore.addEventListener('click', function () {
      setValue(view, field.default);
      state.shown.add(field.key);
      onChange(view);
      control.focus();
    });
    return view;
  }

  /** @param {object} view */
  function onInput(view) {
    var control = view.control;
    var raw = view.field.type === 'boolean' ? control.checked : control.value;
    state.values[view.field.key] = validation.normalize(view.field, raw);
    onChange(view);
  }

  /**
   * Reacts to an edit of one field.
   *
   * @param {object} view
   */
  function onChange(view) {
    delete state.serverErrors[view.field.key];
    state.saved = false;
    state.confirming = false;
    autoGrow(view);
    refreshField(view);
    refreshChrome();
  }

  /**
   * Sets a value on both the state and the control.
   *
   * @param {object} view
   * @param {*} value
   */
  function setValue(view, value) {
    state.values[view.field.key] = value;
    writeControl(view, value);
  }

  /**
   * @param {object} view
   * @param {*} value
   */
  function writeControl(view, value) {
    if (view.field.type === 'boolean') view.control.checked = Boolean(value);
    else
      view.control.value =
        value === null || value === undefined ? '' : String(value);
  }

  /** @param {object} view Grows a textarea to fit its content. */
  function autoGrow(view) {
    if (view.field.type !== 'text') return;
    var control = view.control;
    control.style.height = 'auto';
    var borders = control.offsetHeight - control.clientHeight;
    control.style.height = control.scrollHeight + borders + 'px';
  }

  /**
   * @param {object} view
   * @returns {?string} The error currently visible for the field.
   */
  function visibleError(view) {
    var key = view.field.key;
    if (state.serverErrors[key]) return state.serverErrors[key];
    return state.shown.has(key)
      ? validation.validateField(view.field, state.values[key])
      : null;
  }

  /**
   * @param {object} field
   * @param {*} value
   * @returns {string} A short human description of the value.
   */
  function describeValue(field, value) {
    if (canonical(value) === null) return 'blank';
    if (field.type === 'boolean') return value ? 'on' : 'off';
    if (field.type === 'select') {
      var option = field.options.find(function (o) {
        return o.value === value;
      });
      if (option) return option.label;
    }
    return String(value);
  }

  /** @param {object} view Syncs one field's error, helper and restore state. */
  function refreshField(view) {
    var field = view.field;
    var value = state.values[field.key];
    var error = visibleError(view);
    var control = view.control;

    view.root.classList.toggle('is-invalid', Boolean(error));
    control.setAttribute('aria-invalid', String(Boolean(error)));
    var message = error || field.description || '';
    view.help.textContent = message;
    view.help.hidden = message === '';
    if (message) control.setAttribute('aria-describedby', view.help.id);
    else control.removeAttribute('aria-describedby');

    if (view.counter) {
      var length = typeof value === 'string' ? value.length : 0;
      view.counter.textContent = length + '/' + field.rules.maxLength;
      view.counter.classList.toggle('is-over', length > field.rules.maxLength);
    }

    var emptyDefault = canonical(field.default) === null;
    var showRestore =
      canEdit() &&
      !state.saving &&
      !state.conflict &&
      !(field.required && emptyDefault) &&
      !sameValue(value, field.default);
    view.restore.hidden = !showRestore;
    view.restore.title =
      'Restore default (' + describeValue(field, field.default) + ')';
  }

  /** Applies enabled/read-only state to every control. */
  function refreshEnabled() {
    views.forEach(function (view) {
      var type = view.field.type;
      var locked = !canEdit() || state.saving;
      var textual =
        type === 'string' ||
        type === 'url' ||
        type === 'text' ||
        type === 'number';
      if (textual) {
        view.control.readOnly = !canEdit();
        view.control.disabled = state.saving;
      } else {
        view.control.disabled = locked;
      }
    });
  }

  /** Syncs every field and the chrome with the state. */
  function refreshAll() {
    views.forEach(function (view) {
      writeControl(view, state.values[view.field.key]);
      refreshField(view);
    });
    refreshEnabled();
    refreshChrome();
  }

  /** Syncs the footer status and buttons. */
  function refreshChrome() {
    if (state.status !== 'ready') return;
    var errors = 0;
    views.forEach(function (view) {
      if (visibleError(view)) errors++;
    });
    var dirty = isDirty();

    if (state.confirming) dom.status.textContent = 'Discard unsaved changes?';
    else if (state.conflict) dom.status.textContent = 'Reload to continue';
    else if (state.saving) dom.status.textContent = 'Saving…';
    else if (errors > 0)
      dom.status.textContent =
        'Fix ' + errors + (errors === 1 ? ' error' : ' errors') + ' to save';
    else if (dirty) dom.status.textContent = 'Unsaved changes';
    else if (state.saved) dom.status.textContent = 'All changes saved';
    else dom.status.textContent = '';

    var mode = !canEdit() ? 'close' : state.confirming ? 'confirm' : 'edit';
    if (mode !== dom.mode) buildActions(mode);
    if (mode === 'edit') {
      dom.cancel.disabled =
        surface === 'page' ? !dirty || state.saving : state.saving;
      dom.save.disabled = !dirty || state.saving || state.conflict;
      dom.save.classList.toggle('is-busy', state.saving);
      dom.spinner.hidden = !state.saving;
    }
  }

  /**
   * Replaces the footer buttons for a mode. Buttons are otherwise updated in
   * place so that a click is never lost to a re-render triggered by blur.
   *
   * @param {string} mode `close`, `confirm` or `edit`.
   */
  function buildActions(mode) {
    var hadFocus = dom.actions.contains(document.activeElement);
    var actions;
    if (mode === 'close') {
      actions = [button('Close', 'text', closeHost)];
    } else if (mode === 'confirm') {
      actions = [
        button('Keep editing', 'text', function () {
          state.confirming = false;
          refreshChrome();
          dom.cancel.focus();
        }),
        button('Discard', 'filled', closeHost),
      ];
    } else {
      dom.cancel =
        surface === 'page'
          ? button('Discard changes', 'text', discard)
          : button('Cancel', 'text', cancel);
      dom.save = button('Save', 'filled', save);
      dom.spinner = el('span', {
        class: 'spinner',
        'aria-hidden': 'true',
        hidden: true,
      });
      dom.save.prepend(dom.spinner);
      actions = [dom.cancel, dom.save];
    }
    dom.mode = mode;
    dom.actions.replaceChildren.apply(dom.actions, actions);
    if (hadFocus && mode === 'confirm') actions[0].focus();
  }

  /** Renders the current banner, if any. */
  function renderBanner() {
    dom.banner.replaceChildren();
    var banner = state.banner;
    if (!banner) return;
    dom.banner.appendChild(
      el(
        'div',
        {
          class: 'banner banner--' + banner.kind,
          role: banner.kind === 'info' ? 'status' : 'alert',
        },
        el('p', { class: 'banner-text', text: banner.text }),
        banner.action ? button(banner.action, 'text', load) : null,
      ),
    );
  }

  /**
   * @param {?{kind: string, text: string, action?: string}} banner
   */
  function setBanner(banner) {
    state.banner = banner;
    renderBanner();
  }

  /** Closes the host dialog or sidebar. */
  function closeHost() {
    google.script.host.close();
  }

  /** Cancels editing, asking for confirmation when there are edits. */
  function cancel() {
    if (!isDirty()) {
      closeHost();
      return;
    }
    state.confirming = true;
    refreshChrome();
  }

  /** Resets the form to the last loaded or saved values. */
  function discard() {
    state.values = Object.assign({}, state.baseline);
    state.shown.clear();
    state.serverErrors = {};
    state.confirming = false;
    refreshAll();
    views.forEach(autoGrow);
  }

  /** Focuses the first field, in schema order, that shows an error. */
  function focusFirstInvalid() {
    var first = state.settings.fields.find(function (field) {
      return visibleError(views.get(field.key));
    });
    if (!first) return;
    var view = views.get(first.key);
    view.control.focus({ preventScroll: true });
    view.root.scrollIntoView({ block: 'center' });
  }

  /** Validates and submits the changed values. */
  function save() {
    if (state.saving || !isDirty()) return;
    var fields = state.settings.fields;
    fields.forEach(function (field) {
      state.shown.add(field.key);
    });
    refreshAll();
    if (Object.keys(validation.validateAll(fields, state.values)).length > 0) {
      focusFirstInvalid();
      return;
    }

    var changes = {};
    fields.forEach(function (field) {
      if (!sameValue(state.values[field.key], state.baseline[field.key])) {
        changes[field.key] = canonical(state.values[field.key]);
      }
    });
    state.saving = true;
    setBanner(null);
    refreshAll();
    run
      .withSuccessHandler(onSaved)
      .withFailureHandler(onSaveFailed)
      .saveSettings({ changes: changes, version: state.version });
  }

  /** @param {object} result The saveSettings response. */
  function onSaved(result) {
    state.saving = false;
    if (result.ok) {
      state.values = Object.assign({}, result.values);
      state.baseline = Object.assign({}, result.values);
      state.version = result.version;
      state.shown.clear();
      state.serverErrors = {};
      state.saved = true;
      refreshAll();
      showSnackbar('Settings saved');
      return;
    }
    if (result.reason === 'invalid') {
      state.serverErrors = result.errors;
      refreshAll();
      focusFirstInvalid();
      return;
    }
    state.conflict = true;
    refreshAll();
    setBanner({
      kind: 'error',
      text: 'Someone else changed these settings after you opened them. Reload to see the latest values.',
      action: 'Reload',
    });
    dom.main.scrollTop = 0;
  }

  /** @param {Error} error */
  function onSaveFailed(error) {
    state.saving = false;
    refreshAll();
    setBanner({ kind: 'error', text: error.message });
    dom.main.scrollTop = 0;
  }

  /** @param {string} message Shows a transient snackbar message. */
  function showSnackbar(message) {
    window.clearTimeout(snackbarTimer);
    dom.snackbar.textContent = message;
    dom.snackbar.classList.add('is-visible');
    snackbarTimer = window.setTimeout(function () {
      dom.snackbar.classList.remove('is-visible');
    }, SNACKBAR_MS);
  }

  init();
})();
