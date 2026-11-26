import { items, topics } from "./items.js";

export const DIRECTIONS = {
  quarto: {
    name: "Quarto",
    idea: "A technical monograph: one grotesque family, a ruled matrix of hairlines, and a green ink.",
    accent: "moss",
    fonts: [
      { id: "library", name: "Schibsted Grotesk" },
      { id: "broadsheet", name: "Schibsted + Source Serif" },
      { id: "workbench", name: "Commit Mono" },
      { id: "atkinson", name: "Atkinson Hyperlegible" },
    ],
    styleFont: { library: "library", broadsheet: "broadsheet", workbench: "workbench" },
  },
  index: {
    name: "Index Room",
    idea: "A library catalogue: every Item is a card filed in a reading room, headed by its catalogue line and stamped while unread.",
    accent: "iris",
    fonts: [
      { id: "library", name: "Libre Franklin + Literata" },
      { id: "workbench", name: "Fragment Mono + Literata" },
      { id: "atkinson", name: "Atkinson Hyperlegible" },
    ],
    styleFont: { library: "library", broadsheet: "library", workbench: "workbench" },
  },
  proof: {
    name: "Proof Sheet",
    idea: "A photographer's contact sheet: every frame is shown, and a china marker picks the keepers.",
    accent: "marker",
    fonts: [
      { id: "library", name: "Archivo + Source Serif" },
      { id: "workbench", name: "JetBrains Mono + Source Serif" },
      { id: "atkinson", name: "Atkinson Hyperlegible" },
    ],
    styleFont: { library: "library", broadsheet: "library", workbench: "workbench" },
  },
};

const STYLES = [
  { id: "library", name: "Library" },
  { id: "broadsheet", name: "Broadsheet" },
  { id: "workbench", name: "Workbench" },
];
const ACCENTS = [
  { id: "marker", name: "Marker red", only: "proof" },
  { id: "cobalt", name: "Cobalt" },
  { id: "rust", name: "Rust" },
  { id: "moss", name: "Moss" },
  { id: "iris", name: "Iris" },
  { id: "teal", name: "Teal" },
];
const SCREENS = [
  { id: "list", name: "List" },
  { id: "grid", name: "Grid" },
  { id: "reader", name: "Reader" },
  { id: "components", name: "Components" },
];
const THEMES = [
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
  { id: "sepia", name: "Sepia" },
];
const BANDS = [
  ["phone", 480],
  ["narrow", 760],
  ["medium", 1080],
  ["wide", 1440],
];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICONS = {
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  back: '<path d="M14 6l-6 6 6 6"/>',
  prev: '<path d="M6 15l6-6 6 6"/>',
  next: '<path d="M6 9l6 6 6-6"/>',
  out: '<path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  grid: '<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  fold: '<path d="M4 8h10M4 12h7M4 16h10"/><path d="M17 10l3 2-3 2"/>',
  up: '<path d="M8 4v10h10"/><path d="M14 10l4 4-4 4"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
};
const icon = (n) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

function rand(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function coverSVG(item) {
  const { kind, hue } = item.cover;
  const r = rand(item.id);
  const c = (l, ch = 0.06, h = hue) => `oklch(${l} ${ch} ${h})`;
  let body = "";
  if (kind === "rack") {
    body = `<rect width="320" height="200" fill="${c(0.3, 0.03)}"/>`;
    for (let i = 0; i < 7; i++) {
      const y = 18 + i * 25;
      body += `<rect x="60" y="${y}" width="200" height="20" fill="${c(0.42 + r() * 0.08, 0.02)}"/>`;
      for (let j = 0; j < 8; j++) body += `<rect x="${70 + j * 10}" y="${y + 7}" width="5" height="5" fill="${r() > 0.55 ? c(0.82, 0.14, 150) : c(0.55, 0.02)}"/>`;
      body += `<rect x="${200 + r() * 30}" y="${y + 6}" width="${22}" height="8" fill="${c(0.6, 0.03)}"/>`;
    }
  } else if (kind === "blocks") {
    body = `<rect width="320" height="200" fill="${c(0.93, 0.03)}"/>`;
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 5; y++) if (r() > 0.35) body += `<rect x="${12 + x * 38}" y="${12 + y * 37}" width="32" height="31" fill="${c(0.45 + r() * 0.4, 0.05 + r() * 0.06)}"/>`;
  } else if (kind === "arcs") {
    body = `<rect width="320" height="200" fill="${c(0.25, 0.04)}"/>`;
    for (let i = 9; i > 0; i--) body += `<circle cx="300" cy="200" r="${i * 34}" fill="${c(0.3 + i * 0.06, 0.08 + i * 0.006)}"/>`;
  } else if (kind === "terrain") {
    body = `<rect width="320" height="200" fill="${c(0.9, 0.04)}"/>`;
    for (let i = 0; i < 6; i++) {
      const base = 70 + i * 24;
      let d = `M0 ${base}`;
      for (let x = 0; x <= 320; x += 40) d += ` L${x} ${base - r() * 30}`;
      body += `<path d="${d} L320 200 L0 200Z" fill="${c(0.78 - i * 0.09, 0.05 + i * 0.01)}"/>`;
    }
  } else {
    body = `<rect width="320" height="200" fill="${c(0.94, 0.04)}"/>`;
    for (let i = -10; i < 20; i++) body += `<path d="M${i * 24} 200 L${i * 24 + 120} 0" stroke="${c(0.5 + (i % 3) * 0.12, 0.09)}" stroke-width="${6 + (i % 4) * 3}"/>`;
  }
  return `<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;
}

const SOURCE = { reddit: "Reddit", x: "X", github: "GitHub", article: "Article", other: "Other" };

function stripText(it) {
  if (it.linkOnly) return `Reddit · r/${it.community}`;
  if (it.kind === "comment") return `r/${it.community} · Saved comment`;
  const count = it.counts ? (it.digest ? `Kept ${it.counts.kept} of ${it.counts.saved}` : `Showing ${it.counts.shown} of ${it.counts.saved}`) : "";
  if (it.source === "reddit") return `r/${it.community} · ${count}`;
  if (it.source === "x") return `X · @${it.handle} · ${count}`;
  if (it.source === "github") return `GitHub · ${it.language}`;
  return `${SOURCE[it.source]} · ${it.domain}`;
}
const keptShare = (it) => (it.digest && it.counts?.kept ? (it.counts.kept / it.counts.saved).toFixed(3) : 0);

function markBtn(it, cls = "") {
  const label = it.read ? "Read. Mark as unread" : "Unread. Mark as read";
  return `<button class="mark ${cls}" type="button" aria-pressed="${it.read}" aria-label="${label}" data-act="read" data-id="${it.id}"></button>`;
}
function strip(it) {
  return `<div class="share" style="--kept:${keptShare(it)}"></div><div class="strip">${markBtn(it)}<span class="st">${esc(stripText(it))}</span></div>`;
}
function byline(it, withTopic = true) {
  const who = it.author ? (it.source === "reddit" ? `u/${it.author}` : it.source === "github" ? it.repo : it.author) : "No author stored";
  const parts = [who, `Saved ${it.saved}`];
  if (withTopic) parts.push(it.topic);
  return parts.map(esc).join('<span class="sep" aria-hidden="true">·</span>');
}
const tagList = (it) => (it.tags.length ? `<div class="tags">${it.tags.map((t) => `<span class="tag" data-tag="${t.hue}"><span class="nm">${esc(t.name)}</span></span>`).join("")}</div>` : "");

function row(it, open) {
  return `<article class="row ${it.read ? "" : "unread"}" data-id="${it.id}" ${open ? 'aria-current="true"' : ""}>
    ${strip(it)}
    <div class="row-main"><div class="row-text">
      <h3 class="title"><a href="#${it.id}" data-act="open" data-id="${it.id}">${esc(it.title)}</a></h3>
      <p class="meta">${byline(it)}</p>${tagList(it)}
    </div>${it.cover ? `<div class="cover thumb">${coverSVG(it)}</div>` : ""}</div>
  </article>`;
}

function card(it) {
  return `<article class="card banded ruled-strip ${it.read ? "" : "unread"} ${it.cover ? "has-cover" : ""}" data-id="${it.id}" data-read="${it.read}">
    ${strip(it)}
    ${it.cover ? `<div class="cover">${coverSVG(it)}</div>` : ""}
    <div class="card-body">
      <h3 class="title"><a href="#${it.id}" data-act="open" data-id="${it.id}">${esc(it.title)}</a></h3>
      <p class="meta">${markBtn(it, "mark-meta")}${byline(it, false)}</p>
      ${it.summary ? `<p class="excerpt">${esc(it.summary)}</p>` : `<p class="excerpt">${it.linkOnly ? "Link only. No content was fetched." : "Waiting for a Digest."}</p>`}
      ${tagList(it)}
    </div>
  </article>`;
}

function commentNodes(list, depth) {
  return `<ol class="cm-list ${depth > 4 ? "capped" : ""}">${list
    .map((c) => {
      if (c.stub === "more") return `<li class="stub">${icon("fold")}${c.n} more replies were not saved</li>`;
      if (c.stub === "parent") return `<li><div class="stub">${icon("up")}A comment above these replies was not kept</div>${c.kids?.length ? commentNodes(c.kids, depth + 1) : ""}</li>`;
      return `<li class="cm"><div class="cm-head"><b>${esc(c.a.startsWith("@") ? c.a : `u/${c.a}`)}</b><span>${esc(c.age)}</span></div><p class="cm-text">${esc(c.text)}</p>${c.kids?.length ? commentNodes(c.kids, depth + 1) : ""}</li>`;
    })
    .join("")}</ol>`;
}

function summaryBox(it) {
  if (!it.summary) {
    return `<div class="pending" role="status"><span class="label">Summary</span><span>Waiting for a Digest. The comments below passed the first step of the comment filter.</span><div class="line"></div></div>`;
  }
  return `<section class="summary" aria-label="Summary"><h2 class="label">Summary</h2><p>${esc(it.summary)}</p>${
    it.keyPoints.length ? `<h3 class="label">Key points</h3><ul>${it.keyPoints.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : ""
  }</section>`;
}

function readerHead(it) {
  return `<header class="rd-head banded ruled-strip ${it.read ? "" : "unread"}">
    ${strip(it)}
    <h1 class="rd-title">${esc(it.title)}</h1>
    <p class="meta">${markBtn(it, "mark-meta")}${byline(it)}</p>
    ${tagList(it)}
    ${it.cover ? `<div class="cover rd-cover">${coverSVG(it)}</div>` : ""}
  </header>`;
}

function readerBody(it) {
  if (it.linkOnly) {
    return `${readerHead(it)}<section class="linkonly"><span class="label">Link only</span><p>Threadsift stores this link with its title and community. No post text or comments were fetched. Save the thread with the Extension from your own tab to keep it.</p><div class="rd-actions"><a class="btn" href="#" data-act="none">${icon("out")}Open on Reddit</a><button class="btn quiet" type="button">Try again</button></div></section>`;
  }
  const post = it.post.map((p) => `<p>${esc(p)}</p>`).join("") + (it.thread ? it.thread.map((p) => `<p class="thread-part">${esc(p)}</p>`).join("") : "");
  const facts = it.source === "github" ? `<dl class="facts"><div><dt class="label">Stars</dt><dd>${it.stars}</dd></div><div><dt class="label">Language</dt><dd>${it.language}</dd></div><div><dt class="label">Updated</dt><dd>${it.updated}</dd></div></dl>` : "";
  const heading = it.source === "github" ? "README" : it.kind === "comment" ? "Saved comment" : it.source === "article" || it.source === "other" ? "Article" : "Original post";
  const parentStub = it.parentStub ? `<div class="stub">${icon("up")}The post and the comment above this one are not saved</div>` : "";
  const comments = it.comments.length
    ? `<section class="cm-tree"><h2 class="h2">Comments <span class="meta">${it.digest ? `Kept ${it.counts.kept} of ${it.counts.saved}` : `Showing ${it.counts.shown} of ${it.counts.saved}`}</span></h2>${
        it.digest ? "" : `<p class="note-first">A Digest has not covered this thread yet, so these are the comments that passed the first step.</p>`
      }${commentNodes(it.comments, 1)}</section>`
    : "";
  return `${readerHead(it)}${summaryBox(it)}${facts}<section class="post"><h2 class="h2">${heading}</h2>${parentStub}${post}</section>${comments}`;
}

function readerBar(it, mode) {
  const i = items.indexOf(it);
  const back =
    mode === "pane"
      ? ""
      : mode === "sheet"
        ? `<button class="btn quiet" type="button" data-act="close-sheet">${icon("close")}<span class="lbl">Close</span></button>`
        : `<button class="btn quiet" type="button" data-act="back">${icon("back")}<span class="lbl">Library</span></button>`;
  const expand = mode === "sheet" ? `<button class="btn quiet icon" type="button" aria-label="Open as a full page" data-act="expand">${icon("expand")}</button>` : "";
  return `<div class="rd-bar">${back}<span class="pos">${i + 1} of ${items.length}</span>
    <button class="btn quiet icon" type="button" aria-label="Previous Item" data-act="step" data-step="-1">${icon("prev")}</button>
    <button class="btn quiet icon" type="button" aria-label="Next Item" data-act="step" data-step="1">${icon("next")}</button>
    <span class="grow"></span>
    <button class="btn" type="button" data-act="read" data-id="${it.id}">${icon("check")}<span class="lbl">${it.read ? "Mark as unread" : "Mark as read"}</span></button>
    <a class="btn quiet icon" href="#" aria-label="Open the saved link" data-act="none">${icon("out")}</a>
    ${expand}${mode === "sheet" ? "" : aaBtn()}
  </div>`;
}
const aaBtn = () => `<button class="btn quiet" type="button" popovertarget="look" aria-label="Look settings">Aa</button>`;
const wordmark = () => `<a class="wordmark" href="#" data-act="none">Thread<span class="wm-sift">sift</span></a>`;

function seg(name, opts, current, extra = "") {
  return `<div class="seg" role="radiogroup" aria-label="${esc(extra || name)}">${opts
    .map((o) => `<label><input type="radio" name="${name}" value="${o.id}" ${o.id === current ? "checked" : ""}>${esc(o.name)}</label>`)
    .join("")}</div>`;
}

function panel(s, d, popover = true) {
  const dir = DIRECTIONS[d];
  const tileArt = (st) => `<span class="tile-art" data-style="${st}" data-theme="${s.theme === "system" ? sysTheme() : s.theme}" data-accent="${dir.accent}" data-font="${dir.styleFont[st]}"><span class="t-card"><span class="t-strip"></span><span class="t-line"></span><span class="t-line"></span></span><span class="t-btn"></span></span>`;
  return `<div class="panel" ${popover ? 'popover id="look"' : ""} data-font="library" aria-label="Look settings">
    <div class="panel-head"><h2>Look</h2>${popover ? `<button class="btn quiet icon" type="button" popovertarget="look" popovertargetaction="hide" aria-label="Close">${icon("close")}</button>` : ""}</div>
    <div class="p-row"><span class="label" id="lbl-style">Style</span><div class="tiles" role="radiogroup" aria-labelledby="lbl-style">${STYLES.map(
      (st) => `<label class="tile"><input type="radio" name="style" value="${st.id}" ${s.style === st.id ? "checked" : ""}>${tileArt(st.id)}<span class="tile-name">${st.name}</span></label>`,
    ).join("")}</div></div>
    <div class="p-row"><span class="label">Theme</span>${seg("theme", [...THEMES, { id: "system", name: "Match system" }], s.theme, "Theme")}</div>
    <div class="p-row"><span class="label" id="lbl-acc">Accent</span><div class="swatches" role="radiogroup" aria-labelledby="lbl-acc">${ACCENTS.filter((a) => !a.only || a.only === d)
      .map((a) => `<label class="swatch" data-accent="${a.id}" title="${a.name}"><input type="radio" name="accent" value="${a.id}" aria-label="${a.name}" ${s.accent === a.id ? "checked" : ""}><span></span></label>`)
      .join("")}</div></div>
    <div class="p-row"><span class="label" id="lbl-font">Font</span><div class="tiles fonts" role="radiogroup" aria-labelledby="lbl-font">${dir.fonts
      .map((f) => `<label class="tile"><input type="radio" name="font" value="${f.id}" ${s.font === f.id ? "checked" : ""}><span class="tile-art font-art" data-font="${f.id}"><span class="ag">Ag</span><span class="rd">Reading text</span></span><span class="tile-name">${esc(f.name)}</span></label>`)
      .join("")}</div></div>
    <div class="p-row"><span class="label">Text size</span>${seg("size", [{ id: "small", name: "Small" }, { id: "medium", name: "Medium" }, { id: "large", name: "Large" }], s.size, "Text size")}</div>
    <div class="p-row"><span class="label">Text width</span>${seg("width", [{ id: "narrow", name: "Narrow" }, { id: "medium", name: "Medium" }, { id: "wide", name: "Wide" }], s.width, "Text width")}</div>
    <div class="p-row"><span class="label">Density</span>${seg("density", [{ id: "compact", name: "Compact" }, { id: "comfortable", name: "Comfortable" }], s.density, "Density")}</div>
    <div class="p-row"><span class="label">Card images</span>${seg("images", [{ id: "on", name: "On" }, { id: "off", name: "Off" }], s.images, "Card images")}</div>
    <div class="p-foot"><span class="meta">Theme and Layout stay as they are.</span><button class="btn quiet" type="button" data-act="reset">Reset look</button></div>
  </div>`;
}

function filterRail(s) {
  const counts = (f) => items.filter(f).length;
  const src = ["reddit", "x", "github", "article", "other"];
  return `<nav class="rail" aria-label="Filters">
    <div class="rail-group keep"><span class="label">Read state</span>${seg("readf", [{ id: "all", name: "All" }, { id: "unread", name: "Unread" }, { id: "read", name: "Read" }], s.readf, "Read state")}</div>
    <div class="rail-group"><span class="label">Source</span>${src
      .map((k) => `<a class="rail-row" href="#" data-act="src" data-src="${k}" ${s.src === k ? 'aria-current="true"' : ""}><span>${SOURCE[k]}</span><span class="n">${counts((i) => i.source === k)}</span></a>`)
      .join("")}</div>
    <div class="rail-group"><span class="label">Topics</span>${topics
      .map((t) => `<a class="rail-row" href="#" data-act="none"><span>${esc(t)}</span><span class="n">${counts((i) => i.topic === t)}</span></a>`)
      .join("")}</div>
  </nav>`;
}

function visible(s) {
  return items.filter((i) => (s.readf === "all" || (s.readf === "read") === i.read) && (!s.src || i.source === s.src));
}

const pasteBox = () => `<form class="paste" data-act="paste"><label class="vh" for="paste-${uid()}">Paste a link</label><input class="field" id="paste-${uid(true)}" type="url" placeholder="Paste a link to save it" required><button class="btn primary" type="submit">Save</button></form>`;
let uidN = 0;
function uid(same) {
  if (!same) uidN++;
  return uidN;
}
const searchBox = (ph = "Search the library") => `<label class="search"><span class="vh">Search</span>${icon("search")}<input class="field" type="search" placeholder="${ph}"></label>`;

function listScreen(s, d) {
  const vis = visible(s);
  const open = items.find((i) => i.id === s.item) ?? vis[0] ?? items[0];
  return `<div class="l-screen">
    <aside class="side"><div class="side-top">${wordmark()}<div class="g-tools"><button class="btn quiet icon" type="button" aria-label="Grid layout" data-act="screen" data-screen="grid">${icon("grid")}</button>${aaBtn()}</div></div>${pasteBox()}${filterRail(s)}</aside>
    <section class="list-pane" aria-label="Items"><div class="list-head">${searchBox()}<span class="count">${vis.length} Items</span></div>
      <div class="rows">${vis.map((i) => row(i, i === open)).join("")}</div></section>
    <section class="rd-pane" aria-label="Reader"><div class="rd">${readerBar(open, "pane")}<div class="rd-col">${readerBody(open)}</div></div></section>
  </div>${panel(s, d)}`;
}

function gridScreen(s, d) {
  const vis = visible(s);
  const ruled = getComputedStyle(document.documentElement).getPropertyValue("--grid-gap").trim() === "0px";
  return `<div class="g-screen">
    <header class="g-head">${wordmark()}${searchBox()}${pasteBox()}<div class="g-tools"><button class="btn quiet icon" type="button" aria-label="List layout" data-act="screen" data-screen="list">${icon("list")}</button>${aaBtn()}</div></header>
    <div class="g-scroll"><div class="g-filters" role="toolbar" aria-label="Filters">
      ${["all", "unread", "read"].map((k) => `<button class="chip" type="button" aria-pressed="${s.readf === k}" data-act="readf" data-v="${k}">${k === "all" ? "All" : k === "unread" ? "Unread" : "Read"}</button>`).join("")}
      <span class="sep" aria-hidden="true"></span>
      ${["reddit", "x", "github", "article"].map((k) => `<button class="chip" type="button" aria-pressed="${s.src === k}" data-act="src" data-src="${k}">${SOURCE[k]}<span class="n">${items.filter((i) => i.source === k).length}</span></button>`).join("")}
    </div>
    <div class="grid ${ruled ? "ruled" : ""}">${vis.map(card).join("")}</div></div>
  </div>${sheet(s)}${panel(s, d)}`;
}

function sheet(s) {
  const it = items.find((i) => i.id === s.sheet);
  if (!it) return "";
  return `<dialog class="sheet" aria-label="${esc(it.title)}"><div class="rd">${readerBar(it, "sheet")}<div class="rd-col">${readerBody(it)}</div></div></dialog>`;
}

function readerScreen(s, d) {
  const it = items.find((i) => i.id === s.item) ?? items[0];
  return `<div class="rd-pane" style="height:100%"><div class="rd">${readerBar(it, "page")}<div class="rd-col">${readerBody(it)}</div></div></div>${panel(s, d)}`;
}

function componentsScreen(s, d) {
  const dir = DIRECTIONS[d];
  const sample = items.filter((i) => ["mini-pc", "sqlite-wal", "kerning-comment", "stabilizers", "tidepool", "boring-formats", "local-first"].includes(i.id));
  const ruled = getComputedStyle(document.documentElement).getPropertyValue("--grid-gap").trim() === "0px";
  const mini = items.find((i) => i.id === "mini-pc");
  return `<div class="c-screen"><div class="c-page">
    <div class="c-intro"><h1>${dir.name}</h1><p>${esc(dir.idea)} Every part below is the same markup in all three directions; only the custom properties of the direction change it.</p></div>
    <section class="c-sec"><h2 class="h2">Buttons</h2><div class="c-cols">
      <div class="c-demo"><span class="label">Default, primary, quiet</span><div class="c-line"><button class="btn" type="button">Mark as read</button><button class="btn primary" type="button">Save</button><button class="btn quiet" type="button">Reset look</button></div></div>
      <div class="c-demo"><span class="label">Disabled</span><div class="c-line"><button class="btn" type="button" disabled>Mark as read</button><button class="btn primary" type="button" disabled>Save</button></div></div>
      <div class="c-demo"><span class="label">Focus</span><div class="c-line"><button class="btn is-focus" type="button">Mark as read</button><button class="btn primary is-focus" type="button">Save</button><button class="btn quiet icon is-focus" type="button" aria-label="Next Item">${icon("next")}</button></div></div>
    </div></section>
    <section class="c-sec"><h2 class="h2">Fields</h2><div class="c-cols">
      <div class="c-demo"><span class="label">Paste box</span>${pasteBox()}</div>
      <div class="c-demo"><span class="label">Search, focused</span><label class="search"><span class="vh">Search</span>${icon("search")}<input class="field is-focus" type="search" value="sqlite"></label></div>
      <div class="c-demo fld"><label class="label" for="c-name">Instance name</label><span class="fld-hint">Shown in the masthead of the sign-in screen.</span><input class="field is-invalid" id="c-name" value="" placeholder="Library" aria-describedby="c-err"><span class="fld-err" id="c-err">Enter a name.</span></div>
    </div></section>
    <section class="c-sec"><h2 class="h2">Chips, segments and Tags</h2><div class="c-cols">
      <div class="c-demo"><span class="label">Filter chips</span><div class="c-line"><button class="chip" type="button" aria-pressed="true">All</button><button class="chip" type="button" aria-pressed="false">Unread</button><button class="chip" type="button" aria-pressed="false">Reddit<span class="n">5</span></button></div></div>
      <div class="c-demo"><span class="label">Segmented control</span>${seg("c-seg", [{ id: "all", name: "All" }, { id: "unread", name: "Unread" }, { id: "read", name: "Read" }], "unread", "Read state sample")}</div>
      <div class="c-demo"><span class="label">Tags</span><div class="tags">${["power draw", "sqlite", "file formats", "sync", "transcoding", "a much longer tag name"].map((t, i) => `<span class="tag" data-tag="${(i * 3) % 8}"><span class="nm">${t}</span></span>`).join("")}</div></div>
    </div></section>
    <section class="c-sec"><h2 class="h2">Kept strip and unread mark</h2><div class="c-cols">
      <div class="c-demo"><span class="label">List row form</span><div class="c-strips">${sample.map((i) => `<div class="ruled-strip ${i.read ? "" : "unread"}">${strip(i)}</div>`).join("")}</div></div>
      <div class="c-demo"><span class="label">Card and Reader header form</span><div class="c-strips">${sample.slice(0, 4).map((i) => `<div class="banded ruled-strip" style="padding:0">${strip(i)}</div>`).join("")}</div></div>
    </div></section>
    <section class="c-sec"><h2 class="h2">List rows</h2><div class="c-cols"><div class="c-rows">${["mini-pc", "rack", "sqlite-wal", "stabilizers"].map((id, n) => row(items.find((i) => i.id === id), n === 1)).join("")}</div></div></section>
    <section class="c-sec"><h2 class="h2">Grid cards</h2><div class="grid c-grid ${ruled ? "ruled" : ""}">${["local-first", "sqlite-wal", "tidepool"].map((id) => card(items.find((i) => i.id === id))).join("")}</div></section>
    <section class="c-sec"><h2 class="h2">Reader header and summary box</h2><div class="c-cols"><div class="c-reader">${readerHead(mini)}${summaryBox(mini)}</div><div class="c-reader">${readerHead(items.find((i) => i.id === "sqlite-wal"))}${summaryBox(items.find((i) => i.id === "sqlite-wal"))}</div></div></section>
    <section class="c-sec"><h2 class="h2">Comment tree with Context stubs</h2><div class="c-reader">${commentNodes(mini.comments, 1)}</div></section>
    <section class="c-sec"><h2 class="h2">Settings panel</h2><div class="c-panel">${panel(s, d, false)}</div></section>
  </div></div>`;
}

const sysTheme = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export function boot() {
  const q = new URLSearchParams(location.search);
  const d = DIRECTIONS[q.get("d")] ? q.get("d") : "quarto";
  const dir = DIRECTIONS[d];
  const s = {
    screen: SCREENS.some((x) => x.id === q.get("screen")) ? q.get("screen") : "list",
    theme: [...THEMES.map((t) => t.id), "system"].includes(q.get("theme")) ? q.get("theme") : "light",
    item: q.get("item") ?? "mini-pc",
    sheet: null,
    style: "library",
    font: "library",
    accent: dir.accent,
    size: "medium",
    width: "medium",
    density: "compact",
    images: "on",
    readf: "all",
    src: null,
  };
  const embed = q.has("embed");
  const root = document.documentElement;
  const main = document.querySelector("#screen");
  const bar = document.querySelector(".kitbar");

  function apply() {
    root.dataset.direction = d;
    root.dataset.theme = s.theme === "system" ? sysTheme() : s.theme;
    for (const k of ["style", "font", "accent", "size", "width", "density", "images"]) root.dataset[k] = s[k];
  }
  function url() {
    const p = new URLSearchParams({ d, screen: s.screen, theme: s.theme });
    if (s.screen === "reader" || s.screen === "list") p.set("item", s.item);
    if (embed) p.set("embed", "");
    history.replaceState(null, "", `?${p}`);
  }
  function kitbar() {
    if (embed) {
      bar.remove();
      return;
    }
    bar.innerHTML = `<b>Brand kit</b><span class="kb-group"><span class="kb-name">Direction</span>${seg("kb-d", Object.entries(DIRECTIONS).map(([id, v]) => ({ id, name: v.name })), d, "Direction")}</span>
      <span class="kb-group"><span class="kb-name">Screen</span>${seg("kb-screen", SCREENS, s.screen, "Screen")}</span>
      <span class="kb-group"><span class="kb-name">Theme</span>${seg("kb-theme", THEMES, root.dataset.theme, "Theme")}</span>
      <a class="kb-end" href="./index.html?screen=${s.screen}&theme=${root.dataset.theme}">Side by side</a>`;
  }
  function render() {
    apply();
    url();
    kitbar();
    main.dataset.screen = s.screen;
    const html = { list: listScreen, grid: gridScreen, reader: readerScreen, components: componentsScreen }[s.screen](s, d);
    main.innerHTML = html;
    const dlg = main.querySelector("dialog.sheet");
    if (dlg) {
      dlg.showModal();
      dlg.addEventListener("close", () => s.sheet && closeSheet(true));
    }
  }

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    const n = t.name;
    if (n === "kb-d") {
      const p = new URLSearchParams(location.search);
      p.set("d", t.value);
      location.search = p.toString();
      return;
    }
    if (n === "kb-screen") s.screen = t.value;
    else if (n === "kb-theme") s.theme = t.value;
    else if (n === "style") {
      s.style = t.value;
      s.font = dir.styleFont[t.value];
      s.accent = dir.accent;
    } else if (["theme", "accent", "font", "size", "width", "density", "images", "readf"].includes(n)) s[n] = t.value;
    else return;
    const reopen = document.querySelector("#look:popover-open") !== null;
    render();
    if (reopen) document.querySelector("#look")?.showPopover();
    document.querySelector(`[name="${n}"][value="${t.value}"]`)?.focus();
  });
  document.addEventListener("submit", (e) => e.preventDefault());
  document.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target.closest("[data-act]") : null;
    if (!el) return;
    const act = el.dataset.act;
    if (act === "paste") return;
    e.preventDefault();
    if (act === "open") {
      s.item = el.dataset.id;
      if (s.screen === "grid" && !root.dataset.bp?.includes("medium")) {
        openSheet(el);
        return;
      }
      if (s.screen === "grid" || root.dataset.bp?.includes("narrow")) s.screen = "reader";
    } else if (act === "close-sheet") {
      closeSheet();
      return;
    } else if (act === "expand") {
      s.sheet = null;
      s.screen = "reader";
    } else if (act === "back") s.screen = "list" === s.from ? "list" : "grid";
    else if (act === "screen") s.screen = el.dataset.screen;
    else if (act === "read") {
      const it = items.find((i) => i.id === el.dataset.id);
      it.read = !it.read;
    } else if (act === "step") {
      const i = items.findIndex((x) => x.id === s.item);
      s.item = items[(i + Number(el.dataset.step) + items.length) % items.length].id;
    } else if (act === "readf") s.readf = el.dataset.v;
    else if (act === "src") s.src = s.src === el.dataset.src ? null : el.dataset.src;
    else if (act === "reset") Object.assign(s, { style: "library", font: "library", accent: dir.accent, size: "medium", width: "medium", density: "compact", images: "on" });
    else return;
    if (s.screen !== "reader") s.from = s.screen;
    render();
  });
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  function morph(update) {
    if (!document.startViewTransition || still.matches) return update();
    return document.startViewTransition(update);
  }
  function openSheet(link) {
    const c = link.closest(".card");
    c?.classList.add("vt-src");
    s.sheet = s.item;
    morph(() => {
      c?.classList.remove("vt-src");
      render();
    });
  }
  function closeSheet(closed) {
    const id = s.sheet;
    s.sheet = null;
    const dlg = document.querySelector("dialog.sheet");
    dlg?.classList.add("vt-src");
    morph(() => {
      if (!closed) dlg?.close();
      render();
      document.querySelector(`.card[data-id="${id}"]`)?.classList.add("vt-src");
    }).finished?.then(() => document.querySelector(".vt-src")?.classList.remove("vt-src"));
  }

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => s.theme === "system" && render());
  new ResizeObserver(() => {
    const w = root.clientWidth;
    const bp = BANDS.filter(([, max]) => w < max).map(([n]) => n).join(" ");
    if (root.dataset.bp !== bp) root.dataset.bp = bp;
  }).observe(root);
  render();
}
