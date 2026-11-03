/**
 * Schema-driven settings UI. Renders a `GasConfigSettingsState` for the
 * current surface and theme, and saves only the changed values.
 *
 * The state comes from the page's bootstrap when the server embedded it,
 * otherwise from `getSettings`. All text reaches the DOM through
 * `textContent` and attributes, never as markup.
 */
(() => {
  const SNACKBAR_MS = 4000;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const RESTART_ALT_PATH =
    'M480-80q-75 0-140.5-28.5t-114-77q-48.5-48.5-77-114T120-440h80q0 117 81.5 198.5T480-160q117 0 198.5-81.5T760-440q0-117-81.5-198.5T480-720h-6l62 62-56 58-160-160 160-160 56 58-62 62h6q75 0 140.5 28.5t114 77q48.5 48.5 77 114T840-440q0 75-28.5 140.5t-77 114q-48.5 48.5-114 77T480-80Z';
  const SKELETON_SHAPE = [2, 3];

  const READ_ONLY_TEXT = 'Only listed editors can change these settings.';
  const UNAUTHORIZED_TEXT = "You can't change these settings.";
  const RETRYING_TEXT = "Couldn't confirm the save. Retrying…";
  const UNCERTAIN_TEXT =
    'Your changes may not have been saved. Try again to check.';
  const STORED_INVALID_TEXT = 'The saved value is not valid. Enter a new one.';
  const CONFLICT_TEXT =
    'Someone else changed these settings after you opened them. Reload to see the latest values.';

  type Props = Record<string, string | boolean | null | undefined>;
  type Values = Record<string, GasConfigValue>;
  type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

  interface Banner {
    kind: 'info' | 'error';
    text: string;
    action?: { label: string; run: () => void };
  }

  interface LoadingState {
    status: 'loading';
  }

  interface ErrorState {
    status: 'error';
    message: string;
  }

  interface ReadyState {
    status: 'ready';
    settings: GasConfigSettingsState;
    values: Values;
    baseline: Values;
    version: string;
    shown: Set<string>;
    serverErrors: Record<string, string>;
    banner: Banner | null;
    saving: boolean;
    /** A timed-out save is being retried automatically. */
    retrying: boolean;
    /** The last save timed out twice and its outcome is unknown. */
    uncertain: boolean;
    /** The server refused the user: editing is off for this session. */
    locked: boolean;
    conflict: boolean;
    saved: boolean;
    confirming: boolean;
  }

  type State = LoadingState | ErrorState | ReadyState;

  interface FieldView {
    field: GasConfigClientField;
    root: HTMLElement;
    control: Control;
    help: HTMLElement;
    counter: HTMLElement | null;
    restore: HTMLButtonElement;
  }

  type ActionsMode = 'close' | 'confirm' | 'edit';

  interface Dom {
    app: HTMLElement;
    content: HTMLElement;
    sentinel: HTMLElement;
    main: HTMLElement;
    status: HTMLElement;
    actions: HTMLElement;
    footer: HTMLElement;
    snackbar: HTMLElement;
    banner: HTMLElement;
    mode?: ActionsMode;
    cancel: HTMLButtonElement;
    save: HTMLButtonElement;
    spinner: HTMLElement;
  }

  const boot = GasConfigBootstrapReader.read(
    document.getElementById('gas-config-bootstrap')?.textContent,
    window.location.search,
  );
  const surface = boot.surface;
  const theme = boot.theme;
  const root = document.documentElement;
  root.dataset['surface'] = surface;
  root.dataset['theme'] = theme;
  if (boot.brand.primaryColor) {
    root.style.setProperty('--color-primary', boot.brand.primaryColor);
  }

  const rpc = GasConfigRpcClient;
  const validation = GasConfigValidation;

  let state: State = { status: 'loading' };
  let views = new Map<string, FieldView>();
  const dom = {} as Dom;
  let snackbarTimer: number | undefined;

  /**
   * Creates an element. Text is always assigned as textContent, never markup.
   * `class` and `text` are special-cased and `true` renders a boolean
   * attribute; `false`, `null` and `undefined` omit it.
   */
  function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props: Props = {},
    ...children: (Node | null)[]
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    Object.keys(props).forEach((name) => {
      const value = props[name];
      if (value === false || value === null || value === undefined) return;
      if (name === 'class') node.className = String(value);
      else if (name === 'text') node.textContent = String(value);
      else node.setAttribute(name, value === true ? '' : value);
    });
    children.forEach((child) => {
      if (child) node.appendChild(child);
    });
    return node;
  }

  /** The "restart_alt" icon. */
  function restoreIcon(className: string): SVGSVGElement {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 -960 960 960');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', className);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', RESTART_ALT_PATH);
    svg.appendChild(path);
    return svg;
  }

  function button(
    text: string,
    variant: 'filled' | 'outlined' | 'text',
    onClick: () => void,
    disabled?: boolean,
  ): HTMLButtonElement {
    const node = el('button', {
      type: 'button',
      class: 'btn btn--' + variant,
      text,
      disabled,
    });
    node.addEventListener('click', onClick);
    return node;
  }

  /** Treats empty strings like `null`. */
  function canonical(value: GasConfigValue | undefined): GasConfigValue {
    return value === '' || value === undefined ? null : value;
  }

  function sameValue(
    a: GasConfigValue | undefined,
    b: GasConfigValue | undefined,
  ): boolean {
    return canonical(a) === canonical(b);
  }

  /** The ready state; only called from code reachable once it is ready. */
  function ready(): ReadyState {
    if (state.status !== 'ready') throw new Error('Settings are not loaded.');
    return state;
  }

  function isDirty(): boolean {
    const s = ready();
    return s.settings.fields.some(
      (field) => !sameValue(s.values[field.key], s.baseline[field.key]),
    );
  }

  /** Whether the current user may edit the values. */
  function canEdit(): boolean {
    const s = ready();
    return s.settings.canEdit && !s.locked;
  }

  function newSaveId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const digit = Math.floor(Math.random() * 16);
      return (char === 'x' ? digit : (digit & 3) | 8).toString(16);
    });
  }

  /** Builds the static page skeleton and starts the first render. */
  function init(): void {
    dom.app = document.getElementById('app') as HTMLElement;
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
      (entries) => {
        dom.footer.classList.toggle('is-raised', !entries[0]?.isIntersecting);
      },
      { root: dom.main },
    ).observe(dom.sentinel);

    if (boot.state) onLoaded(boot.state);
    else void load();
  }

  /** Shows the loading state and fetches the settings. */
  async function load(): Promise<void> {
    state = { status: 'loading' };
    views = new Map();
    render();
    try {
      onLoaded(await rpc.getSettings());
    } catch (error) {
      onLoadFailed(rpc.parseFailure(error));
    }
  }

  function onLoaded(settings: GasConfigSettingsState): void {
    const shown = new Set<string>();
    const serverErrors: Record<string, string> = {};
    (settings.invalid ?? []).forEach((key) => {
      const field = settings.fields.find((candidate) => candidate.key === key);
      if (!field) return;
      shown.add(key);
      // The server may reject a value for a rule the browser cannot check.
      if (!validation.validateField(field, settings.values[key])) {
        serverErrors[key] = STORED_INVALID_TEXT;
      }
    });

    state = {
      status: 'ready',
      settings,
      values: { ...settings.values },
      baseline: { ...settings.values },
      version: settings.version,
      shown,
      serverErrors,
      banner: settings.canEdit ? null : { kind: 'info', text: READ_ONLY_TEXT },
      saving: false,
      retrying: false,
      uncertain: false,
      locked: false,
      conflict: false,
      saved: false,
      confirming: false,
    };
    render();
  }

  function onLoadFailed(failure: GasConfigRpcFailure): void {
    state = { status: 'error', message: failure.message };
    render();
  }

  /** Renders the current top-level state. */
  function render(): void {
    dom.app.setAttribute('aria-busy', String(state.status === 'loading'));
    dom.content.replaceChildren();
    if (state.status === 'loading') renderSkeleton();
    else if (state.status === 'error') renderError(state.message);
    else renderReady(state);
    dom.footer.hidden = state.status !== 'ready' || !hasFooter();
    dom.main.scrollTop = 0;
    if (state.status === 'ready') {
      refreshAll();
      views.forEach(autoGrow);
    }
  }

  /** Whether the footer applies to this state. */
  function hasFooter(): boolean {
    return !(surface === 'page' && !canEdit());
  }

  /** Renders placeholder blocks that match the field layout. */
  function renderSkeleton(): void {
    const bar = (className: string): HTMLElement =>
      el('div', { class: 'skeleton ' + className });
    const fields = (count: number): HTMLElement[] => {
      const nodes: HTMLElement[] = [];
      for (let i = 0; i < count; i++) {
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
    SKELETON_SHAPE.forEach((count) => {
      const section = el(
        'section',
        { class: 'section' },
        bar('skeleton-heading'),
      );
      section.append(...fields(count));
      dom.content.appendChild(section);
    });
  }

  /** Renders the load failure message with a retry action. */
  function renderError(message: string): void {
    dom.content.appendChild(
      el(
        'div',
        { class: 'state-message', role: 'alert' },
        el('p', { text: message }),
        button('Try again', 'outlined', () => void load()),
      ),
    );
  }

  /** Renders the settings form for the ready state. */
  function renderReady(s: ReadyState): void {
    const settings = s.settings;
    dom.banner = el('div', { class: 'banner-slot' });
    dom.content.appendChild(dom.banner);

    const logoUrl = boot.brand.logoUrl ?? settings.brand?.logoUrl;
    const showLogo = theme === 'yorsh' && Boolean(logoUrl);

    if (surface === 'page') {
      dom.content.appendChild(
        el(
          'header',
          { class: 'page-header' },
          showLogo
            ? el('img', {
                class: 'logo',
                src: logoUrl,
                alt: '',
                width: '40',
                height: '40',
              })
            : null,
          el(
            'div',
            { class: 'page-heading' },
            settings.appName
              ? el('p', { class: 'app-name', text: settings.appName })
              : null,
            el('h1', { class: 'page-title', text: settings.title }),
            settings.description
              ? el('p', { class: 'intro', text: settings.description })
              : null,
          ),
        ),
      );
    } else if (showLogo) {
      dom.content.appendChild(
        el(
          'header',
          { class: 'surface-header' },
          el('img', {
            class: 'logo',
            src: logoUrl,
            alt: '',
            width: '32',
            height: '32',
          }),
          settings.description
            ? el('p', { class: 'intro', text: settings.description })
            : null,
        ),
      );
    } else if (settings.description) {
      dom.content.appendChild(
        el('p', { class: 'intro', text: settings.description }),
      );
    }

    const form = el('form', { class: 'form', novalidate: true });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      save();
    });
    sectionsFor(settings).forEach((section) => form.appendChild(section));
    dom.content.appendChild(form);
    renderBanner();
  }

  /**
   * Groups fields into sections: ungrouped fields first, then each group in
   * schema order. Groups without fields are skipped.
   */
  function sectionsFor(settings: GasConfigSettingsState): HTMLElement[] {
    const buckets: {
      group: GasConfigGroup | null;
      fields: GasConfigClientField[];
    }[] = [{ group: null, fields: [] }];
    settings.groups.forEach((group) => buckets.push({ group, fields: [] }));

    settings.fields.forEach((field) => {
      const index = settings.groups.findIndex((g) => g.id === field.group);
      (
        buckets[index === -1 ? 0 : index + 1] as (typeof buckets)[number]
      ).fields.push(field);
    });

    return buckets
      .filter((bucket) => bucket.fields.length > 0)
      .map((bucket, index) => {
        const group = bucket.group;
        const headingId = 'group-' + (group ? group.id : 'general-' + index);
        const section = el('section', {
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
        bucket.fields.forEach((field) => {
          const view = buildField(field);
          views.set(field.key, view);
          section.appendChild(view.root);
        });
        return section;
      });
  }

  /** Builds the control for a field. */
  function buildControl(
    field: GasConfigClientField,
    id: string,
    describedBy: string,
  ): Control {
    const common: Props = {
      id,
      name: field.key,
      'aria-describedby': describedBy,
      'aria-required': field.required ? 'true' : null,
    };
    let control: Control;
    switch (field.type) {
      case 'text':
        control = el('textarea', {
          class: 'control control--text',
          rows: '3',
          ...common,
        });
        break;
      case 'select': {
        const select = el('select', {
          class: 'control control--select',
          ...common,
        });
        (field.options ?? []).forEach((option) => {
          select.appendChild(
            el('option', { value: option.value, text: option.label }),
          );
        });
        control = select;
        break;
      }
      case 'boolean':
        control = el('input', {
          class: 'switch',
          type: 'checkbox',
          role: 'switch',
          ...common,
        });
        break;
      case 'date':
        control = el('input', { class: 'control', type: 'date', ...common });
        break;
      case 'number':
        control = el('input', {
          class: 'control',
          type: 'text',
          inputmode: field.rules?.integer ? 'numeric' : 'decimal',
          autocomplete: 'off',
          ...common,
        });
        break;
      default:
        control = el('input', {
          class: 'control',
          type: field.type === 'url' ? 'url' : 'text',
          placeholder: field.placeholder,
          autocomplete: 'off',
          spellcheck: 'false',
          ...common,
        });
    }
    if (field.type === 'text' && field.placeholder) {
      control.setAttribute('placeholder', field.placeholder);
    }
    return control;
  }

  /** Builds the DOM and event wiring for one field. */
  function buildField(field: GasConfigClientField): FieldView {
    const id = 'field-' + field.key.replace(/[^\w-]/g, '-');
    const isBoolean = field.type === 'boolean';
    const control = buildControl(field, id, id + '-help');
    const label = el('label', { class: 'label', for: id, text: field.label });
    if (!field.required && !isBoolean) {
      label.appendChild(el('span', { class: 'optional', text: ' (optional)' }));
    }
    const restore = el(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Restore default',
        hidden: true,
      },
      restoreIcon('icon'),
    );
    const help = el('p', { class: 'help', id: id + '-help' });
    const counter =
      field.type === 'text' && field.rules?.maxLength
        ? el('span', { class: 'counter' })
        : null;

    const rootNode = el('div', { class: 'field field--' + field.type });
    if (isBoolean) {
      rootNode.append(
        el('div', { class: 'switch-row' }, control, label, restore),
        el('div', { class: 'meta' }, help),
      );
    } else {
      rootNode.append(
        el('div', { class: 'label-row' }, label, restore),
        control,
        el('div', { class: 'meta' }, help, counter),
      );
    }

    const view: FieldView = {
      field,
      root: rootNode,
      control,
      help,
      counter,
      restore,
    };
    control.addEventListener('input', () => onInput(view));
    control.addEventListener('blur', () => {
      ready().shown.add(field.key);
      refreshField(view);
      refreshChrome();
    });
    restore.addEventListener('click', () => {
      setValue(view, field.default);
      ready().shown.add(field.key);
      onChange(view);
      control.focus();
    });
    return view;
  }

  function onInput(view: FieldView): void {
    const control = view.control;
    const raw =
      view.field.type === 'boolean'
        ? (control as HTMLInputElement).checked
        : control.value;
    ready().values[view.field.key] = validation.normalize(view.field, raw);
    onChange(view);
  }

  /** Reacts to an edit of one field. */
  function onChange(view: FieldView): void {
    const s = ready();
    delete s.serverErrors[view.field.key];
    s.saved = false;
    s.confirming = false;
    // An edit makes the unconfirmed save obsolete: the next save is a new one.
    if (s.uncertain) {
      s.uncertain = false;
      setBanner(null);
    }
    autoGrow(view);
    refreshField(view);
    refreshChrome();
  }

  /** Sets a value on both the state and the control. */
  function setValue(view: FieldView, value: GasConfigValue): void {
    ready().values[view.field.key] = value;
    writeControl(view, value);
  }

  function writeControl(
    view: FieldView,
    value: GasConfigValue | undefined,
  ): void {
    if (view.field.type === 'boolean') {
      (view.control as HTMLInputElement).checked = Boolean(value);
    } else {
      view.control.value =
        value === null || value === undefined ? '' : String(value);
    }
  }

  /** Grows a textarea to fit its content. */
  function autoGrow(view: FieldView): void {
    if (view.field.type !== 'text') return;
    const control = view.control;
    control.style.height = 'auto';
    const borders = control.offsetHeight - control.clientHeight;
    control.style.height = control.scrollHeight + borders + 'px';
  }

  /** The error currently visible for the field, if any. */
  function visibleError(view: FieldView): string | null {
    const s = ready();
    const key = view.field.key;
    const serverError = s.serverErrors[key];
    if (serverError) return serverError;
    return s.shown.has(key)
      ? validation.validateField(view.field, s.values[key])
      : null;
  }

  /** A short human description of the value. */
  function describeValue(
    field: GasConfigClientField,
    value: GasConfigValue | undefined,
  ): string {
    if (canonical(value) === null) return 'blank';
    if (field.type === 'boolean') return value ? 'on' : 'off';
    if (field.type === 'select') {
      const option = (field.options ?? []).find((o) => o.value === value);
      if (option) return option.label;
    }
    return String(value);
  }

  /** Syncs one field's error, helper and restore state. */
  function refreshField(view: FieldView): void {
    const s = ready();
    const field = view.field;
    const value = s.values[field.key];
    const error = visibleError(view);
    const control = view.control;

    view.root.classList.toggle('is-invalid', Boolean(error));
    control.setAttribute('aria-invalid', String(Boolean(error)));
    const message = error || field.description || '';
    view.help.textContent = message;
    view.help.hidden = message === '';
    if (message) control.setAttribute('aria-describedby', view.help.id);
    else control.removeAttribute('aria-describedby');

    if (view.counter && field.rules?.maxLength !== undefined) {
      const length = typeof value === 'string' ? value.length : 0;
      view.counter.textContent = length + '/' + field.rules.maxLength;
      view.counter.classList.toggle('is-over', length > field.rules.maxLength);
    }

    const emptyDefault = canonical(field.default) === null;
    const showRestore =
      canEdit() &&
      !s.saving &&
      !s.conflict &&
      !(field.required && emptyDefault) &&
      !sameValue(value, field.default);
    view.restore.hidden = !showRestore;
    view.restore.title =
      'Restore default (' + describeValue(field, field.default) + ')';
  }

  /** Applies enabled/read-only state to every control. */
  function refreshEnabled(): void {
    const s = ready();
    views.forEach((view) => {
      const type = view.field.type;
      const locked = !canEdit() || s.saving;
      const textual =
        type === 'string' ||
        type === 'url' ||
        type === 'text' ||
        type === 'number';
      if (textual) {
        (view.control as HTMLInputElement).readOnly = !canEdit();
        view.control.disabled = s.saving;
      } else {
        view.control.disabled = locked;
      }
    });
  }

  /** Syncs every field and the chrome with the state. */
  function refreshAll(): void {
    const s = ready();
    views.forEach((view) => {
      writeControl(view, s.values[view.field.key]);
      refreshField(view);
    });
    refreshEnabled();
    refreshChrome();
  }

  /** Syncs the footer status and buttons. */
  function refreshChrome(): void {
    if (state.status !== 'ready') return;
    const s = state;
    let errors = 0;
    views.forEach((view) => {
      if (visibleError(view)) errors++;
    });
    const dirty = isDirty();

    if (s.confirming) dom.status.textContent = 'Discard unsaved changes?';
    else if (s.conflict) dom.status.textContent = 'Reload to continue';
    else if (s.retrying) dom.status.textContent = RETRYING_TEXT;
    else if (s.saving) dom.status.textContent = 'Saving…';
    else if (errors > 0)
      dom.status.textContent =
        'Fix ' + errors + (errors === 1 ? ' error' : ' errors') + ' to save';
    else if (dirty) dom.status.textContent = 'Unsaved changes';
    else if (s.saved) dom.status.textContent = 'All changes saved';
    else dom.status.textContent = '';

    dom.footer.hidden = !hasFooter();
    const mode: ActionsMode = !canEdit()
      ? 'close'
      : s.confirming
        ? 'confirm'
        : 'edit';
    if (mode !== dom.mode) buildActions(mode);
    if (mode === 'edit') {
      dom.cancel.disabled = surface === 'page' ? !dirty || s.saving : s.saving;
      dom.save.disabled = !dirty || s.saving || s.conflict;
      dom.save.classList.toggle('is-busy', s.saving);
      dom.spinner.hidden = !s.saving;
    }
  }

  /**
   * Replaces the footer buttons for a mode. Buttons are otherwise updated in
   * place so that a click is never lost to a re-render triggered by blur.
   */
  function buildActions(mode: ActionsMode): void {
    const hadFocus = dom.actions.contains(document.activeElement);
    let actions: HTMLButtonElement[];
    if (mode === 'close') {
      actions = [button('Close', 'text', closeHost)];
    } else if (mode === 'confirm') {
      actions = [
        button('Keep editing', 'text', () => {
          ready().confirming = false;
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
    dom.actions.replaceChildren(...actions);
    if (hadFocus && mode === 'confirm') actions[0]?.focus();
  }

  /** Renders the current banner, if any. */
  function renderBanner(): void {
    dom.banner.replaceChildren();
    const banner = ready().banner;
    if (!banner) return;
    dom.banner.appendChild(
      el(
        'div',
        {
          class: 'banner banner--' + banner.kind,
          role: banner.kind === 'info' ? 'status' : 'alert',
        },
        el('p', { class: 'banner-text', text: banner.text }),
        banner.action
          ? button(banner.action.label, 'text', banner.action.run)
          : null,
      ),
    );
  }

  function setBanner(banner: Banner | null): void {
    ready().banner = banner;
    renderBanner();
  }

  /** Closes the host dialog or sidebar. */
  function closeHost(): void {
    google.script.host.close();
  }

  /** Cancels editing, asking for confirmation when there are edits. */
  function cancel(): void {
    if (!isDirty()) {
      closeHost();
      return;
    }
    ready().confirming = true;
    refreshChrome();
  }

  /** Resets the form to the last loaded or saved values. */
  function discard(): void {
    const s = ready();
    s.values = { ...s.baseline };
    s.shown.clear();
    s.serverErrors = {};
    s.confirming = false;
    refreshAll();
    views.forEach(autoGrow);
  }

  /** Focuses the first field, in schema order, that shows an error. */
  function focusFirstInvalid(): void {
    for (const field of ready().settings.fields) {
      const view = views.get(field.key);
      if (view && visibleError(view)) {
        view.control.focus({ preventScroll: true });
        view.root.scrollIntoView({ block: 'center' });
        return;
      }
    }
  }

  /** Validates and submits the changed values as a new save. */
  function save(): void {
    const s = ready();
    if (s.saving || !isDirty()) return;
    const fields = s.settings.fields;
    fields.forEach((field) => s.shown.add(field.key));
    refreshAll();
    if (Object.keys(validation.validateAll(fields, s.values)).length > 0) {
      focusFirstInvalid();
      return;
    }

    const changes: Values = {};
    fields.forEach((field) => {
      if (!sameValue(s.values[field.key], s.baseline[field.key])) {
        changes[field.key] = canonical(s.values[field.key]);
      }
    });
    void submit({ changes, version: s.version, saveId: newSaveId() }, true);
  }

  /**
   * Sends a save. A timeout is retried once with the same `saveId` when
   * `retryOnTimeout` is set, so a save the server did apply is replayed
   * instead of reported as a conflict.
   */
  async function submit(
    request: GasConfigSaveRequest,
    retryOnTimeout: boolean,
  ): Promise<void> {
    const s = ready();
    s.saving = true;
    s.retrying = false;
    s.uncertain = false;
    setBanner(null);
    refreshAll();

    for (let attempt = 0; ; attempt++) {
      try {
        const result = await rpc.saveSettings(request);
        if (state !== s) return;
        onSaved(result);
        return;
      } catch (error) {
        if (state !== s) return;
        const failure = rpc.parseFailure(error);
        if (
          failure.code === rpc.TIMEOUT_CODE &&
          retryOnTimeout &&
          attempt === 0
        ) {
          s.retrying = true;
          refreshChrome();
          continue;
        }
        onSaveFailed(failure, request);
        return;
      }
    }
  }

  function onSaved(result: GasConfigSaveResponse): void {
    const s = ready();
    s.saving = false;
    s.retrying = false;
    if (result.ok) {
      s.values = { ...result.values };
      s.baseline = { ...result.values };
      s.version = result.version;
      s.shown.clear();
      s.serverErrors = {};
      s.saved = true;
      refreshAll();
      showSnackbar('Settings saved');
      return;
    }
    if (result.reason === 'invalid') {
      s.serverErrors = result.errors;
      refreshAll();
      focusFirstInvalid();
      return;
    }
    s.conflict = true;
    refreshAll();
    setBanner({
      kind: 'error',
      text: CONFLICT_TEXT,
      action: { label: 'Reload', run: () => void load() },
    });
    dom.main.scrollTop = 0;
  }

  function onSaveFailed(
    failure: GasConfigRpcFailure,
    request: GasConfigSaveRequest,
  ): void {
    const s = ready();
    s.saving = false;
    s.retrying = false;

    if (failure.code === 'UNAUTHORIZED') {
      s.locked = true;
      refreshAll();
      setBanner({ kind: 'error', text: UNAUTHORIZED_TEXT });
    } else if (failure.code === rpc.TIMEOUT_CODE) {
      s.uncertain = true;
      refreshAll();
      setBanner({
        kind: 'error',
        text: UNCERTAIN_TEXT,
        action: { label: 'Try again', run: () => void submit(request, false) },
      });
    } else {
      refreshAll();
      setBanner({ kind: 'error', text: failure.message });
    }
    dom.main.scrollTop = 0;
  }

  /** Shows a transient snackbar message. */
  function showSnackbar(message: string): void {
    window.clearTimeout(snackbarTimer);
    dom.snackbar.textContent = message;
    dom.snackbar.classList.add('is-visible');
    snackbarTimer = window.setTimeout(() => {
      dom.snackbar.classList.remove('is-visible');
    }, SNACKBAR_MS);
  }

  init();
})();
