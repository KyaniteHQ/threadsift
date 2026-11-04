/* Library: the settings table and what is built from it. One global: window.Library.
   The table owns each setting's key, label, attribute, control, group, options and default;
   the key lists, the defaults, Reset look and the app root's attributes are all built from it.
   tokens.css owns what every option looks like; checkDefaults() confirms the two agree. */
window.Library = (function () {
  'use strict';

  /* ---------------------------------------------------------------------------
     1. The settings table, in the settings panel's order.
     key      the setting's name in saved settings
     label    its row label in the settings panel
     attr     the attribute on the app's root that carries the chosen option's id
     kind     the control: seg (buttons in a row), select, swatch (accent colours)
     group    the settings panel group it sits in
     look     true for the seven look settings, the ones Reset look puts back
     default  the option a new app starts with
     plain    the option tokens.css draws with no attribute, where it isn't the default
              (Theme: Match system resolves to Light or Dark; tokens.css draws Light)
     tokens   the tokens its options change (tokens.css); checkDefaults() compares them
     --------------------------------------------------------------------------- */
  var SETTINGS = [
    { key: 'layout', label: 'Layout', attr: 'data-layout', kind: 'seg', group: 'View', look: false, default: 'list',
      options: [{ id: 'list', label: 'List' }, { id: 'grid', label: 'Grid' }],
      tokens: ['--nh', '--nc', '--display-px', '--sum-lines'] },
    { key: 'openAs', label: 'Open items as', attr: 'data-open-as', kind: 'seg', group: 'View', look: false, default: 'page',
      options: [{ id: 'page', label: 'Page' }, { id: 'sheet', label: 'Sheet' }],
      tokens: [], note: 'Grid only; under 760px items always open full screen. The app works out data-reader from it.' },
    { key: 'theme', label: 'Theme', attr: 'data-theme', kind: 'seg', group: 'Reading', look: false, default: 'system', plain: 'light',
      options: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'sepia', label: 'Sepia' }, { id: 'system', label: 'Match system', follows: ['light', 'dark'] }],
      tokens: ['--bg', '--surface', '--surface-2', '--line', '--line-2', '--ctl-line', '--text', '--muted', '--acc-l', '--acc-c', '--acc-ink', '--on-acc', '--acc-soft', '--ok', '--warn', '--shadow', '--shadow-lg', '--scrim', '--tag-l', '--reader-bg'] },
    { key: 'font', label: 'Font', attr: 'data-font', kind: 'select', group: 'Reading', look: true, default: 'plex',
      options: [
        { id: 'plex', label: 'IBM Plex Sans + Plex Mono', short: 'Plex' },
        { id: 'news', label: 'Newsreader + Instrument Sans', short: 'Newsreader' },
        { id: 'brico', label: 'Bricolage Grotesque + Figtree', short: 'Bricolage' },
        { id: 'inst', label: 'Instrument Serif + Geist', short: 'Instrument' },
        { id: 'mono', label: 'JetBrains Mono + Source Serif', short: 'Mono' }
      ],
      tokens: ['--f-display', '--f-ui', '--f-read', '--f-mono', '--dw', '--dw-soft', '--dw-strong', '--dz', '--dls', '--rz', '--cw'] },
    { key: 'width', label: 'Text width', attr: 'data-width', kind: 'seg', group: 'Reading', look: true, default: 'medium',
      options: [{ id: 'narrow', label: 'Narrow' }, { id: 'medium', label: 'Medium' }, { id: 'wide', label: 'Wide' }],
      tokens: ['--chars'] },
    { key: 'density', label: 'Density', attr: 'data-density', kind: 'seg', group: 'Reading', look: true, default: 'compact',
      options: [{ id: 'compact', label: 'Compact' }, { id: 'comfortable', label: 'Comfortable' }, { id: 'roomy', label: 'Roomy' }],
      tokens: ['--k', '--t-body', '--t-title-px'] },
    { key: 'comments', label: 'Comment style', attr: 'data-comments', kind: 'seg', group: 'Reading', look: true, default: 'lines',
      options: [{ id: 'lines', label: 'Indented lines' }, { id: 'cards', label: 'Cards' }, { id: 'rail', label: 'Rail' }],
      tokens: ['--cm-guide', '--cm-guide-x', '--cm-pad', '--cm-stub-pad', '--cm-box', '--cm-stub-box', '--cm-radius', '--cm-bg', '--cm-gap', '--cm-split', '--cm-split-gap', '--cm-av'] },
    { key: 'accent', label: 'Accent', attr: 'data-accent', kind: 'swatch', group: 'Cards and tags', look: true, default: 'cobalt',
      options: [{ id: 'cobalt', label: 'Cobalt' }, { id: 'rust', label: 'Rust' }, { id: 'moss', label: 'Moss' }, { id: 'iris', label: 'Iris' }, { id: 'teal', label: 'Teal' }],
      tokens: ['--ah'] },
    { key: 'tags', label: 'Tag style', attr: 'data-tags', kind: 'seg', group: 'Cards and tags', look: true, default: 'dots',
      options: [{ id: 'chips', label: 'Chips' }, { id: 'text', label: 'Text' }, { id: 'dots', label: 'Dots' }],
      tokens: ['--tag-dot', '--tag-mark', '--tag-pad', '--tag-pad-y', '--tag-box', '--tag-bg', '--tag-fg'] },
    { key: 'images', label: 'Card images', attr: 'data-images', kind: 'seg', group: 'Cards and tags', look: true, default: 'on',
      options: [{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }],
      tokens: ['--card-media'], note: 'Off renders no card picture at all, so none is loaded.' }
  ];
  var GROUPS = ['View', 'Reading', 'Cards and tags'];

  /* 2. Built from the table */
  var BY_KEY = {};
  SETTINGS.forEach(function (s) { BY_KEY[s.key] = s; });
  var KEYS = SETTINGS.map(function (s) { return s.key; });
  var LOOK_KEYS = SETTINGS.filter(function (s) { return s.look; }).map(function (s) { return s.key; });
  var DEFAULTS = {};
  SETTINGS.forEach(function (s) { DEFAULTS[s.key] = s.default; });
  var GROUPED = GROUPS.map(function (g) { return { label: g, settings: SETTINGS.filter(function (s) { return s.group === g; }) }; });

  function option(key, id) {
    var s = BY_KEY[key];
    if (!s) return null;
    for (var i = 0; i < s.options.length; i++) if (s.options[i].id === id) return s.options[i];
    return null;
  }
  // Saved or coded settings, checked against the table: unknown keys and ids fall back to the default.
  function read(raw) {
    var out = {};
    KEYS.forEach(function (k) { var v = raw && raw[k]; out[k] = option(k, v) ? v : DEFAULTS[k]; });
    return out;
  }
  // Reset look: the seven look settings go back to their defaults; Layout, Open items as and Theme stay.
  function resetLook(set) {
    var out = Object.assign({}, set);
    LOOK_KEYS.forEach(function (k) { out[k] = DEFAULTS[k]; });
    return out;
  }

  /* 3. Widths, from the breakpoints in tokens.css */
  var BANDS = ['phone', 'narrow', 'medium', 'wide'];
  var bpCache = null;
  function breakpoints() {
    if (bpCache) return bpCache;
    var cs, out = {}, ok = true;
    try { cs = getComputedStyle(document.documentElement); } catch (e) { return null; }
    BANDS.forEach(function (b) { var v = parseFloat(cs.getPropertyValue('--bp-' + b)); if (!(v > 0)) ok = false; out[b] = v; });
    if (ok) bpCache = out;
    return ok ? out : null;
  }
  // Every band the width is under, plus "full": a 600px app is "narrow medium wide full".
  function bpOf(width) {
    var b = breakpoints(), hit = [];
    BANDS.forEach(function (id) { if (b && width < b[id]) hit.push(id); });
    return hit.concat(['full']).join(' ');
  }
  // Where an open item sits: beside the list (List), over the app (Grid as Page, and both
  // layouts under 760px) or as a sheet over the dimmed grid (Grid as Sheet).
  function readerOf(set, bp) {
    if ((' ' + bp + ' ').indexOf(' narrow ') >= 0) return 'page';
    if (set.layout === 'list') return 'pane';
    return set.openAs === 'sheet' ? 'sheet' : 'page';
  }

  /* 4. The app root's attributes, built from the table.
     ctx: { width, systemDark }. Theme Match system resolves to light or dark here. */
  function rootAttrs(set, ctx) {
    var s = read(set), c = ctx || {}, attrs = {};
    SETTINGS.forEach(function (row) {
      var v = s[row.key], o = option(row.key, v);
      if (o && o.follows) v = c.systemDark ? o.follows[1] : o.follows[0];
      attrs[row.attr] = v;
    });
    attrs['data-bp'] = bpOf(c.width || 0);
    attrs['data-reader'] = readerOf(s, attrs['data-bp']);
    return attrs;
  }
  function applyRoot(el, set, ctx) {
    var a = rootAttrs(set, ctx);
    Object.keys(a).forEach(function (k) { el.setAttribute(k, a[k]); });
    return a;
  }

  /* 5. The check: for every setting whose options change tokens, the option the table names as
     default (or its plain option) must be the one tokens.css draws when no attribute is set.
     It runs in a blank frame that loads this page's stylesheets, so nothing on the page (a
     theme on <html>, say) leaks in: one probe bare, one per option; every token the setting
     changes must compute the same on the bare probe and the default's. Resolves to one row
     per setting: { key, label, default, plain, drawn, ok, differs }. */
  function checkDefaults() {
    return new Promise(function (resolve) {
      var frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:absolute;width:0;height:0;border:0;visibility:hidden';
      var css = Array.prototype.map.call(document.querySelectorAll('link[rel="stylesheet"], style'), function (n) { return n.outerHTML; }).join('');
      frame.srcdoc = '<!doctype html><html><head>' + css + '</head><body></body></html>';
      frame.onload = function () {
        var res = probeAll(frame.contentDocument);
        frame.remove();
        resolve(res);
      };
      document.body.appendChild(frame);
    });
  }
  function probeAll(doc) {
    var host = doc.body, win = doc.defaultView, out = [];
    SETTINGS.forEach(function (s) {
      if (!s.tokens.length) { out.push({ key: s.key, label: s.label, drawn: s.default, ok: true, skipped: true, note: 'No tokens: the attribute is read by script only.' }); return; }
      var want = s.plain || s.default;
      var probe = function (id) {
        var el = doc.createElement('div');
        if (id) el.setAttribute(s.attr, id);
        host.appendChild(el);
        var cs = win.getComputedStyle(el), v = {};
        s.tokens.forEach(function (t) { v[t] = cs.getPropertyValue(t).trim(); });
        host.removeChild(el);
        return v;
      };
      var bare = probe(null), drawn = null, diff = [];
      s.options.forEach(function (o) {
        if (o.follows) return;
        var v = probe(o.id), same = s.tokens.every(function (t) { return v[t] === bare[t]; });
        if (same && drawn === null) drawn = o.id;
        if (o.id === want) diff = s.tokens.filter(function (t) { return v[t] !== bare[t]; });
      });
      out.push({ key: s.key, label: s.label, default: s.default, plain: want, drawn: drawn, ok: drawn === want && diff.length === 0, differs: diff });
    });
    return out;
  }

  /* 6. Helpers the components share */
  // A tag's hue slot, 0 to 7, stable for its name (tokens.css maps data-tag to the hue).
  function tagIndex(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return h % 8;
  }
  // Keep an item visible inside its own scrolling pane, once fonts and layout are ready.
  // Only the pane moves: never scrollIntoView, which would also scroll the app's root.
  function revealInPane(pane, el, centre) {
    if (!pane || !el) return;
    var go = function () {
      var p = pane.getBoundingClientRect(), r = el.getBoundingClientRect();
      if (r.top >= p.top && r.bottom <= p.bottom) return;
      pane.scrollTop += centre ? ((r.top + r.bottom) - (p.top + p.bottom)) / 2 : r.top < p.top ? r.top - p.top : r.bottom - p.bottom;
    };
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () { requestAnimationFrame(function () { requestAnimationFrame(go); }); });
  }
  // A number range in a table cell ("30–40", "1-3") wrapped so it never breaks; dates
  // ("2026-11-03") and versions are left alone. Returns HTML-safe pieces: [{ text, nw }].
  var RANGE = /(^|[^\w.\-–—])(\d+(?:\.\d+)?[–—-]\d+(?:\.\d+)?)(?![\d\-–—])/g;
  function rangePieces(text) {
    var out = [], last = 0, m;
    RANGE.lastIndex = 0;
    while ((m = RANGE.exec(text))) {
      var at = m.index + m[1].length;
      if (at > last) out.push({ text: text.slice(last, at), nw: false });
      out.push({ text: m[2], nw: true });
      last = at + m[2].length;
    }
    if (last < text.length) out.push({ text: text.slice(last), nw: false });
    return out;
  }
  // The key hints, by where the reader sits.
  var HINTS = { list: 'j k move · Enter open · m read · / search', reader: 'j k or ← → move · m read · Esc back', readerNoArrows: 'j k move · m read · Esc back' };

  // Boxes that scroll sideways (code blocks and wide tables, .sxw > .sx): data-more="1" on the
  // wrapper while more is hidden on the right; a table is a focus stop only while it can scroll.
  function fades(root) {
    (root || document).querySelectorAll('.sxw').forEach(function (box) {
      var sx = box.querySelector('.sx');
      if (!sx) return;
      var wide = sx.scrollWidth > sx.clientWidth + 1, more = sx.scrollLeft + sx.clientWidth < sx.scrollWidth - 1;
      box.setAttribute('data-more', more ? '1' : '0');
      if (sx.classList.contains('tbl')) {
        if (wide) { sx.setAttribute('tabindex', '0'); sx.setAttribute('role', 'region'); sx.setAttribute('aria-label', sx.getAttribute('data-label') || 'Table'); }
        else { sx.removeAttribute('tabindex'); sx.removeAttribute('role'); sx.removeAttribute('aria-label'); }
      }
      if (!sx._fades) { sx._fades = true; sx.addEventListener('scroll', function () { fades(box.parentNode); }, { passive: true }); }
    });
  }
  // For previews and embeds that draw the app inside a page with its own theme: copy the
  // document's data-theme onto every .app root that has no data-theme-fixed, now and on change.
  function followTheme() {
    var html = document.documentElement;
    var copy = function () {
      var t = html.getAttribute('data-theme') || 'light';
      document.querySelectorAll('.app:not([data-theme-fixed])').forEach(function (a) { a.setAttribute('data-theme', t); });
    };
    copy();
    if (typeof MutationObserver !== 'undefined') new MutationObserver(copy).observe(html, { attributes: true, attributeFilter: ['data-theme'] });
  }

  return {
    SETTINGS: SETTINGS, GROUPS: GROUPS, GROUPED: GROUPED, KEYS: KEYS, LOOK_KEYS: LOOK_KEYS, DEFAULTS: DEFAULTS,
    option: option, read: read, resetLook: resetLook,
    breakpoints: breakpoints, bpOf: bpOf, readerOf: readerOf, rootAttrs: rootAttrs, applyRoot: applyRoot,
    checkDefaults: checkDefaults, tagIndex: tagIndex, revealInPane: revealInPane, rangePieces: rangePieces, HINTS: HINTS,
    fades: fades, followTheme: followTheme
  };
})();
