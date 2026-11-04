/**
 * Development harness: hosts the UI document in an imitation of each Workspace
 * surface so the UI can be judged in context. Not part of the product.
 */
(function () {
  'use strict';

  var GROUPS = [
    {
      key: 'surface',
      label: 'Surface',
      options: [
        ['sidebar', 'Sidebar'],
        ['dialog', 'Dialog'],
        ['page', 'Web page'],
      ],
    },
    {
      key: 'theme',
      label: 'Theme',
      options: [
        ['workspace', 'Workspace'],
        ['yorsh', 'Yorsh'],
      ],
    },
    {
      key: 'scenario',
      label: 'Scenario',
      options: [
        ['normal', 'Normal'],
        ['slow', 'Slow network'],
        ['invalid', 'Server validation error'],
        ['conflict', 'Edit conflict'],
        ['readonly', 'Not the owner'],
        ['load-error', 'Load failure'],
        ['unauthorized', 'Unauthorized'],
        ['timeout', 'Save timeout'],
        ['timeout-twice', 'Save timeout (twice)'],
        ['stored-invalid', 'Invalid stored value'],
      ],
    },
  ];

  var CLOSE_PATH = 'M6 6l12 12M18 6L6 18';

  var stage = document.getElementById('stage');
  var controls = document.getElementById('controls');
  var selection = readSelection();
  var closed = false;
  var frame = null;
  var buttons = [];

  /**
   * @returns {Object<string, string>} The selection from the query string,
   *   falling back to the first option of each group.
   */
  function readSelection() {
    var params = new URLSearchParams(window.location.search);
    var result = {};
    GROUPS.forEach(function (group) {
      var value = params.get(group.key);
      var valid = group.options.some(function (option) {
        return option[0] === value;
      });
      result[group.key] = valid ? value : group.options[0][0];
    });
    return result;
  }

  /**
   * Creates an element; text is assigned as textContent.
   *
   * @param {string} tag
   * @param {Object<string, string>} [props] Attributes; `text` sets content.
   * @param {...Node} children
   * @returns {HTMLElement}
   */
  function el(tag, props) {
    var node = document.createElement(tag);
    Object.keys(props || {}).forEach(function (name) {
      if (name === 'text') node.textContent = props[name];
      else node.setAttribute(name, props[name]);
    });
    for (var i = 2; i < arguments.length; i++) node.appendChild(arguments[i]);
    return node;
  }

  /** @returns {SVGSVGElement} A close (x) icon. */
  function closeIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', CLOSE_PATH);
    svg.appendChild(path);
    return svg;
  }

  /** Builds the toolbar's segmented controls. */
  function buildControls() {
    GROUPS.forEach(function (group) {
      var segment = el('div', {
        class: 'segment',
        role: 'group',
        'aria-label': group.label,
      });
      group.options.forEach(function (option) {
        var button = el('button', {
          type: 'button',
          class: 'segment-btn',
          text: option[1],
        });
        button.addEventListener('click', function () {
          selection[group.key] = option[0];
          closed = false;
          sync();
        });
        buttons.push({ group: group.key, value: option[0], node: button });
        segment.appendChild(button);
      });
      controls.appendChild(
        el(
          'div',
          { class: 'control' },
          el('span', { class: 'control-label', text: group.label }),
          segment,
        ),
      );
    });
  }

  /** Persists the selection, updates pressed states and redraws the stage. */
  function sync() {
    var query = new URLSearchParams(selection).toString();
    try {
      window.history.replaceState(null, '', '?' + query);
    } catch {
      // Some embedding contexts disallow history changes; the URL is optional.
    }
    buttons.forEach(function (button) {
      button.node.setAttribute(
        'aria-pressed',
        String(selection[button.group] === button.value),
      );
    });
    renderStage();
  }

  /** Closes the simulated host surface. */
  function closeSurface() {
    closed = true;
    renderStage();
  }

  /**
   * @param {string} label Accessible name.
   * @returns {HTMLButtonElement} A close button for imitation host chrome.
   */
  function closeButton(label) {
    var button = el(
      'button',
      { type: 'button', class: 'host-close', 'aria-label': label },
      closeIcon(),
    );
    button.addEventListener('click', closeSurface);
    return button;
  }

  /**
   * @param {number} [width] Fixed width in pixels.
   * @param {number} [height] Fixed height in pixels.
   * @returns {HTMLIFrameElement} The frame hosting the UI for the selection.
   */
  function createFrame(width, height) {
    var query = new URLSearchParams(selection).toString();
    frame = el('iframe', {
      class: 'frame',
      title: 'Settings',
      src: '/src/web/gas-config.ui.html?' + query,
    });
    if (width) frame.style.width = width + 'px';
    if (height) frame.style.height = height + 'px';
    return frame;
  }

  /** @returns {HTMLElement} A faint placeholder document canvas. */
  function canvas() {
    var page = el('div', { class: 'doc', 'aria-hidden': 'true' });
    [70, 92, 85, 60, 90, 78, 40].forEach(function (width) {
      page.appendChild(el('div', { class: 'doc-bar' })).style.width =
        width + '%';
    });
    return el('div', { class: 'canvas', 'aria-hidden': 'true' }, page);
  }

  /** @returns {HTMLElement} The "closed" message with a reopen action. */
  function closedMessage() {
    var reopen = el('button', {
      type: 'button',
      class: 'tool-btn',
      text: 'Reopen',
    });
    reopen.addEventListener('click', function () {
      closed = false;
      renderStage();
    });
    return el(
      'div',
      { class: 'closed', role: 'status' },
      el('p', { text: 'Settings closed' }),
      reopen,
    );
  }

  /** Rebuilds the stage for the current selection. */
  function renderStage() {
    stage.replaceChildren();
    frame = null;
    stage.className = 'stage stage--' + selection.surface;
    if (closed) {
      stage.appendChild(closedMessage());
      return;
    }
    if (selection.surface === 'sidebar') {
      stage.append(
        canvas(),
        el(
          'aside',
          { class: 'side-panel' },
          el(
            'div',
            { class: 'host-header' },
            el('h1', { class: 'host-title', text: 'Settings' }),
            closeButton('Close'),
          ),
          createFrame(300),
        ),
      );
    } else if (selection.surface === 'dialog') {
      stage.append(
        canvas(),
        el(
          'div',
          { class: 'scrim' },
          el(
            'div',
            { class: 'dialog', role: 'dialog', 'aria-label': 'Settings' },
            el(
              'div',
              { class: 'host-header host-header--dialog' },
              el('h1', {
                class: 'host-title host-title--dialog',
                text: 'Settings',
              }),
              closeButton('Close'),
            ),
            createFrame(600, 520),
          ),
        ),
      );
    } else {
      stage.append(
        el(
          'div',
          { class: 'browser-bar', 'aria-hidden': 'true' },
          el('span', {
            class: 'browser-url',
            text: 'script.google.com/macros/s/AKfycb…/exec',
          }),
        ),
        createFrame(),
      );
    }
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (
      frame &&
      event.source === frame.contentWindow &&
      data &&
      data.type === 'gas-config:close'
    ) {
      closeSurface();
    }
  });

  document.getElementById('reload').addEventListener('click', function () {
    closed = false;
    renderStage();
  });

  buildControls();
  sync();
})();
