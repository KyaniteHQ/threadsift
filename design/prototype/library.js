/* library.js — what several files share: the widths (read from tokens.css), the app's settings
   table, the state read and write rules, the data preparation and the display helpers. Loaded in <head>
   right after support.js by Main (the Compare shell), Library (the app) and every component
   that renders on its own board. One global: LIB.

   0. Widths                     3. Data preparation
   1. Settings tables            4. Display helpers, paste messages, icons
   2. State (read, write, codes)                                                       */
var LIB = (function () {
  'use strict';

  function byId(table, id) { for (var i = 0; i < table.length; i++) if (table[i].id === id) return table[i]; return null; }

  /* ---------------------------------------------------------------------------
     0. Widths. The breakpoints are tokens (--bp-phone, --bp-narrow, --bp-medium, --bp-wide in
     tokens.css, with the grid's column counts); this reads them once tokens.css has loaded.
     The app measures its own root and marks it with data-bp: every band whose width it is
     under, so a 600px app is "narrow medium wide full". CSS rules that change at a width use
     [data-bp~="narrow"] and so on. Until tokens.css has loaded, breakpoints() is null and
     every width is "full".
     --------------------------------------------------------------------------- */
  var BANDS = ['phone', 'narrow', 'medium', 'wide'];
  var bpCache = null;
  function breakpoints() {
    if (bpCache) return bpCache;
    var cs = null, out = {}, ok = true;
    try { cs = window.getComputedStyle(document.documentElement); } catch (e) { return null; }
    BANDS.forEach(function (id) { var v = parseFloat(cs.getPropertyValue('--bp-' + id)); if (!(v > 0)) ok = false; out[id] = v; });
    if (ok) bpCache = out;
    return ok ? out : null;
  }
  function bpOf(width) {
    var b = breakpoints(), is = { full: true }, hit = [];
    BANDS.forEach(function (id) { is[id] = !!b && width < b[id]; if (is[id]) hit.push(id); });
    return { attr: hit.concat(['full']).join(' '), is: is };
  }

  /* ---------------------------------------------------------------------------
     1. The app's settings. Every look option's values live in tokens.css, picked by an
     attribute on the app's root (data-font="news" and so on); these tables hold only each
     option's id and its label in the settings panel.
     --------------------------------------------------------------------------- */
  // Style: a whole look from a reference (tokens.css, one [data-style] block each). Library is the
  // plain look; any other style sets the fonts and the accent itself (the Font and Accent rows are off).
  var STYLES = [{ id: 'library', label: 'Library' }, { id: 'anthropic', label: 'Anthropic' }, { id: 'slash', label: 'Slash' }, { id: 'modal', label: 'Modal' }, { id: 'mymind', label: 'mymind' }, { id: 'monocle', label: 'Monocle' },
    { id: 'linear', label: 'Linear' }, { id: 'switch-lit', label: 'Switch-Lit' }, { id: 'cursor', label: 'Cursor' }, { id: 'steep', label: 'Steep' }, { id: 'cal-com', label: 'Cal.com' }];
  var THEMES = [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }, { id: 'sepia', label: 'Sepia' }];
  var ACCENTS = [{ id: 'cobalt', label: 'Cobalt' }, { id: 'rust', label: 'Rust' }, { id: 'moss', label: 'Moss' }, { id: 'iris', label: 'Iris' }, { id: 'teal', label: 'Teal' }];
  // The font link in tokens.css loads every pair's families; short: the pair's name in Compare.
  var TYPES = [
    { id: 'plex', label: 'IBM Plex Sans + Plex Mono', short: 'Plex' },
    { id: 'news', label: 'Newsreader + Instrument Sans', short: 'Newsreader' },
    { id: 'brico', label: 'Bricolage Grotesque + Figtree', short: 'Bricolage' },
    { id: 'inst', label: 'Instrument Serif + Geist', short: 'Instrument' },
    { id: 'mono', label: 'JetBrains Mono + Source Serif', short: 'Mono' }
  ];
  var DENSITIES = [{ id: 'compact', label: 'Compact' }, { id: 'comfortable', label: 'Comfortable' }, { id: 'roomy', label: 'Roomy' }];
  var MEASURES = [{ id: 'narrow', label: 'Narrow' }, { id: 'medium', label: 'Medium' }, { id: 'wide', label: 'Wide' }];
  var COMMENT_STYLES = [{ id: 'lines', label: 'Indented lines' }, { id: 'cards', label: 'Cards' }, { id: 'rail', label: 'Rail' }];
  var TAG_STYLES = [{ id: 'chips', label: 'Chips' }, { id: 'text', label: 'Text' }, { id: 'dots', label: 'Dots' }];
  var IMAGES = [{ id: true, label: 'On' }, { id: false, label: 'Off' }];

  /* What the user chooses in the settings panel, saved in the browser.
     kind: the control (seg: buttons in a row, select, swatch: accent colours).
     Open items as applies to Grid only. Theme 'system' follows the device's light or dark. */
  var SETTINGS = {
    layout: { label: 'Layout', kind: 'seg', options: [{ id: 'list', label: 'List' }, { id: 'grid', label: 'Grid' }] },
    openAs: { label: 'Open items as', kind: 'seg', options: [{ id: 'page', label: 'Page' }, { id: 'sheet', label: 'Sheet' }] },
    style: { label: 'Style', kind: 'select', options: STYLES },
    theme: { label: 'Theme', kind: 'seg', options: THEMES.concat([{ id: 'system', label: 'Match system' }]) },
    font: { label: 'Font', kind: 'select', options: TYPES },
    width: { label: 'Text width', kind: 'seg', options: MEASURES },
    density: { label: 'Density', kind: 'seg', options: DENSITIES },
    comments: { label: 'Comment style', kind: 'seg', options: COMMENT_STYLES },
    accent: { label: 'Accent', kind: 'swatch', options: ACCENTS },
    tags: { label: 'Tag style', kind: 'seg', options: TAG_STYLES },
    images: { label: 'Card images', kind: 'seg', options: IMAGES }
  };
  var SETTING_GROUPS = [
    { label: 'View', keys: ['layout', 'openAs'] },
    { label: 'Reading', keys: ['style', 'theme', 'font', 'width', 'density', 'comments'] },
    { label: 'Cards and tags', keys: ['accent', 'tags', 'images'] }
  ];
  // Style comes last, so a preset code saved before it existed (one part shorter) still reads, as Library.
  var SETTING_KEYS = ['layout', 'openAs', 'theme', 'font', 'width', 'density', 'comments', 'accent', 'tags', 'images', 'style'];
  // The look settings: what "Reset look" returns to the defaults (Layout, Open items as and Theme stay).
  var LOOK_KEYS = ['style', 'font', 'width', 'density', 'comments', 'accent', 'tags', 'images'];
  // What a style other than Library sets itself, so these rows are shown off while one is on.
  var STYLE_SETS = ['font', 'accent'];
  // The defaults: the List look (the plain values in tokens.css), List, Page and Match system.
  var SETTINGS_DEFAULT = { layout: 'list', openAs: 'page', theme: 'system', font: 'plex', width: 'medium', density: 'compact', comments: 'lines', accent: 'cobalt', tags: 'dots', images: true, style: 'library' };
  // Built-in presets for the Tweaks panel: the defaults, and the old Grid draft's look.
  var PRESETS = [
    { name: 'Defaults', set: SETTINGS_DEFAULT },
    { name: 'Grid look', set: Object.assign({}, SETTINGS_DEFAULT, { layout: 'grid', theme: 'light', font: 'brico', width: 'wide', density: 'roomy', comments: 'cards', accent: 'iris', tags: 'chips' }) }
  ];
  // The three ways to show the list and an item, by name, for Compare.
  var COMBOS = [
    { id: 'list', label: 'List', set: { layout: 'list' } },
    { id: 'grid-page', label: 'Grid · Page', set: { layout: 'grid', openAs: 'page' } },
    { id: 'grid-sheet', label: 'Grid · Sheet', set: { layout: 'grid', openAs: 'sheet' } }
  ];
  function comboOf(set) { return set.layout === 'list' ? 'list' : 'grid-' + set.openAs; }
  function settingValue(k, raw) {   // a stored or coded value, checked against the table
    var v = k === 'images' ? toBool(raw) : raw;
    return SETTINGS[k] && v !== null && byId(SETTINGS[k].options, v) ? v : null;
  }
  function readSettings(store, defaults) {
    var out = Object.assign({}, SETTINGS_DEFAULT, defaults || {}), saved = null;
    try { saved = JSON.parse(safeGet(store) || 'null'); } catch (e) { saved = null; }
    SETTING_KEYS.forEach(function (k) { var v = saved ? settingValue(k, saved[k]) : null; if (v !== null) out[k] = v; });
    return out;
  }
  function writeSettings(set, store) { safeSet(store, JSON.stringify(set)); }
  // A whole settings set as one short code, for presets: "list.page.system.plex.…".
  function codeOf(set) { return SETTING_KEYS.map(function (k) { return toBit(set[k]); }).join('.'); }
  function parseCode(c) {
    if (typeof c !== 'string') return null;
    var parts = c.split('.'), out = {};
    if (parts.length === SETTING_KEYS.length - 1) parts.push(SETTINGS_DEFAULT.style);   // a code from before Style
    if (parts.length !== SETTING_KEYS.length) return null;
    for (var i = 0; i < SETTING_KEYS.length; i++) {
      var v = settingValue(SETTING_KEYS[i], parts[i]);
      if (v === null) return null;
      out[SETTING_KEYS[i]] = v;
    }
    return out;
  }
  function autoName(set) {
    var look = set.style && set.style !== 'library' ? byId(STYLES, set.style).label : byId(TYPES, set.font).short + ' · ' + byId(ACCENTS, set.accent).label;
    return byId(COMBOS, comboOf(set)).label + ' · ' + look + ' · ' + byId(DENSITIES, set.density).label;
  }

  /* ---------------------------------------------------------------------------
     2. The prototype's saved state (open item, first-run screen), for Main.
     Booleans are booleans inside; "1"/"0" only in storage and the URL.
     Read: defaults, then saved, then the URL. cmp and tw are never saved.
     --------------------------------------------------------------------------- */
  function toBool(v) { return v === true || v === '1' ? true : v === false || v === '0' ? false : null; }
  function toBit(v) { return typeof v === 'boolean' ? (v ? '1' : '0') : v; }
  var SCHEMA = [
    { k: 'open', read: function (v) { return typeof v === 'string' && /^([a-z]+-[a-z0-9-]+)?$/.test(v) ? v : null; }, save: true },
    { k: 'by', read: function (v) { return v === 'auto' || v === 'user' || v === '' ? v : null; }, save: true },   // who opened it: you, or List by itself
    { k: 'empty', read: toBool, save: true },
    { k: 'cmp', read: toBool, save: false },
    { k: 'tw', read: toBool, save: false }
  ];
  function safeGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  function readState(store) {
    var s = { open: '', by: '', empty: false, cmp: false, tw: true };
    var saved = null, q = null;
    try { saved = JSON.parse(safeGet(store) || 'null'); } catch (e) { saved = null; }
    try { q = new URLSearchParams(window.location.search); } catch (e) { q = null; }
    SCHEMA.forEach(function (f) {
      if (!f.save || !saved || saved[f.k] == null) return;
      var v = f.read(saved[f.k]);
      if (v !== null) s[f.k] = v;
    });
    SCHEMA.forEach(function (f) {
      if (!q || !q.has(f.k)) return;
      var v = f.read(q.get(f.k));
      if (v !== null) s[f.k] = v;
    });
    return s;
  }
  function writeState(s, store) {
    var saved = {};
    SCHEMA.forEach(function (f) { if (f.save) saved[f.k] = toBit(s[f.k]); });
    safeSet(store, JSON.stringify(saved));
    var query = '?' + SCHEMA.map(function (f) { return f.k + '=' + encodeURIComponent(toBit(s[f.k])); }).join('&');
    try { window.history.replaceState(null, '', query); } catch (e) { /* inside the canvas the address bar belongs to the viewer */ }
  }

  /* ---------------------------------------------------------------------------
     3. Data preparation: the facts in data.json plus the few fields every view needs.
     --------------------------------------------------------------------------- */
  var KINDS = {
    'reddit-post': { source: 'reddit', label: 'Reddit', screen: 'reddit', noun: 'comments', orig: 'Original post', open: 'Open on Reddit', verb: 'posted' },
    'reddit-comment': { source: 'reddit', label: 'Reddit', screen: 'reddit', noun: '', orig: 'Saved comment', open: 'Open on Reddit', verb: 'posted' },
    'x-post': { source: 'x', label: 'X', screen: 'x', noun: 'replies', orig: 'Original post', open: 'Open on X', verb: 'posted' },
    'github-repo': { source: 'github', label: 'GitHub', screen: 'github', noun: '', orig: 'Repository', open: 'Open on GitHub', verb: 'pushed' }
  };
  var SOURCES = [{ id: 'reddit', label: 'Reddit' }, { id: 'x', label: 'X' }, { id: 'github', label: 'GitHub' }, { id: 'article', label: 'Article' }];
  function prepare(data) {
    var asOf = data.asOf;
    var items = data.items.map(function (it) {
      var K = KINDS[it.kind];
      var kept = (it.comments || []).filter(function (c) { return c.role === 'kept'; });
      var title = it.title || (it.kind === 'github-repo' ? it.repo.owner + '/' + it.repo.name : plainSpans((it.body[0] || {}).spans).split('\n')[0].trim());
      var where = it.kind === 'x-post' ? '@' + it.author : it.kind === 'github-repo' ? 'github.com/' + it.author : 'r/' + it.subreddit;
      var search = [title, it.summary, it.points.join(' '), it.topic, it.tags.join(' '), it.author || '', where, plainBlocks(it.body)]
        .concat(kept.map(function (c) { return c.author + ' ' + plainBlocks(c.body); }))
        .concat(it.quoted ? [plainBlocks(it.quoted.body)] : [])
        .concat(it.repo ? [it.repo.description || '', (it.repo.topics || []).join(' '), it.repo.language || ''] : [])
        .join(' ').replace(/\s+/g, ' ');
      return Object.assign({}, it, {
        K: K, source: K.source, title: title, where: where, keptN: kept.length,
        postedLabel: K.verb + ' ' + ago(it.posted, asOf), savedLabel: 'saved ' + ago(it.saved, asOf),
        search: search, lower: search.toLowerCase(), titleLower: title.toLowerCase(),
        tagView: it.tags.map(function (t) { return { name: t, hue: hue(t) }; })
      });
    });
    items.sort(function (a, b) { return a.saved < b.saved ? 1 : a.saved > b.saved ? -1 : 0; });
    var byKey = {}, tagCount = {}, topicCount = {};
    items.forEach(function (it) {
      byKey[it.key] = it;
      topicCount[it.topic] = (topicCount[it.topic] || 0) + 1;
      it.tags.forEach(function (t) { tagCount[t] = (tagCount[t] || 0) + 1; });
    });
    return {
      asOf: asOf, items: items, byKey: byKey, demo: data.demo,
      topics: data.topics.slice().sort(function (a, b) { return (topicCount[b] || 0) - (topicCount[a] || 0); }),
      tags: Object.keys(tagCount).sort(function (a, b) { return tagCount[b] - tagCount[a] || (a < b ? -1 : 1); })
    };
  }

  /* ---------------------------------------------------------------------------
     4. Display helpers, paste messages, icons
     --------------------------------------------------------------------------- */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function pressed(b) { return b ? 'true' : 'false'; }
  function num(n) { return Number(n).toLocaleString('en-US'); }
  function compact(n) {
    if (n == null) return '';
    if (n >= 10000) return Math.round(n / 1000) + 'k';
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
    return String(n);
  }
  // "today", "3d ago", "Oct 25", and the year for any other year: "Jan 15, 2025".
  function ago(iso, asOf) {
    var d = new Date(iso), now = new Date(asOf), days = Math.floor((now - d) / 86400000);
    if (days < 1 && d.getUTCFullYear() === now.getUTCFullYear()) return 'today';
    if (days < 7 && d.getUTCFullYear() === now.getUTCFullYear()) return days + 'd ago';
    return MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + (d.getUTCFullYear() === now.getUTCFullYear() ? '' : ', ' + d.getUTCFullYear());
  }
  function shortUrl(u) {
    var v = String(u || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    return v.length <= 44 ? v : v.slice(0, 42) + '…';
  }
  function plainSpans(spans) { return (spans || []).map(function (s) { return s.text; }).join(''); }
  function plainBlocks(blocks) {
    return (blocks || []).map(function (b) {
      if (b.type === 'code') return b.text;
      if (b.type === 'ul' || b.type === 'ol') return b.items.map(function (it) { return plainSpans(it.spans); }).join(' ');
      if (b.type === 'table') return [b.head].concat(b.rows).map(function (r) { return r.map(plainSpans).join(' '); }).join(' ');
      return plainSpans(b.spans);
    }).join(' ');
  }
  function hue(tag) {   // a stable hue per tag; CSS turns it into a colour
    var h = 0;
    for (var i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
    return [20, 60, 105, 150, 195, 240, 285, 330][h % 8];
  }
  var PASTE = {
    processing: { title: 'Reading the link', sub: 'Usually done within a minute', icon: 'spin', tone: 'acc', actions: [] },
    done: { title: 'Added', icon: 'check', tone: 'ok', actions: ['open', 'dismiss'] },
    refreshed: { title: 'Already saved, refreshed', icon: 'refresh', tone: 'acc', actions: ['open', 'dismiss'] },
    failed: { title: '', icon: 'warn', tone: 'warn', actions: ['retry', 'dismiss'] },
    reasons: { blocked: 'Reddit blocked the request', unreadable: 'Couldn’t read this page', invalid: 'That doesn’t look like a link' }
  };
  // The comments button's text, longest to shortest: "Comments 2 of 14", "2 of 14", "2".
  function commentsLabel(it, form) {
    var kept = String(it.keptN), of = kept + ' of ' + num(it.commentCount);
    return form === 'count' ? kept : form === 'short' ? of : (it.K.noun === 'replies' ? 'Replies ' : 'Comments ') + of;
  }
  function pasteTitle(p) { return p.mode === 'failed' ? PASTE.reasons[p.reason || 'blocked'] : (PASTE[p.mode] || {}).title || ''; }
  var ICONS = {
    left: ['M15 5l-7 7 7 7'], x: ['M6 6l12 12M18 6L6 18'],
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    external: ['M14 5h5v5', 'M19 5l-8 8', 'M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4'],
    spin: ['M12 4a8 8 0 1 0 8 8'], warn: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17.5v0.01'],
    refresh: ['M20 11a8 8 0 0 0-14.3-4.9L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14.3 4.9L20 16', 'M20 20v-4h-4']
  };

  return {
    byId: byId, pressed: pressed, breakpoints: breakpoints, bpOf: bpOf,
    SETTINGS: SETTINGS, SETTING_GROUPS: SETTING_GROUPS, SETTING_KEYS: SETTING_KEYS, LOOK_KEYS: LOOK_KEYS, STYLE_SETS: STYLE_SETS, STYLES: STYLES, SETTINGS_DEFAULT: SETTINGS_DEFAULT,
    PRESETS: PRESETS, COMBOS: COMBOS, comboOf: comboOf, settingValue: settingValue, readSettings: readSettings, writeSettings: writeSettings,
    codeOf: codeOf, parseCode: parseCode, readState: readState, writeState: writeState,
    safeGet: safeGet, safeSet: safeSet, autoName: autoName,
    SOURCES: SOURCES, prepare: prepare,
    num: num, compact: compact, ago: ago, shortUrl: shortUrl, plainBlocks: plainBlocks,
    PASTE: PASTE, pasteTitle: pasteTitle, commentsLabel: commentsLabel, ICONS: ICONS
  };
})();
