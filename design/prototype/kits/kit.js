import { items, topicHue, topics } from "./items.js";

const FONTS = [
  { id: "library", name: "Schibsted Grotesk" },
  { id: "broadsheet", name: "Schibsted + Source Serif" },
  { id: "workbench", name: "Commit Mono" },
  { id: "atkinson", name: "Atkinson Hyperlegible" },
];
const DEFAULT_ACCENT = "moss";

const STYLES = [
  { id: "library", name: "Library" },
  { id: "broadsheet", name: "Broadsheet" },
  { id: "workbench", name: "Workbench" },
];
const ACCENTS = [
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
  { id: "covers", name: "Covers" },
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

function pictureSVG(item) {
  const { kind, hue } = item.picture;
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
const SOURCES = Object.keys(SOURCE);
const OPEN_LABELS = { reddit: "Open on Reddit", x: "Open on X", github: "Open on GitHub", article: "Open article", other: "Open link" };
const STUB_TEXTS = {
  "not-saved": "The parent was not saved.",
  "not-kept": "Comment not kept, shown so the replies below make sense.",
  more: "Further replies were not saved.",
};
const DIGEST_PENDING = "Writing the summary and key points…";
const UNFILTERED_PENDING = "The comments below are not filtered by a Digest yet. One is being made now, and the filter follows when it is ready.";
const FILL_NOTE = "The post and comments aren’t saved yet. Open the post on Reddit in a browser with the Threadsift extension and its filling turned on to save them.";
const SOURCE_MARKS = {
  reddit: '<path d="M5 4v16"/><path d="M5 7h13"/><path d="M9 12h11"/><path d="M9 17h7"/>',
  x: '<path d="M4 5h16v11h-9l-4 4v-4H4z"/>',
  github: '<path d="M8 7l-5 5 5 5"/><path d="M16 7l5 5-5 5"/>',
  article: '<path d="M4 6h16M4 10h16M4 14h16M4 18h10"/>',
  other: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c3.5 3.5 3.5 12.5 0 16M12 4c-3.5 3.5-3.5 12.5 0 16"/>',
};
const sourceMark = (it) => `<svg class="ic smark" viewBox="0 0 24 24" aria-hidden="true">${SOURCE_MARKS[it.source]}</svg>`;

const drawnComments = (list) => list.reduce((n, c) => n + (c.a ? 1 : 0) + drawnComments(c.kids ?? []), 0);
const commentCount = (it) => `${it.digest ? "Kept" : "Showing"} ${drawnComments(it.comments)} of ${it.savedComments}`;

function stripParts(it) {
  const community = it.community && `r/${it.community}`;
  if (it.linkOnly) return ["Reddit", community];
  if (it.kind === "comment") return [community, "Saved comment"];
  if (it.source === "reddit") return [community, commentCount(it)];
  if (it.source === "x") return ["X", it.handle && `@${it.handle}`, commentCount(it)];
  if (it.source === "github") return ["GitHub", it.language];
  return [SOURCE[it.source], it.domain];
}
const stripText = (it, lead = "") =>
  `<span class="st">${stripParts(it)
    .filter(Boolean)
    .map((p, n) => `<span class="nw">${n === 0 ? lead : ""}${esc(p)}</span>`)
    .join(" · ")}</span>`;
const WORD_END = /[\p{L}\p{N}]$/u;
const WORD_START = /^[\p{L}\p{N}]/u;
function afterTitle(text = "", title) {
  if (!text.toLowerCase().startsWith(title.toLowerCase())) return text;
  const rest = text.slice(title.length);
  if (WORD_END.test(title) && WORD_START.test(rest)) return text;
  return rest.replace(/^[\s.,:;!?\-–—]+/u, "");
}
const linkLines = (it) => `<p class="tc-host">${esc(it.host)}</p><p class="tc-path">${esc(it.path)}</p>`;
function coverBody(it) {
  if (it.linkOnly) return linkLines(it);
  const own = afterTitle(it.excerpt, it.title);
  if (it.source === "github") {
    const lead = afterTitle(it.description, it.title);
    if (lead || own) return `${lead ? `<p class="tc-lead">${esc(lead)}</p>` : ""}${own ? `<p class="tc-more">${esc(own)}</p>` : ""}`;
  } else if (own) return `<p>${esc(own)}</p>`;
  const kept = it.firstKept && afterTitle(it.firstKept.text, it.title);
  if (kept) return `<p class="tc-who">${esc(`u/${it.firstKept.author}`)}</p><p>${esc(kept)}</p>`;
  return linkLines(it);
}
const tint = (it) => `style="--topic-h:${topicHue[it.topic]}"`;
function textCover(it) {
  return `<div class="cover tcover" aria-hidden="true" ${tint(it)}><div class="tc-in"><div class="tc-body"><div class="tc-text">${sourceMark(it)}${coverBody(it)}</div></div></div></div>`;
}
const pictureBox = (it, cls = "") => `<div class="cover ${cls}">${pictureSVG(it)}</div>`;
const media = (it) => (it.picture ? pictureBox(it) : textCover(it));
const thumb = (it) => (it.picture ? pictureBox(it, "thumb") : `<div class="cover thumb ltile" ${tint(it)}>${sourceMark(it)}</div>`);
const keptShare = (it) => (it.digest && it.savedComments ? (drawnComments(it.comments) / it.savedComments).toFixed(3) : 0);

const markLabel = (it) => `${it.read ? "Mark as unread" : "Mark as read"} ${it.title}`;
const readLabel = (it) => (it.read ? "Mark unread" : "Mark read");
function markBtn(it) {
  return `<button class="mark" type="button" data-read="${it.read}" aria-label="${esc(markLabel(it))}" data-act="read" data-id="${it.id}"></button>`;
}
function strip(it) {
  return `<div class="share" style="--kept:${keptShare(it)}"></div><div class="strip">${markBtn(it)}${stripText(it)}</div>`;
}
const SEP = '<span class="sep" aria-hidden="true">·</span><wbr>';
function byline(it, last = it.topic) {
  const who = it.author ? (it.source === "reddit" ? `u/${it.author}` : it.source === "github" ? it.repo : it.author) : null;
  return [who, `Saved ${it.saved}`, last].filter(Boolean).map((p) => `<span class="nw">${esc(p)}</span>`).join(SEP);
}
function cardFact(it) {
  if (it.source === "github") return it.stars ? `${it.stars} stars` : null;
  if (it.source === "article" || it.source === "other") return it.readingTime ? `${it.readingTime} read` : null;
  return null;
}
const readerMeta = (it) => `<p class="meta rd-meta">${stripText(it, markBtn(it))}${SEP}${byline(it)}</p>`;
const titleLink = (it, sample) => (sample ? esc(it.title) : `<a href="#${it.id}" data-act="open" data-id="${it.id}">${esc(it.title)}</a>`);
const tagList = (it) => (it.tags.length ? `<div class="tags">${it.tags.map((t) => `<span class="tag" data-tag="${t.hue}">${esc(t.name)}</span>`).join("")}</div>` : "");

function row(it, { open = false, sample = false, level = sample ? 3 : 2 } = {}) {
  return `<article class="row ${it.read ? "" : "unread"}" data-id="${it.id}" ${open ? 'aria-current="true"' : ""}>
    ${strip(it)}
    <div class="row-main"><div class="row-text">
      <h${level} class="title">${titleLink(it, sample)}</h${level}>
      <p class="meta">${byline(it)}</p>${tagList(it)}
    </div>${thumb(it)}</div>
  </article>`;
}

function card(it, { sample = false, level = sample ? 3 : 2 } = {}) {
  const h = `h${level}`;
  const excerpt = it.summary ?? (it.linkOnly ? "Link-only Item. No content was fetched." : DIGEST_PENDING);
  return `<article class="card ${it.read ? "" : "unread"}" data-id="${it.id}">${strip(it)}${media(it)}<div class="card-body"><${h} class="title">${titleLink(it, sample)}</${h}><p class="meta">${byline(it, cardFact(it))}</p><p class="excerpt">${esc(excerpt)}</p>${tagList(it)}</div></article>`;
}

function commentNodes(list, depth) {
  return `<ol class="cm-list ${depth > 4 ? "capped" : ""}">${list
    .map((c) => {
      if (c.stub === "more") return `<li class="stub">${icon("fold")}${STUB_TEXTS.more}</li>`;
      if (c.stub === "parent") return `<li><div class="stub">${icon("up")}${STUB_TEXTS["not-kept"]}</div>${c.kids?.length ? commentNodes(c.kids, depth + 1) : ""}</li>`;
      return `<li class="cm"><div class="cm-head"><b>${esc(c.a.startsWith("@") ? c.a : `u/${c.a}`)}</b><span>${esc(c.age)}</span></div><p class="cm-text">${esc(c.text)}</p>${c.kids?.length ? commentNodes(c.kids, depth + 1) : ""}</li>`;
    })
    .join("")}</ol>`;
}

function summaryBox(it) {
  if (!it.summary) {
    return `<div class="pending" role="status"><span class="label">Summary</span><span>${DIGEST_PENDING}</span><div class="line"></div></div>`;
  }
  return `<section class="summary" aria-label="Summary"><h3 class="label">Summary</h3><p>${esc(it.summary)}</p>${
    it.keyPoints.length ? `<h4 class="label">Key points</h4><ul>${it.keyPoints.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>` : ""
  }</section>`;
}

function readerHead(it, level = 2, titleId = "") {
  const desc = it.source === "github" && it.description ? `<p class="rd-desc">${esc(it.description)}</p>` : "";
  return `<header class="rd-head ${it.read ? "" : "unread"}" data-id="${it.id}"><div class="share" style="--kept:${keptShare(it)}"></div><h${level} class="rd-title"${titleId ? ` id="${titleId}"` : ""}>${esc(it.title)}</h${level}>${readerMeta(it)}${desc}${tagList(it)}${it.picture ? pictureBox(it, "rd-cover") : ""}</header>`;
}

const SECTION_TITLES = { reddit: "Original post", x: "Original post", github: "README", article: "Article", other: "Original post" };

function readerBody(it, titleId = "") {
  if (it.linkOnly) {
    return `${readerHead(it, 2, titleId)}<section class="linkonly"><span class="label">Link-only Item</span><p class="addr"><span class="addr-host">${esc(it.host)}</span>${esc(it.path)}</p><p>${FILL_NOTE}</p><div class="rd-actions"><a class="btn" href="#" data-act="none">${icon("out")}${OPEN_LABELS[it.source]}</a><button class="btn quiet" type="button">Try again</button></div></section>`;
  }
  const linked = it.linkTo ? `<p><a class="post-link" href="#" data-act="none">${icon("out")}${esc(it.linkTo)}</a></p>` : "";
  const post = linked + it.post.map((p) => `<p>${esc(p)}</p>`).join("") + (it.thread ? it.thread.map((p) => `<p class="thread-part">${esc(p)}</p>`).join("") : "");
  const facts = it.source === "github" ? `<dl class="facts"><div><dt class="label">Stars</dt><dd>${it.stars}</dd></div><div><dt class="label">Language</dt><dd>${it.language}</dd></div><div><dt class="label">Last push</dt><dd>${it.updated}</dd></div></dl>` : "";
  const parentStub = it.parentStub ? `<div class="stub">${icon("up")}${STUB_TEXTS["not-saved"]}</div>` : "";
  const shown = drawnComments(it.comments);
  const comments = it.comments.length
    ? `<section class="cm-tree"><h3 class="h2">Comments <span class="meta">${it.digest ? "Kept" : "Showing"} ${shown} of ${it.savedComments} comments</span></h3>${
        it.digest ? "" : `<p class="note-first">${UNFILTERED_PENDING}</p>`
      }${commentNodes(it.comments, 1)}</section>`
    : "";
  return `${readerHead(it, 2, titleId)}${summaryBox(it)}${facts}<section class="post"><h3 class="h2">${SECTION_TITLES[it.source]}</h3>${parentStub}${post}</section>${comments}`;
}

function readerBar(it, mode, seq, from) {
  const i = seq.indexOf(it);
  const back =
    mode === "pane"
      ? ""
      : mode === "sheet"
        ? `<button class="btn quiet" type="button" data-act="close-sheet">${icon("close")}<span class="lbl">Close</span></button>`
        : `<button class="btn quiet" type="button" data-act="back">${icon("back")}<span class="lbl">${from === "grid" ? "Back to grid" : "Back to list"}</span></button>`;
  const expand = mode === "sheet" ? `<button class="btn quiet icon" type="button" aria-label="Open as a full page" data-act="expand">${icon("expand")}</button>` : "";
  return `<div class="rd-bar">${back}<span class="pos">${i + 1} of ${seq.length}</span>
    <button class="btn quiet icon" type="button" aria-label="Previous item" data-act="step" data-step="-1">${icon("prev")}</button>
    <button class="btn quiet icon" type="button" aria-label="Next item" data-act="step" data-step="1">${icon("next")}</button>
    <span class="grow"></span>
    <button class="btn" type="button" data-act="read" data-id="${it.id}">${icon("check")}<span class="lbl">${readLabel(it)}</span></button>
    <a class="btn quiet icon" href="#" aria-label="${OPEN_LABELS[it.source]}" data-act="none">${icon("out")}</a>
    ${expand}${mode === "sheet" ? "" : aaBtn()}
  </div>`;
}
const aaBtn = () => `<button class="btn quiet" type="button" popovertarget="look" aria-label="Look settings">Aa</button>`;
const wordmark = () => `<h1 class="wm-h"><a class="wordmark" href="#" data-act="none">Thread<span class="wm-sift">sift</span></a></h1>`;

function seg(name, opts, current, extra = "") {
  return `<div class="seg" role="radiogroup" aria-label="${esc(extra || name)}">${opts
    .map((o) => `<label><input type="radio" name="${name}" value="${o.id}" ${o.id === current ? "checked" : ""}>${esc(o.name)}</label>`)
    .join("")}</div>`;
}

function panel(s, popover = true) {
  const tileArt = (st) => `<span class="tile-art" data-style="${st}" data-theme="${s.theme === "system" ? sysTheme() : s.theme}" data-accent="${DEFAULT_ACCENT}" data-font="${st}"><span class="t-card"><span class="t-strip"></span><span class="t-line"></span><span class="t-line"></span></span><span class="t-btn"></span></span>`;
  return `<div class="panel" ${popover ? 'popover id="look"' : ""} data-font="library" aria-label="Look settings">
    <div class="panel-head"><h2>Look</h2>${popover ? `<button class="btn quiet icon" type="button" popovertarget="look" popovertargetaction="hide" aria-label="Close">${icon("close")}</button>` : ""}</div>
    <div class="p-row"><span class="label" id="lbl-style">Style</span><div class="tiles" role="radiogroup" aria-labelledby="lbl-style">${STYLES.map(
      (st) => `<label class="tile"><input type="radio" name="style" value="${st.id}" ${s.style === st.id ? "checked" : ""}>${tileArt(st.id)}<span class="tile-name">${st.name}</span></label>`,
    ).join("")}</div></div>
    <div class="p-row"><span class="label">Theme</span>${seg("theme", [...THEMES, { id: "system", name: "System" }], s.theme, "Theme")}</div>
    <div class="p-row"><span class="label" id="lbl-acc">Accent</span><div class="swatches" role="radiogroup" aria-labelledby="lbl-acc">${ACCENTS.map((a) => `<label class="swatch" data-accent="${a.id}" title="${a.name}"><input type="radio" name="accent" value="${a.id}" aria-label="${a.name}" ${s.accent === a.id ? "checked" : ""}><span></span></label>`)
      .join("")}</div></div>
    <div class="p-row"><span class="label" id="lbl-font">Font</span><div class="tiles fonts" role="radiogroup" aria-labelledby="lbl-font">${FONTS.map((f) => `<label class="tile"><input type="radio" name="font" value="${f.id}" ${s.font === f.id ? "checked" : ""}><span class="tile-art font-art" data-font="${f.id}"><span class="ag">Ag</span><span class="rd">Reading text</span></span><span class="tile-name">${esc(f.name)}</span></label>`)
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
  return `<nav class="rail" aria-label="Filters">
    <div class="rail-group keep"><span class="label">Read state</span>${seg("readf", [{ id: "all", name: "All" }, ...READ_CHOICES], s.readf, "Read state")}</div>
    <div class="rail-group keep src"><span class="label">Source</span>${SOURCES.map(
      (k) => `<a class="rail-row" href="#" data-act="src" data-src="${k}" ${s.src === k ? 'aria-current="true"' : ""}><span>${SOURCE[k]}</span><span class="n">${counts((i) => i.source === k)}</span></a>`,
    ).join("")}</div>
    <div class="rail-group"><span class="label">Topic</span>${topics
      .map((t) => `<a class="rail-row" href="#" data-act="none"><span>${esc(t)}</span><span class="n">${counts((i) => i.topic === t)}</span></a>`)
      .join("")}</div>
  </nav>`;
}
const READ_CHOICES = [
  { id: "unread", name: "Unread" },
  { id: "read", name: "Read" },
];

function visible(s) {
  return items.filter((i) => (s.readf === "all" || (s.readf === "read") === i.read) && (!s.src || i.source === s.src));
}
const shownItem = (s) => {
  const vis = visible(s);
  return vis.find((i) => i.id === s.item) ?? vis[0];
};
const isFiltered = (s) => s.readf !== "all" || s.src !== null;
const countText = (s) =>
  isFiltered(s) ? `${visible(s).length} of ${items.length} items` : `${items.length} items, ${items.filter((i) => !i.read).length} unread`;
const noResults = () => `<div class="empty" role="status"><p>No items match</p><button class="btn" type="button" data-act="clear">Clear search and filters</button></div>`;

let uidN = 0;
function pasteBox() {
  const id = `paste-${++uidN}`;
  return `<form class="paste" data-act="paste"><label class="vh" for="${id}">Link to add</label><input class="field" id="${id}" type="url" placeholder="Paste a link" required><button class="btn primary" type="submit">Add</button></form>`;
}
const searchBox = () => `<label class="search"><span class="vh">Search items</span>${icon("search")}<input class="field" type="search" placeholder="Title, post text, summary or tags"></label>`;

function listScreen(s) {
  const vis = visible(s);
  const open = shownItem(s);
  const reader = open ? `<div class="rd">${readerBar(open, "pane", vis)}<div class="rd-col">${readerBody(open)}</div></div>` : `<p class="rd-empty">Select an item</p>`;
  return `<div class="l-screen">
    <aside class="side"><div class="side-top">${wordmark()}<div class="g-tools"><button class="btn quiet icon" type="button" aria-label="Grid layout" data-act="screen" data-screen="grid">${icon("grid")}</button>${aaBtn()}</div></div>${pasteBox()}${filterRail(s)}</aside>
    <section class="list-pane" aria-label="Items"><div class="list-head">${searchBox()}<span class="count">${countText(s)}</span></div>
      <div class="rows">${vis.length ? vis.map((i) => row(i, { open: i === open })).join("") : noResults()}</div></section>
    <section class="rd-pane" aria-label="Reader">${reader}</section>
  </div>${panel(s)}`;
}

function gridScreen(s) {
  const vis = visible(s);
  return `<div class="g-screen">
    <header class="g-head">${wordmark()}${searchBox()}${pasteBox()}<div class="g-tools"><button class="btn quiet icon" type="button" aria-label="List layout" data-act="screen" data-screen="list">${icon("list")}</button>${aaBtn()}</div></header>
    <div class="g-scroll"><div class="g-filters" role="toolbar" aria-label="Filters">
      ${[{ id: "all", name: "All" }, ...READ_CHOICES].map((k) => `<button class="chip" type="button" aria-pressed="${s.readf === k.id}" data-act="readf" data-v="${k.id}">${k.name}</button>`).join("")}
      <span class="sep" aria-hidden="true"></span>
      ${SOURCES.map((k) => `<button class="chip" type="button" aria-pressed="${s.src === k}" data-act="src" data-src="${k}">${SOURCE[k]}<span class="n">${items.filter((i) => i.source === k).length}</span></button>`).join("")}
    </div>
    ${vis.length ? `<div class="grid">${vis.map((i) => card(i)).join("")}</div>` : noResults()}</div>
  </div>${sheet(s)}${panel(s)}`;
}

function sheet(s) {
  const it = shownItem(s);
  if (!s.sheetOpen || !it) return "";
  return `<dialog class="sheet" aria-labelledby="sheet-title"><div class="rd">${readerBar(it, "sheet", visible(s))}<div class="rd-col">${readerBody(it, "sheet-title")}</div></div></dialog>`;
}

function readerScreen(s) {
  const it = shownItem(s) ?? items.find((i) => i.id === s.item);
  const vis = visible(s);
  return `<div class="rd-pane" style="height:100%"><h1 class="vh">Threadsift</h1><div class="rd">${readerBar(it, "page", vis.includes(it) ? vis : items, s.from)}<div class="rd-col">${readerBody(it)}</div></div></div>${panel(s)}`;
}

function componentsScreen(s) {
  const sample = items.filter((i) => ["mini-pc", "sqlite-wal", "kerning-comment", "stabilizers", "tidepool", "boring-formats", "local-first"].includes(i.id));
  const mini = items.find((i) => i.id === "mini-pc");
  return `<div class="c-screen"><div class="c-page">
    <div class="c-intro"><h1>Quarto</h1><p>A technical monograph: one grotesque family, a ruled matrix of hairlines, and a green ink. The Style tiles of the Look panel change only the custom properties of these parts, never their markup.</p></div>
    <section class="c-sec"><h2 class="h2">Buttons</h2><div class="c-cols">
      <div class="c-demo"><span class="label">Default, primary, quiet</span><div class="c-line"><button class="btn" type="button">Mark read</button><button class="btn primary" type="button">Add</button><button class="btn quiet" type="button">Reset look</button></div></div>
      <div class="c-demo"><span class="label">Disabled</span><div class="c-line"><button class="btn" type="button" disabled>Mark read</button><button class="btn primary" type="button" disabled>Add</button></div></div>
      <div class="c-demo"><span class="label">Focus</span><div class="c-line"><button class="btn is-focus" type="button">Mark read</button><button class="btn primary is-focus" type="button">Add</button><button class="btn quiet icon is-focus" type="button" aria-label="Next item">${icon("next")}</button></div></div>
    </div></section>
    <section class="c-sec"><h2 class="h2">Fields</h2><div class="c-cols">
      <div class="c-demo"><span class="label">Paste box</span>${pasteBox()}</div>
      <div class="c-demo"><span class="label">Search, focused</span><label class="search"><span class="vh">Search items</span>${icon("search")}<input class="field is-focus" type="search" value="sqlite"></label></div>
      <div class="c-demo fld"><label class="label" for="c-name">Instance name</label><span class="fld-hint">Shown in the masthead of the sign-in screen.</span><input class="field is-invalid" id="c-name" value="" placeholder="Library" aria-describedby="c-err"><span class="fld-err" id="c-err">This field is required.</span></div>
    </div></section>
    <section class="c-sec"><h2 class="h2">Chips, segments and Tags</h2><div class="c-cols">
      <div class="c-demo"><span class="label">Filter chips</span><div class="c-line"><button class="chip" type="button" aria-pressed="true">All</button><button class="chip" type="button" aria-pressed="false">Unread</button><button class="chip" type="button" aria-pressed="false">Reddit<span class="n">5</span></button></div></div>
      <div class="c-demo"><span class="label">Segmented control</span>${seg("c-seg", [{ id: "all", name: "All" }, { id: "unread", name: "Unread" }, { id: "read", name: "Read" }], "unread", "Read state sample")}</div>
      <div class="c-demo"><span class="label">Tags</span><div class="tags">${["power draw", "sqlite", "file formats", "sync", "transcoding", "a much longer tag name"].map((t, i) => `<span class="tag" data-tag="${(i * 3) % 8}"><span class="nm">${t}</span></span>`).join("")}</div></div>
    </div></section>
    <section class="c-sec"><h2 class="h2">Kept strip and unread mark</h2><div class="c-cols">
      <div class="c-demo"><span class="label">List row and Grid card: the first line</span><div class="c-strips">${sample.map((i) => `<div>${strip(i)}</div>`).join("")}</div></div>
      <div class="c-demo"><span class="label">Reader: the line under the title</span><div class="c-strips">${sample.map((i) => `<div class="c-meta">${readerMeta(i)}</div>`).join("")}</div></div>
    </div></section>
    <section class="c-sec"><h2 class="h2">List rows</h2><div class="c-cols"><div class="c-rows">${["mini-pc", "rack", "sqlite-wal", "stabilizers"].map((id, n) => row(items.find((i) => i.id === id), { open: n === 1, level: 3 })).join("")}</div></div></section>
    <section class="c-sec"><h2 class="h2">Grid cards</h2><div class="grid c-grid">${["local-first", "sqlite-wal", "tidepool"].map((id) => card(items.find((i) => i.id === id), { level: 3 })).join("")}</div></section>
    <section class="c-sec"><h2 class="h2">Reader header and summary box</h2><div class="c-cols"><div class="c-reader">${readerHead(mini, 3)}${summaryBox(mini)}</div><div class="c-reader">${readerHead(items.find((i) => i.id === "sqlite-wal"), 3)}${summaryBox(items.find((i) => i.id === "sqlite-wal"))}</div></div></section>
    <section class="c-sec"><h2 class="h2">Comment tree with Context stubs</h2><div class="c-reader">${commentNodes(mini.comments, 1)}</div></section>
    <section class="c-sec"><h2 class="h2">Settings panel</h2><div class="c-panel">${panel(s, false)}</div></section>
  </div></div>`;
}

const COVER_KINDS = [
  { id: "mini-pc", name: "Reddit post", shows: "The post's first lines, or the first Kept comment when the post has no text. The kept strip above names the community and counts the comments." },
  { id: "x-short", name: "X post", shows: "The post text that the title does not already hold. The kept strip above names the handle and counts the replies." },
  { id: "tidepool", name: "GitHub repository", shows: "The description, then the first README lines. The kept strip above names the language, and the line under the title holds owner/name and the stars." },
  { id: "long-threads", name: "Article with no picture", shows: "The first paragraph. The kept strip above names the domain, and the line under the title holds the reading time." },
  { id: "stabilizers", name: "Link-only Item", shows: "The host in the mono face and the path under it. The kept strip above names the community." },
];

function coversScreen() {
  return `<div class="c-screen"><div class="c-page cv-page">
    <div class="c-intro"><h1>Covers</h1><p>An Item with no stored picture gets a cover drawn from its own fields: its first lines in the reading face, a mark for its Source and a quiet tint from its Topic, in the same 16:10 box as a picture. A cover never repeats the title and never shows votes or likes. It draws no strip of its own, because the kept strip directly above it already names the community or the Source, the handle, the language or the domain, and counts a thread's comments. A repository's stars and an Article's reading time go on the line under the title.</p></div>
    <div class="cv-kinds">${COVER_KINDS.map(({ id, name, shows }) => {
      const it = items.find((i) => i.id === id);
      return `<section class="cv-kind" aria-labelledby="cv-${id}"><div class="cv-head"><h2 class="h2" id="cv-${id}">${name}</h2><p class="cv-shows">${esc(shows)}</p></div>
        <div class="c-demo"><span class="label">Grid card</span><div class="grid cv-grid">${card(it, { sample: true })}</div></div>
        <div class="c-demo"><span class="label">List row, 40 px tile</span><div class="c-rows">${row(it, { sample: true })}</div></div>
      </section>`;
    }).join("")}</div>
  </div></div>`;
}

const sysTheme = () => (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export function boot() {
  const q = new URLSearchParams(location.search);
  const s = {
    screen: SCREENS.some((x) => x.id === q.get("screen")) ? q.get("screen") : "list",
    theme: [...THEMES.map((t) => t.id), "system"].includes(q.get("theme")) ? q.get("theme") : "light",
    item: items.some((i) => i.id === q.get("item")) ? q.get("item") : "mini-pc",
    sheetOpen: false,
    style: "library",
    font: "library",
    accent: DEFAULT_ACCENT,
    size: "medium",
    width: "medium",
    density: "compact",
    images: "on",
    readf: "all",
    src: null,
  };
  s.from = s.screen === "grid" ? "grid" : "list";
  const root = document.documentElement;
  const main = document.querySelector("#screen");
  const bar = document.querySelector(".kitbar");
  const LOOK = ["style", "font", "accent", "size", "width", "density", "images"];

  function apply() {
    root.dataset.theme = s.theme === "system" ? sysTheme() : s.theme;
    for (const k of LOOK) root.dataset[k] = s[k];
  }
  function url() {
    const p = new URLSearchParams({ screen: s.screen, theme: s.theme });
    if (s.screen === "reader" || s.screen === "list") p.set("item", s.item);
    history.replaceState(null, "", `?${p}`);
  }
  function check(name, value) {
    for (const input of document.querySelectorAll(`input[name="${name}"]`)) input.checked = input.value === value;
  }
  function sync() {
    for (const k of [...LOOK, "theme"]) check(k, s[k]);
    for (const art of document.querySelectorAll(".tile-art[data-style]")) art.dataset.theme = root.dataset.theme;
    check("kb-screen", s.screen);
    check("kb-theme", root.dataset.theme);
  }
  function kitbar() {
    bar.innerHTML = `<b>Quarto brand kit</b>
      <span class="kb-group"><span class="kb-name">Screen</span>${seg("kb-screen", SCREENS, s.screen, "Screen")}</span>
      <span class="kb-group"><span class="kb-name">Theme</span>${seg("kb-theme", THEMES, root.dataset.theme, "Theme")}</span>`;
  }
  const KEEP_SCROLL = [".side", ".rows", ".g-scroll"];
  function render() {
    apply();
    url();
    const sameScreen = main.dataset.screen === s.screen;
    const keep = sameScreen ? [...KEEP_SCROLL, ...(main.dataset.item === s.item ? [".rd-pane"] : [])] : [];
    const tops = keep.map((sel) => [sel, main.querySelector(sel)?.scrollTop ?? 0]);
    main.dataset.screen = s.screen;
    main.dataset.item = s.item;
    main.innerHTML = { list: listScreen, grid: gridScreen, reader: readerScreen, components: componentsScreen, covers: coversScreen }[s.screen](s);
    for (const [sel, top] of tops) {
      const el = main.querySelector(sel);
      if (el) el.scrollTop = top;
    }
    sync();
    const dlg = main.querySelector("dialog.sheet");
    if (dlg) {
      dlg.showModal();
      dlg.addEventListener("close", () => s.sheetOpen && closeSheet(true));
    }
  }
  function look() {
    apply();
    url();
    sync();
  }
  function go(screen) {
    if (screen === "reader" && s.screen !== "reader") s.from = s.screen;
    s.screen = screen;
  }
  function filtered() {
    s.item = shownItem(s)?.id ?? s.item;
  }
  function toggleRead(id) {
    const it = items.find((i) => i.id === id);
    it.read = !it.read;
    for (const el of document.querySelectorAll(`[data-act="read"][data-id="${id}"]`)) {
      if (el.classList.contains("mark")) {
        el.dataset.read = String(it.read);
        el.setAttribute("aria-label", markLabel(it));
      } else el.querySelector(".lbl").textContent = readLabel(it);
    }
    for (const el of document.querySelectorAll(`:is(.row, .card, .rd-head)[data-id="${id}"]`)) el.classList.toggle("unread", !it.read);
    for (const el of document.querySelectorAll(".list-head .count")) el.textContent = countText(s);
  }
  function focusKey(el) {
    const sel = ["act", "id", "step", "v", "src"].map((k) => (el.dataset[k] === undefined ? "" : `[data-${k}="${el.dataset[k]}"]`)).join("");
    return { sel, n: [...document.querySelectorAll(sel)].indexOf(el) };
  }
  function refocus({ sel, n }) {
    document.querySelectorAll(sel)[n]?.focus();
  }

  document.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    const n = t.name;
    if (n === "kb-screen") {
      go(t.value);
      render();
    } else if (n === "readf") {
      s.readf = t.value;
      filtered();
      render();
      document.querySelector(`[name="readf"][value="${t.value}"]`)?.focus();
    } else if (n === "kb-theme" || n === "theme") {
      s.theme = t.value;
      look();
    } else if (n === "style") {
      s.style = t.value;
      s.font = t.value;
      s.accent = DEFAULT_ACCENT;
      look();
    } else if (LOOK.includes(n)) {
      s[n] = t.value;
      look();
    }
  });
  document.addEventListener("submit", (e) => e.preventDefault());
  document.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target.closest("[data-act]") : null;
    if (!el) return;
    const act = el.dataset.act;
    if (act === "paste") return;
    e.preventDefault();
    const key = focusKey(el);
    if (act === "open") {
      s.item = el.dataset.id;
      const narrow = root.dataset.bp?.includes("narrow");
      if (s.screen === "grid" && !root.dataset.bp?.includes("medium")) s.sheetOpen = true;
      else if (s.screen === "grid" || narrow) go("reader");
      grow(el.closest(".row, .card"), s.screen === "list" ? key : null);
      return;
    } else if (act === "close-sheet") {
      closeSheet();
      return;
    } else if (act === "reset") {
      Object.assign(s, { style: "library", font: "library", accent: DEFAULT_ACCENT, size: "medium", width: "medium", density: "compact", images: "on" });
      look();
      return;
    } else if (act === "read") {
      toggleRead(el.dataset.id);
      if (s.readf === "all" || s.screen === "reader") return;
      const marks = [...main.querySelectorAll('.mark[data-act="read"]')];
      const at = marks.indexOf(el);
      if (!visible(s).some((i) => i.id === s.item)) s.sheetOpen = false;
      filtered();
      render();
      const left = main.querySelectorAll(at === -1 ? 'button[data-act="read"]:not(.mark)' : '.mark[data-act="read"]');
      (left[Math.min(Math.max(at, 0), left.length - 1)] ?? main.querySelector('[data-act="clear"]'))?.focus();
      return;
    } else if (act === "expand") {
      s.sheetOpen = false;
      go("reader");
    } else if (act === "back") s.screen = s.from;
    else if (act === "screen") go(el.dataset.screen);
    else if (act === "step") {
      const vis = visible(s);
      const pool = vis.length ? vis : items;
      const from = items.findIndex((x) => x.id === s.item);
      const n = items.length;
      const ahead = Array.from({ length: n }, (_, k) => items[(((from + Number(el.dataset.step) * (k + 1)) % n) + n) % n]);
      s.item = (ahead.find((i) => pool.includes(i)) ?? items[from]).id;
    } else if (act === "readf") {
      s.readf = el.dataset.v;
      filtered();
    } else if (act === "src") {
      s.src = s.src === el.dataset.src ? null : el.dataset.src;
      filtered();
    } else if (act === "clear") {
      s.readf = "all";
      s.src = null;
      filtered();
    } else return;
    render();
    if (["step", "readf", "src"].includes(act)) refocus(key);
    else if (act === "clear") main.querySelector(".title a")?.focus();
  });
  document.addEventListener(
    "scroll",
    (e) => {
      const el = e.target;
      if (!(el instanceof Element) || !el.matches(".rd-pane, .sheet")) return;
      const max = el.scrollHeight - el.clientHeight;
      el.querySelector(".rd-bar")?.style.setProperty("--read", max > 0 ? (el.scrollTop / max).toFixed(3) : "0");
    },
    { capture: true, passive: true },
  );
  const still = matchMedia("(prefers-reduced-motion: reduce)");
  function morph(update) {
    if (!document.startViewTransition || still.matches) {
      update();
      return Promise.resolve();
    }
    return document.startViewTransition(update).finished;
  }
  function grow(from, key) {
    from?.classList.add("vt-src");
    morph(() => {
      from?.classList.remove("vt-src");
      render();
      main.querySelector(".rd-head")?.classList.add("vt-dst");
      if (key) refocus(key);
      else if (s.screen === "reader") main.querySelector('[data-act="back"]')?.focus();
    }).then(() => main.querySelector(".vt-dst")?.classList.remove("vt-dst"));
  }
  function closeSheet(closed) {
    s.sheetOpen = false;
    const id = s.item;
    const dlg = document.querySelector("dialog.sheet");
    dlg?.classList.add("vt-src");
    morph(() => {
      if (!closed) dlg?.close();
      render();
      document.querySelector(`.card[data-id="${id}"]`)?.classList.add("vt-src");
    }).then(() => {
      document.querySelector(".vt-src")?.classList.remove("vt-src");
      document.querySelector(`.card[data-id="${id}"] .title a`)?.focus();
    });
  }

  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => s.theme === "system" && look());
  new ResizeObserver(() => {
    const w = root.clientWidth;
    const bp = BANDS.filter(([, max]) => w < max).map(([n]) => n).join(" ");
    if (root.dataset.bp === bp) return;
    root.dataset.bp = bp;
    if (s.sheetOpen && bp.includes("medium")) {
      s.sheetOpen = false;
      go("reader");
      render();
    }
  }).observe(root);
  apply();
  kitbar();
  render();
}
