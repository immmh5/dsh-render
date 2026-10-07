window.__ModuleLoader__.load({ id: "dsh-rtl", factory: (require) => {
"use strict";
var module = { exports: {} }; var exports = module.exports;
let react = require("react");
let jsx_runtime = require("react/jsx-runtime");
let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let store_lib = require("@deepseek-ai/dsh-client-store");

const inject = ["locale", "slots", "settingsScope"];
const SETTINGS_NS = "settings.direction";
const HOST_NAMESPACE = "direction";
const PREFERENCE_FIELD = "preference";
const STORAGE_KEY = "dsh-rtl.direction";
const ROW_ID = "direction";
const ROW_ORDER = 1;
const SECTION_ID = "direction-auto";
const SECTION_ORDER = 93;
const ZONE_SELECTOR = "pre, code, [data-files-path]";

// AUTO mode: the shell stays RTL, individual text blocks flip on their own.
const AUTO_SCOPE = "[data-conversation-scroll]";
const AUTO_SCOPE_FALLBACK = "[data-chat-turn]";
const AUTO_SELECTOR = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,summary,div,span";
const AUTO_BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,summary";
const COMPOSER_SELECTOR = "[data-composer-input]";
const SIDEBAR_SELECTOR = "[data-side=\"sidebar\"] [role=\"treeitem\"]";
const AUTO_DEBOUNCE = 200;
const MIN_LETTERS = 8;
const AUTO_MARKER = "data-dsh-auto-dir";
const AUTO_LEN = "data-dsh-auto-len";
const MODE_IDS = ["rtl", "auto", "ltr"];
const COMPOSER_MODE_IDS = ["auto", "rtl", "ltr"];
const FIELD_BOUNDS = { threshold: [40, 95], minLetters: [1, 64], maxLetters: [0, 20000], debounce: [0, 2000] };
const FIELD_ENUMS = { composerMode: COMPOSER_MODE_IDS };
/** Every knob the section exposes, with its default; the host schema mirrors this list. */
const PREF_DEFAULTS = {
	autoContent: true,
	autoComposer: true,
	autoSidebar: false,
	composerMode: "auto",
	threshold: 60,
	minLetters: MIN_LETTERS,
	maxLetters: 0,
	flipMixed: true,
	countDigits: false,
	debounce: AUTO_DEBOUNCE,
	observe: true,
	reactToInput: true,
	debug: false,
	islandEnabled: true,
	scopeSelector: AUTO_SCOPE,
	composerSelector: COMPOSER_SELECTOR,
	scanSelector: AUTO_SELECTOR,
	blockSelector: AUTO_BLOCKS,
	islandSelector: ZONE_SELECTOR,
	sidebarSelector: SIDEBAR_SELECTOR,
	forceLtrSelector: "",
	forceRtlSelector: "",
	ignoreSelector: ""
};
const PREF_FIELDS = Object.keys(PREF_DEFAULTS);
const THRESHOLD_MIN = 40;
const THRESHOLD_MAX = 95;

/** Inline children never reorder under `dir`, so a block may hold them. */
const INLINE_TAGS = { A:1, ABBR:1, B:1, BR:1, CODE:1, DEL:1, EM:1, I:1, IMG:1, INS:1, KBD:1, MARK:1, S:1, SAMP:1, SMALL:1, SPAN:1, STRONG:1, SUB:1, SUP:1, TIME:1, U:1, VAR:1 };
/** Leaf containers stay flippable even when they are not in the block list. */
const LEAF_TAGS = { DIV:1, SPAN:1 };

const DICT = /*__DICT__*/;

const ROW_CSS = "/*__ROW_CSS__*/";
const ROW_TAG = "dsh-rtl/DirectionRow.css";
const DRIVER_CSS = "/*__DRIVER_CSS__*/";
const DRIVER_TAG = "dsh-rtl/driver.css";
const RTL_CSS = "/*__RTL_CSS__*/";
const RTL_TAG = "dsh-rtl/rtl.css";

// Arabic letters (both scripts' ranges) versus any other letter.
const ARABIC_RX = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LAT_DIGIT_RX = /[0-9]/;
const AR_DIGIT_RX = /[٠-٩۰-۹]/;
let LETTER_RX = null;
try { LETTER_RX = new RegExp("\\p{L}", "u"); } catch (e) { LETTER_RX = /[A-Za-z\u00C0-\u024F\u0370-\u04FF\u0500-\u052F\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u0E00-\u0E7F\u1000-\u109F\u1E00-\u1EFF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/; }

function injectStyle(tagId, css, plugin) {
	if (typeof document === "undefined") return;
	if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;
	const tag = document.createElement("style");
	tag.dataset.plugin = plugin;
	tag.dataset.pluginCss = tagId;
	tag.textContent = css;
	document.head.appendChild(tag);
}

/** Mark every leaf region that must stay left-to-right inside an RTL shell. */
function markTextZones() {
	if (typeof document === "undefined") return;
	const enabled = prefGet("islandEnabled");
	const nodes = queryAll(prefGet("islandSelector"), ZONE_SELECTOR);
	if (nodes === null) return;
	for (let i = 0; i < nodes.length; i++) {
		const el = nodes[i];
		if (enabled === false) {
			if (el.getAttribute("data-dsh-text-zone") === "ltr") el.removeAttribute("data-dsh-text-zone");
		} else if (el.getAttribute("data-dsh-text-zone") !== "ltr") el.setAttribute("data-dsh-text-zone", "ltr");
	}
}

/** Mirror each drag handle's inline `left` onto `--dsh-h-start` (RTL consumes it as `right`). */
function syncHandles() {
	if (typeof document === "undefined") return;
	let nodes;
	try { nodes = document.querySelectorAll('[data-side="sidebar"],[data-side="rightbar"]'); } catch (e) { return; }
	for (let i = 0; i < nodes.length; i++) {
		const el = nodes[i];
		if (el.style === undefined || el.style === null) continue;
		const left = el.style.getPropertyValue("left");
		if (!left) continue;
		if (el.style.getPropertyValue("--dsh-h-start") !== left) el.style.setProperty("--dsh-h-start", left);
	}
}

// ── settings plumbing ───────────────────────────────────────────────────────
function clampInt(value, min, max, dflt) {
	const n = parseInt(value, 10);
	if (!isFinite(n)) return dflt;
	return Math.min(max, Math.max(min, n));
}

function clampThreshold(value) {
	return clampInt(value, THRESHOLD_MIN, THRESHOLD_MAX, PREF_DEFAULTS.threshold);
}

/** Selector lists are newline separated so attribute selectors may hold commas. */
function splitLines(value) {
	if (typeof value !== "string") return [];
	const out = [];
	const parts = value.split("\n");
	for (let i = 0; i < parts.length; i++) {
		const line = parts[i].trim();
		if (line !== "" && out.indexOf(line) < 0) out.push(line);
	}
	return out;
}

function matchesAny(selectors, el) {
	if (!selectors || selectors.length === 0 || typeof el.matches !== "function") return false;
	for (let i = 0; i < selectors.length; i++) {
		try { if (el.matches(selectors[i])) return true; } catch (e) { /* invalid selector: skip */ }
	}
	return false;
}

/** First match of the first selector that parses; `null` when nothing matches. */
function queryFirst(candidates) {
	for (let i = 0; i < candidates.length; i++) {
		const sel = candidates[i];
		if (typeof sel !== "string" || sel.trim() === "") continue;
		try {
			const node = document.querySelector(sel);
			if (node !== null) return node;
		} catch (e) { /* invalid selector: try the next candidate */ }
	}
	return null;
}

/** querySelectorAll over `primary`, falling back to `fallback`; `null` when both fail. */
function queryAll(primary, fallback) {
	try {
		const sel = typeof primary === "string" && primary.trim() !== "" ? primary : fallback;
		return document.querySelectorAll(sel);
	} catch (e) {}
	try { return fallback === null || fallback === undefined ? null : document.querySelectorAll(fallback); } catch (e) { return null; }
}

function dbg(on, kind, dir, text) {
	if (on !== true) return;
	let sample = typeof text === "string" ? text.replace(/\s+/g, " ").slice(0, 60) : "";
	try { console.debug("[dsh-rtl]", kind, dir, sample); } catch (e) {}
}

/** Coerce an imported/edited value into what the host schema accepts. */
function coerceValue(field, value) {
	const dflt = PREF_DEFAULTS[field];
	if (dflt === undefined) {
		if (field !== PREFERENCE_FIELD) return undefined;
		return MODE_IDS.indexOf(value) >= 0 ? value : undefined;
	}
	if (typeof dflt === "boolean") {
		if (typeof value === "boolean") return value;
		if (value === "true" || value === 1) return true;
		if (value === "false" || value === 0) return false;
		return undefined;
	}
	if (typeof dflt === "number") {
		const n = typeof value === "number" ? value : parseInt(value, 10);
		if (!isFinite(n)) return undefined;
		const bounds = FIELD_BOUNDS[field] || [0, 2000000];
		return Math.min(bounds[1], Math.max(bounds[0], n));
	}
	if (value === null || typeof value === "object") return undefined;
	const text = String(value);
	const allowed = FIELD_ENUMS[field];
	if (allowed !== undefined) return allowed.indexOf(text) >= 0 ? text : undefined;
	return text;
}

/** Probe options: a bare number is still a threshold (back-compat with the row). */
function normalizeDetectOpts(input) {
	if (input !== null && typeof input === "object" && input.__norm === true) return input;
	const src = input !== null && typeof input === "object" ? input : {};
	const single = typeof input === "number" ? input : undefined;
	const pick = (field, min, max) => {
		const raw = single !== undefined && field === "threshold" ? single : src[field];
		return clampInt(raw === undefined ? PREF_DEFAULTS[field] : raw, min, max, PREF_DEFAULTS[field]);
	};
	return {
		threshold: pick("threshold", THRESHOLD_MIN, THRESHOLD_MAX),
		minLetters: pick("minLetters", 1, 64),
		maxLetters: pick("maxLetters", 0, 20000),
		flipMixed: single !== undefined ? PREF_DEFAULTS.flipMixed : src.flipMixed !== false,
		countDigits: single !== undefined ? PREF_DEFAULTS.countDigits : src.countDigits === true
	};
}

/** Probe options plus the override rule lists; cached on the object (`__norm`). */
function normalizeOpts(input) {
	if (input !== null && typeof input === "object" && input.__norm === true) return input;
	const base = normalizeDetectOpts(input);
	const src = input !== null && typeof input === "object" ? input : {};
	base.blocks = splitLines(src.blockSelector === undefined ? PREF_DEFAULTS.blockSelector : src.blockSelector);
	base.forceLtr = splitLines(src.forceLtrSelector);
	base.forceRtl = splitLines(src.forceRtlSelector);
	base.ignore = splitLines(src.ignoreSelector);
	base.debug = src.debug === true;
	base.__norm = true;
	return base;
}

/** Every knob the engine reads, snapshotted once per pass. */
function engineOpts() {
	return normalizeOpts({
		threshold: prefGet("threshold"),
		minLetters: prefGet("minLetters"),
		maxLetters: prefGet("maxLetters"),
		flipMixed: prefGet("flipMixed"),
		countDigits: prefGet("countDigits"),
		blockSelector: prefGet("blockSelector"),
		forceLtrSelector: prefGet("forceLtrSelector"),
		forceRtlSelector: prefGet("forceRtlSelector"),
		ignoreSelector: prefGet("ignoreSelector"),
		debug: prefGet("debug")
	});
}

// ── AUTO direction probe ────────────────────────────────────────────────────
/** Latin-letter share (percent) must reach `threshold` before a block flips. */
function detectTextDir(text, opts) {
	if (typeof text !== "string" || text.length === 0) return "";
	const o = normalizeDetectOpts(opts);
	let arabic = 0;
	let other = 0;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charAt(i);
		if (ARABIC_RX.test(ch)) arabic++;
		else if (LETTER_RX.test(ch)) other++;
		else if (o.countDigits) {
			if (LAT_DIGIT_RX.test(ch)) other++;
			else if (AR_DIGIT_RX.test(ch)) arabic++;
		}
	}
	const total = arabic + other;
	if (total < o.minLetters) return "";
	if (o.maxLetters > 0 && total > o.maxLetters) return "";
	if (!o.flipMixed && arabic > 0 && other > 0) return "rtl";
	return (other / total) * 100 >= o.threshold ? "ltr" : "rtl";
}

/** Blocks whose layout would reorder (flex/grid/table) are never flipped. */
function flipsLayout(el) {
	try {
		const display = getComputedStyle(el).display;
		return display.indexOf("flex") >= 0 || display.indexOf("grid") >= 0 || display.indexOf("table") >= 0;
	} catch (e) { return true; }
}

/** True when the element holds only inline children (block children are its own business). */
function holdsOnlyInline(el) {
	for (let child = el.firstElementChild; child !== null; child = child.nextElementSibling) {
		if (INLINE_TAGS[child.tagName] === undefined) return false;
	}
	return true;
}

/** An element may carry a flipped `dir` when it is in `blockSelector` or is a text leaf. */
function eligibleBlock(el, opts) {
	if (matchesAny(opts.blocks, el)) return true;
	const tag = el.tagName;
	if (LEAF_TAGS[tag] === 1 && (el.children === undefined || el.children.length === 0)) return true;
	return false;
}

function forgetAutoMark(el) {
	el.removeAttribute("dir");
	el.removeAttribute(AUTO_MARKER);
	el.removeAttribute(AUTO_LEN);
}

/** Write a direction this plugin owns (marker + length keep later passes cheap). */
function applyOwnedDir(el, dir, textLength) {
	if (el.getAttribute("dir") !== dir) el.setAttribute("dir", dir);
	el.setAttribute(AUTO_MARKER, dir);
	el.setAttribute(AUTO_LEN, String(textLength));
}

/** Explicit user rules win over every built-in guard. */
function forcedDir(el, opts) {
	if (opts.forceLtr.length > 0 && matchesAny(opts.forceLtr, el)) return "ltr";
	if (opts.forceRtl.length > 0 && matchesAny(opts.forceRtl, el)) return "rtl";
	return null;
}

/** Decide one element's direction. `guarded` keeps chat bubbles structurally safe. */
function considerCore(el, opts, guarded) {
	const o = normalizeOpts(opts);
	const owned = el.getAttribute(AUTO_MARKER) !== null;
	const current = el.getAttribute("dir");
	if (current !== null && !owned) return;
	if (o.ignore.length > 0 && matchesAny(o.ignore, el)) {
		if (owned) forgetAutoMark(el);
		return;
	}
	const text = el.textContent || "";
	const forced = forcedDir(el, o);
	if (forced !== null) {
		applyOwnedDir(el, forced, text.length);
		dbg(o.debug, "forced", forced, text);
		return;
	}
	if (el.getAttribute("data-dsh-text-zone") !== null) return;
	const dir = detectTextDir(text, o);
	if (dir === "") {
		if (owned) forgetAutoMark(el);
		return;
	}
	if (current === dir && owned && el.getAttribute(AUTO_LEN) === String(text.length)) return;
	if (guarded && (!eligibleBlock(el, o) || !holdsOnlyInline(el) || flipsLayout(el))) return;
	applyOwnedDir(el, dir, text.length);
	dbg(o.debug, guarded ? "block" : "composer", dir, text);
}

/** Chat blocks keep their structure/layout guards. */
function considerAuto(el, opts) {
	considerCore(el, opts, true);
}

/** The composer is ours to drive: Lexical stores paragraphs as block DIVs, so
* the structural guards that protect a chat bubble do not apply to it. */
function considerComposer(el, opts) {
	considerCore(el, opts, false);
}

/** Strip every direction this plugin forced, so RTL/LTR modes stay pristine. */
function clearAutoMarks(root) {
	let scope = root;
	if (!scope) {
		if (typeof document === "undefined") return;
		scope = document;
	}
	let nodes;
	try { nodes = scope.querySelectorAll("[" + AUTO_MARKER + "]"); } catch (e) { return; }
	for (let i = 0; i < nodes.length; i++) forgetAutoMark(nodes[i]);
}

/** The first text-bearing leaf inside a sidebar row is what actually needs a side. */
function findSidebarLabel(item) {
	let nodes;
	try { nodes = item.querySelectorAll("a,span,div,p"); } catch (e) { return null; }
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		if (node.children && node.children.length === 0 && (node.textContent || "").trim() !== "") return node;
	}
	return null;
}

/** Long-lived AUTO controller: watches the thread, the composer and the sidebar. */
function createAutoDirector(getPref) {
	const state = { scope: null, observer: null, timer: null, listening: false };

	const findScope = () => {
		const node = queryFirst([getPref("scopeSelector"), AUTO_SCOPE]);
		if (node !== null) return node;
		try {
			const turn = document.querySelector(AUTO_SCOPE_FALLBACK);
			return turn !== null ? turn.parentElement : null;
		} catch (e) { return null; }
	};

	const findComposer = () => queryFirst([getPref("composerSelector"), COMPOSER_SELECTOR]);

	const clearSidebar = () => {
		try {
			const root = document.querySelector('[data-side="sidebar"]');
			if (root !== null) clearAutoMarks(root);
		} catch (e) {}
	};

	const applySidebar = (opts) => {
		const nodes = queryAll(getPref("sidebarSelector"), SIDEBAR_SELECTOR);
		if (nodes === null) return;
		for (let i = 0; i < nodes.length; i++) {
			const label = findSidebarLabel(nodes[i]);
			if (label !== null) considerAuto(label, opts);
		}
	};

	/** User rule lists run document-wide, so they also reach elements outside the scan. */
	const applyRules = (opts) => {
		const sels = opts.ignore.concat(opts.forceLtr, opts.forceRtl);
		for (let i = 0; i < sels.length; i++) {
			let nodes = null;
			try { nodes = document.querySelectorAll(sels[i]); } catch (e) { nodes = null; }
			if (nodes === null) continue;
			for (let k = 0; k < nodes.length; k++) considerCore(nodes[k], opts, false);
		}
	};

	const applyComposer = (el, opts) => {
		const mode = getPref("composerMode");
		if (mode === "rtl" || mode === "ltr") {
			applyOwnedDir(el, mode, (el.textContent || "").length);
			return;
		}
		if (getPref("autoComposer") === false) {
			if (el.getAttribute(AUTO_MARKER) !== null) forgetAutoMark(el);
			return;
		}
		considerComposer(el, opts);
	};

	const pass = () => {
		if (typeof document === "undefined") return;
		if (readMode() !== "auto") { clearAutoMarks(null); return; }
		const opts = engineOpts();
		if (state.scope === null || !document.contains(state.scope)) {
			state.scope = findScope();
			bind();
		}
		if (getPref("autoContent") !== false) {
			if (state.scope !== null) {
				const nodes = queryAll(getPref("scanSelector"), AUTO_SELECTOR);
				if (nodes !== null) {
					for (let i = 0; i < nodes.length; i++) considerAuto(nodes[i], opts);
				}
			}
		} else if (state.scope !== null) {
			clearAutoMarks(state.scope);
		}
		const composer = findComposer();
		if (composer !== null) applyComposer(composer, opts);
		if (getPref("autoSidebar") === true) applySidebar(opts);
		else clearSidebar();
		applyRules(opts);
	};

	const schedule = () => {
		if (state.timer !== null) return;
		const ms = clampInt(getPref("debounce"), 0, 2000, AUTO_DEBOUNCE);
		if (ms === 0) { pass(); return; }
		state.timer = setTimeout(() => { state.timer = null; pass(); }, ms);
	};

	function bind() {
		if (state.observer !== null) { state.observer.disconnect(); state.observer = null; }
		if (state.scope === null || typeof MutationObserver === "undefined") return;
		state.observer = new MutationObserver(schedule);
		state.observer.observe(state.scope, { childList: true, subtree: true, characterData: true });
	}

	const onInput = (event) => {
		if (getPref("reactToInput") === false) return;
		const target = event && event.target;
		if (!target || typeof target.closest !== "function") return;
		const sel = typeof getPref("composerSelector") === "string" && getPref("composerSelector").trim() !== "" ? getPref("composerSelector") : COMPOSER_SELECTOR;
		let composer = null;
		try { composer = target.closest(sel); } catch (e) { composer = null; }
		if (composer !== null) applyComposer(composer, engineOpts());
	};

	return {
		rebind: () => {
			const next = findScope();
			if (next === state.scope) return;
			const appeared = next !== null && state.scope === null;
			state.scope = next;
			bind();
			// A thread that renders late gets its first pass right away instead
			// of waiting for a mutation inside a scope we were not watching.
			if (appeared && state.listening) pass();
		},
		pass,
		reset: () => { clearAutoMarks(null); pass(); },
		start: () => {
			if (state.listening || typeof document === "undefined") return;
			state.listening = true;
			document.addEventListener("input", onInput, true);
			document.addEventListener("beforeinput", onInput, true);
			state.scope = findScope();
			bind();
			pass();
		},
		stop: () => {
			if (!state.listening) return;
			state.listening = false;
			try {
				document.removeEventListener("input", onInput, true);
				document.removeEventListener("beforeinput", onInput, true);
			} catch (e) {}
			if (state.timer !== null) { clearTimeout(state.timer); state.timer = null; }
			if (state.observer !== null) { state.observer.disconnect(); state.observer = null; }
			state.scope = null;
			clearAutoMarks(null);
		}
	};
}

/** Chrome observer (text islands + drag handles); the `observe` knob arms it live. */
function createChromeObserver(autoDirector) {
	let dom = null;
	let attrs = null;
	let pending = null;
	const run = () => {
		pending = null;
		markTextZones();
		syncHandles();
		if (autoDirector) autoDirector.rebind();
	};
	const schedule = () => {
		if (pending === null) pending = setTimeout(run, 50);
	};
	const attach = () => {
		if (typeof document === "undefined" || typeof MutationObserver === "undefined" || dom !== null) return;
		dom = new MutationObserver(schedule);
		dom.observe(document.documentElement, { childList: true, subtree: true });
		attrs = new MutationObserver((records) => {
			for (let i = 0; i < records.length; i++) {
				const target = records[i].target;
				const side = target.getAttribute ? target.getAttribute("data-side") : null;
				if (side === "sidebar" || side === "rightbar") { syncHandles(); return; }
			}
		});
		attrs.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["style"] });
		schedule();
	};
	const detach = () => {
		if (dom !== null) { dom.disconnect(); dom = null; }
		if (attrs !== null) { attrs.disconnect(); attrs = null; }
		if (pending !== null) { clearTimeout(pending); pending = null; }
	};
	const sync = () => { if (prefGet("observe") !== false) attach(); else detach(); };
	sync();
	return { sync, dispose: detach };
}

/** Direction preference store backing the settings row. */
function createDirectionStore() {
	return store_lib.defineStore({
		init: () => ({ active: "", revision: -1 }),
		actions: { sync: (d, active, revision) => {
			if (revision <= d.revision) return;
			d.active = active;
			d.revision = revision;
		} }
	});
}

let settingsHost = null;
let localeRef = null;
let boundT = null;
const localPrefs = {};
let localMode = null;
let auto = null;
let chromeObserver = null;

function t(key) {
	if (boundT === null && localeRef !== null && localeRef !== undefined) {
		try { boundT = localeRef.bind(SETTINGS_NS); } catch (e) { boundT = null; }
	}
	if (boundT !== null) {
		try { return boundT(key); } catch (e) {}
	}
	return key;
}

function readHost(field) {
	if (settingsHost === null) return undefined;
	try {
		const snap = settingsHost.getSnapshot();
		const value = snap !== undefined && snap !== null && snap.value !== undefined && snap.value !== null ? snap.value : null;
		const raw = value !== null ? value[field] : undefined;
		return raw === undefined || raw === null ? undefined : raw;
	} catch (e) { return undefined; }
}

function prefGet(field) {
	if (localPrefs[field] !== undefined) {
		const hosted = readHost(field);
		if (hosted === localPrefs[field]) delete localPrefs[field];
		else return localPrefs[field];
	}
	const hosted = readHost(field);
	if (hosted !== undefined) return hosted;
	return PREF_DEFAULTS[field];
}

function prefSet(field, value) {
	if (value === undefined) return;
	localPrefs[field] = value;
	if (settingsHost !== null) {
		try { settingsHost.set(field, value); } catch (e) { /* settings service rejected it */ }
	}
}

/** Restore one knob (or every knob) to its shipped default. */
function prefReset(fields) {
	const list = Array.isArray(fields) && fields.length > 0 ? fields : PREF_FIELDS;
	for (let i = 0; i < list.length; i++) {
		const field = list[i];
		if (PREF_DEFAULTS[field] === undefined) continue;
		prefSet(field, PREF_DEFAULTS[field]);
	}
}

/** The whole configuration as portable JSON (unknown fields are dropped on import). */
function exportConfigText() {
	const out = {};
	for (let i = 0; i < PREF_FIELDS.length; i++) out[PREF_FIELDS[i]] = prefGet(PREF_FIELDS[i]);
	const mode = readMode();
	if (mode !== undefined) out[PREFERENCE_FIELD] = mode;
	return JSON.stringify(out, null, 1);
}

/** Apply a pasted configuration; returns the fields it touched (invalid ones are skipped). */
function applyImport(text) {
	const parsed = JSON.parse(String(text));
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("config must be an object");
	const applied = [];
	for (let i = 0; i < PREF_FIELDS.length; i++) {
		const field = PREF_FIELDS[i];
		if (parsed[field] === undefined) continue;
		const value = coerceValue(field, parsed[field]);
		if (value === undefined) { applied.push("!" + field); continue; }
		prefSet(field, value);
		applied.push(field);
	}
	if (parsed[PREFERENCE_FIELD] !== undefined) {
		const mode = coerceValue(PREFERENCE_FIELD, parsed[PREFERENCE_FIELD]);
		if (mode !== undefined) { setMode(mode); applied.push(PREFERENCE_FIELD); }
	}
	return applied;
}

function isArabic(id) {
	return typeof id === "string" && id.toLowerCase().split("-")[0] === "ar";
}

function resolveLocale(ctx) {
	if (ctx && ctx.locale && typeof ctx.locale.register === "function") return ctx.locale;
	try { const s = ctx.get && ctx.get("locale"); if (s && typeof s.register === "function") return s; } catch (e) {}
	return null;
}

// ── settings UI ─────────────────────────────────────────────────────────────
function ModePills(props) {
	const mode = props.mode;
	const onPick = props.onPick;
	const label = props.t;
	return jsx_runtime.jsx("div", { className: "dshrtl_pills", role: "group", "aria-label": label("direction.title"), children:
		[["rtl", "direction.rtl"], ["auto", "direction.auto"], ["ltr", "direction.ltr"]].map((pair) =>
			jsx_runtime.jsx("button", {
				type: "button",
				className: "dshrtl_pill",
				"data-on": String(mode === pair[0]),
				"aria-pressed": mode === pair[0],
				onClick: () => onPick(pair[0]),
				children: label(pair[1])
			}, pair[0]))
	});
}

/** Collapsible group: the section stays scannable while every knob stays one click away. */
function Group(props) {
	return jsx_runtime.jsxs("details", { className: "dshrtl_group", open: props.open !== false, children: [
		jsx_runtime.jsx("summary", { className: "dshrtl_sum", children: props.title }, "sum"),
		jsx_runtime.jsx("div", { className: "dshrtl_box", children: props.children }, "body")
	] }, props.id);
}

function FieldText(props) {
	return jsx_runtime.jsxs("div", { className: "dshrtl_fieldText", children: [
		jsx_runtime.jsx("div", { className: "dshrtl_label", children: props.label }, "l"),
		props.hint ? jsx_runtime.jsx("div", { className: "dshrtl_sub", children: props.hint }, "h") : null
	] }, "text");
}

function CheckRow(props) {
	const label = props.t;
	// The whole row is the click target, so the label text is not repeated
	// next to the box; the input keeps its accessible name.
	return jsx_runtime.jsxs("label", { className: "dshrtl_field dshrtl_switch", children: [
		jsx_runtime.jsx(FieldText, { label: label(props.labelKey), hint: props.hintKey ? label(props.hintKey) : null }, "text"),
		jsx_runtime.jsx("input", { type: "checkbox", checked: props.checked === true, "aria-label": label(props.labelKey), onChange: (event) => props.onChange(event.target.checked === true) }, "box")
	] }, props.id);
}

function NumberRow(props) {
	const label = props.t;
	const buffer = (0, react.useState)(null);
	const buf = buffer[0];
	const setBuf = buffer[1];
	const shown = buf !== null ? buf : String(props.value);
	return jsx_runtime.jsxs("div", { className: "dshrtl_field", children: [
		jsx_runtime.jsx(FieldText, { label: label(props.labelKey), hint: props.hintKey ? label(props.hintKey) : null }, "text"),
		jsx_runtime.jsx("input", {
			className: "dshrtl_num dshrtl_numWide",
			type: "number",
			min: String(props.min),
			max: String(props.max),
			step: props.step === undefined ? 1 : String(props.step),
			value: shown,
			"aria-label": label(props.labelKey),
			onChange: (event) => { setBuf(event.target.value); props.onChange(event.target.value); },
			onBlur: () => setBuf(null)
		}, "num")
	] }, props.id);
}

function SelectRow(props) {
	const label = props.t;
	return jsx_runtime.jsxs("div", { className: "dshrtl_field", children: [
		jsx_runtime.jsx(FieldText, { label: label(props.labelKey), hint: props.hintKey ? label(props.hintKey) : null }, "text"),
		jsx_runtime.jsx("select", {
			className: "dshrtl_select",
			"aria-label": label(props.labelKey),
			value: String(props.value),
			onChange: (event) => props.onChange(event.target.value),
			children: props.options.map((pair) => jsx_runtime.jsx("option", { value: String(pair[0]), children: label(pair[1]) }, String(pair[0])))
		}, "select")
	] }, props.id);
}

function TextRow(props) {
	const label = props.t;
	return jsx_runtime.jsxs("div", { className: "dshrtl_textareaRow", children: [
		jsx_runtime.jsx(FieldText, { label: label(props.labelKey), hint: props.hintKey ? label(props.hintKey) : null }, "text"),
		jsx_runtime.jsx("textarea", {
			className: "dshrtl_area",
			spellCheck: false,
			rows: props.rows === undefined ? 3 : props.rows,
			value: String(props.value),
			dir: "ltr",
			"aria-label": label(props.labelKey),
			onChange: (event) => props.onChange(event.target.value)
		}, "area")
	] }, props.id);
}

function ButtonRow(props) {
	const label = props.t;
	return jsx_runtime.jsxs("div", { className: "dshrtl_btns", children: [
		jsx_runtime.jsx("button", { type: "button", className: "dshrtl_btn", onClick: props.onRefresh, children: label("direction.refresh") }, "refresh"),
		jsx_runtime.jsx("button", { type: "button", className: "dshrtl_btn", onClick: props.onCopy, children: label("direction.copy") }, "copy"),
		jsx_runtime.jsx("button", { type: "button", className: "dshrtl_btn", onClick: props.onImport, children: label("direction.import") }, "import"),
		jsx_runtime.jsx("button", { type: "button", className: "dshrtl_btn dshrtl_btnDanger", onClick: props.onReset, children: label("direction.reset") }, "reset"),
		jsx_runtime.jsx("div", { className: "dshrtl_status", children: props.status || "" }, "status")
	] }, "btns");
}

function DirectionRow(props) {
	const tt = props.t;
	const useStore = props.useStore;
	const setDirection = props.setDirection;
	const active = useStore((s) => s.active);
	const openState = (0, react.useState)(false);
	const open = openState[0];
	const setOpen = openState[1];
	const options = [
		{ id: "rtl", label: tt("direction.rtl") },
		{ id: "auto", label: tt("direction.auto") },
		{ id: "ltr", label: tt("direction.ltr") }
	];
	const selected = options.some((o) => o.id === active) ? active : "";
	const activeLabel = selected ? tt("direction." + selected) : "";
	return jsx_runtime.jsxs("div", { className: "dshrtl_row", children: [
		jsx_runtime.jsxs("div", { className: "dshrtl_rowText", children: [
			jsx_runtime.jsx("div", { className: "dshrtl_title", children: tt("direction.title") }, "title"),
			jsx_runtime.jsx("div", { className: "dshrtl_hint", children: tt("direction.hint") }, "hint")
		] }, "text"),
		jsx_runtime.jsx(primitives.Menu, {
			open,
			onClose: () => setOpen(false),
			items: options,
			selectedId: selected,
			onSelect: (id) => { setDirection(id); setOpen(false); },
			align: "end",
			portal: true,
			anchor: jsx_runtime.jsxs("button", {
				type: "button",
				className: "dshrtl_selector",
				"aria-haspopup": "menu",
				"aria-expanded": open,
				onClick: () => { setOpen((v) => !v); },
				children: [activeLabel, jsx_runtime.jsx(primitives.IconChevronDownOutline14, { className: "dshrtl_chevron" }, "chev")]
			})
		}, "menu")
	] });
}

/** Settings section: every direction knob, grouped so the panel stays readable. */
function DirectionSection(props) {
	const label = props && props.t ? props.t : t;
	const tickState = (0, react.useState)(0);
	const bump = () => tickState[1]((n) => n + 1);
	(0, react.useEffect)(() => {
		if (settingsHost === null) return undefined;
		let off;
		try { off = settingsHost.subscribe(() => bump()); } catch (e) { off = undefined; }
		return typeof off === "function" ? off : undefined;
	}, []);

	const ioState = (0, react.useState)(null);
	const ioText = ioState[0];
	const setIoText = ioState[1];
	const msgState = (0, react.useState)("");
	const msg = msgState[0];
	const setMsg = msgState[1];
	const ioRef = (0, react.useRef)(null);

	/** Any knob change: re-probe everything, refresh islands and the DOM observer. */
	const refresh = () => {
		bump();
		if (auto !== null) auto.reset();
		markTextZones();
		if (chromeObserver !== null) chromeObserver.sync();
	};

	const onBool = (field) => (value) => { prefSet(field, value); refresh(); };
	const onNumber = (field) => (raw) => { const next = coerceValue(field, raw); if (next !== undefined) { prefSet(field, next); refresh(); } };
	const onEnum = (field) => (value) => { const next = coerceValue(field, value); if (next !== undefined) { prefSet(field, next); refresh(); } };
	const onText = (field) => (value) => { prefSet(field, value); refresh(); };
	const onMode = (id) => { setMode(id); bump(); };

	const current = ioText !== null ? ioText : exportConfigText();
	const onRefresh = () => { setIoText(exportConfigText()); setMsg(""); };
	const onImport = () => {
		try {
			const applied = applyImport(current);
			setIoText(exportConfigText());
			setMsg(label("direction.importDone") + " (" + applied.length + ")");
			refresh();
		} catch (error) {
			setMsg(label("direction.importError"));
		}
	};
	const onCopy = () => {
		const el = ioRef.current;
		if (el) {
			try { el.focus(); el.select(); el.setSelectionRange(0, el.value.length); } catch (e) {}
		}
		const fallback = () => {
			let ok = false;
			try { ok = el !== null && document.execCommand("copy"); } catch (e) { ok = false; }
			setMsg(label(ok ? "direction.copied" : "direction.importError"));
		};
		try {
			const nav = typeof navigator !== "undefined" ? navigator : null;
			if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
				nav.clipboard.writeText(current).then(() => setMsg(label("direction.copied")), fallback);
				return;
			}
		} catch (e) {}
		fallback();
	};
	const onReset = () => {
		prefReset();
		setIoText(null);
		setMsg(label("direction.resetDone"));
		refresh();
	};

	const mode = readMode();
	const threshold = clampThreshold(prefGet("threshold"));

	return jsx_runtime.jsxs("div", { className: "dshrtl_sec", children: [
		jsx_runtime.jsxs("div", { className: "dshrtl_secHead", children: [
			jsx_runtime.jsx("div", { className: "dshrtl_secTitle", children: label("direction.section") }, "title"),
			jsx_runtime.jsx("div", { className: "dshrtl_secNote", children: label("direction.autoHint") }, "note")
		] }, "head"),
		jsx_runtime.jsx(Group, { id: "g-modes", title: label("direction.group.modes"), children:
			jsx_runtime.jsxs("div", { className: "dshrtl_field", children: [
				jsx_runtime.jsx(FieldText, { label: label("direction.title"), hint: label("direction.hint") }, "text"),
				jsx_runtime.jsx(ModePills, { mode, t: label, onPick: onMode }, "pills")
			] }, "mode")
		}, "g-modes"),
		jsx_runtime.jsx(Group, { id: "g-zones", title: label("direction.group.zones"), children: [
			jsx_runtime.jsx(CheckRow, { t: label, id: "z-content", labelKey: "direction.autoContent", hintKey: "direction.autoContentHint", checked: prefGet("autoContent") !== false, onChange: onBool("autoContent") }, "z-content"),
			jsx_runtime.jsx(CheckRow, { t: label, id: "z-composer", labelKey: "direction.autoComposer", hintKey: "direction.autoComposerHint", checked: prefGet("autoComposer") !== false, onChange: onBool("autoComposer") }, "z-composer"),
			jsx_runtime.jsx(SelectRow, { t: label, id: "z-composerMode", labelKey: "direction.composerMode", hintKey: "direction.composerModeHint", value: prefGet("composerMode"), options: [["auto", "direction.composerMode.auto"], ["rtl", "direction.composerMode.rtl"], ["ltr", "direction.composerMode.ltr"]], onChange: onEnum("composerMode") }, "z-composerMode"),
			jsx_runtime.jsx(CheckRow, { t: label, id: "z-sidebar", labelKey: "direction.autoSidebar", hintKey: "direction.autoSidebarHint", checked: prefGet("autoSidebar") === true, onChange: onBool("autoSidebar") }, "z-sidebar"),
			jsx_runtime.jsx(CheckRow, { t: label, id: "z-islands", labelKey: "direction.islandEnabled", hintKey: "direction.islandEnabledHint", checked: prefGet("islandEnabled") !== false, onChange: onBool("islandEnabled") }, "z-islands")
		] }, "g-zones"),
		jsx_runtime.jsx(Group, { id: "g-detect", title: label("direction.group.detect"), children: [
			jsx_runtime.jsxs("div", { className: "dshrtl_field", children: [
				jsx_runtime.jsx(FieldText, { label: label("direction.threshold"), hint: label("direction.thresholdHint") }, "text"),
				jsx_runtime.jsx("select", {
					className: "dshrtl_select",
					"aria-label": label("direction.threshold"),
					value: String(threshold),
					onChange: (event) => { prefSet("threshold", clampThreshold(event.target.value)); refresh(); },
					children: [40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95].map((n) =>
						jsx_runtime.jsx("option", { value: String(n), children: n + "%" }, String(n)))
				}, "select")
			] }, "threshold"),
			jsx_runtime.jsx(NumberRow, { t: label, id: "d-minLetters", labelKey: "direction.minLetters", hintKey: "direction.minLettersHint", value: clampInt(prefGet("minLetters"), 1, 64, PREF_DEFAULTS.minLetters), min: 1, max: 64, onChange: onNumber("minLetters") }, "d-minLetters"),
			jsx_runtime.jsx(NumberRow, { t: label, id: "d-maxLetters", labelKey: "direction.maxLetters", hintKey: "direction.maxLettersHint", value: clampInt(prefGet("maxLetters"), 0, 20000, PREF_DEFAULTS.maxLetters), min: 0, max: 20000, onChange: onNumber("maxLetters") }, "d-maxLetters"),
			jsx_runtime.jsx(CheckRow, { t: label, id: "d-flipMixed", labelKey: "direction.flipMixed", hintKey: "direction.flipMixedHint", checked: prefGet("flipMixed") !== false, onChange: onBool("flipMixed") }, "d-flipMixed"),
			jsx_runtime.jsx(CheckRow, { t: label, id: "d-countDigits", labelKey: "direction.countDigits", hintKey: "direction.countDigitsHint", checked: prefGet("countDigits") === true, onChange: onBool("countDigits") }, "d-countDigits")
		] }, "g-detect"),
		jsx_runtime.jsx(Group, { id: "g-perf", title: label("direction.group.perf"), children: [
			jsx_runtime.jsx(NumberRow, { t: label, id: "p-debounce", labelKey: "direction.debounce", hintKey: "direction.debounceHint", value: clampInt(prefGet("debounce"), 0, 2000, PREF_DEFAULTS.debounce), min: 0, max: 2000, onChange: onNumber("debounce") }, "p-debounce"),
			jsx_runtime.jsx(CheckRow, { t: label, id: "p-observe", labelKey: "direction.observe", hintKey: "direction.observeHint", checked: prefGet("observe") !== false, onChange: onBool("observe") }, "p-observe"),
			jsx_runtime.jsx(CheckRow, { t: label, id: "p-react", labelKey: "direction.reactToInput", hintKey: "direction.reactToInputHint", checked: prefGet("reactToInput") !== false, onChange: onBool("reactToInput") }, "p-react"),
			jsx_runtime.jsx(CheckRow, { t: label, id: "p-debug", labelKey: "direction.debug", hintKey: "direction.debugHint", checked: prefGet("debug") === true, onChange: onBool("debug") }, "p-debug")
		] }, "g-perf"),
		jsx_runtime.jsx(Group, { id: "g-overrides", open: false, title: label("direction.group.overrides"), children: [
			jsx_runtime.jsx("div", { className: "dshrtl_sub", children: label("direction.selectorsNote") }, "note"),
			jsx_runtime.jsx(TextRow, { t: label, id: "o-ltr", labelKey: "direction.forceLtr", hintKey: "direction.forceLtrHint", value: prefGet("forceLtrSelector"), onChange: onText("forceLtrSelector") }, "o-ltr"),
			jsx_runtime.jsx(TextRow, { t: label, id: "o-rtl", labelKey: "direction.forceRtl", hintKey: "direction.forceRtlHint", value: prefGet("forceRtlSelector"), onChange: onText("forceRtlSelector") }, "o-rtl"),
			jsx_runtime.jsx(TextRow, { t: label, id: "o-ignore", labelKey: "direction.ignore", hintKey: "direction.ignoreHint", value: prefGet("ignoreSelector"), onChange: onText("ignoreSelector") }, "o-ignore")
		] }, "g-overrides"),
		jsx_runtime.jsx(Group, { id: "g-selectors", open: false, title: label("direction.group.selectors"), children: [
			jsx_runtime.jsx(TextRow, { t: label, id: "s-scope", labelKey: "direction.scopeSelector", hintKey: "direction.scopeSelectorHint", rows: 1, value: prefGet("scopeSelector"), onChange: onText("scopeSelector") }, "s-scope"),
			jsx_runtime.jsx(TextRow, { t: label, id: "s-composer", labelKey: "direction.composerSelector", hintKey: "direction.composerSelectorHint", rows: 1, value: prefGet("composerSelector"), onChange: onText("composerSelector") }, "s-composer"),
			jsx_runtime.jsx(TextRow, { t: label, id: "s-scan", labelKey: "direction.scanSelector", hintKey: "direction.scanSelectorHint", rows: 2, value: prefGet("scanSelector"), onChange: onText("scanSelector") }, "s-scan"),
			jsx_runtime.jsx(TextRow, { t: label, id: "s-block", labelKey: "direction.blockSelector", hintKey: "direction.blockSelectorHint", rows: 2, value: prefGet("blockSelector"), onChange: onText("blockSelector") }, "s-block"),
			jsx_runtime.jsx(TextRow, { t: label, id: "s-island", labelKey: "direction.islandSelector", hintKey: "direction.islandSelectorHint", rows: 1, value: prefGet("islandSelector"), onChange: onText("islandSelector") }, "s-island"),
			jsx_runtime.jsx(TextRow, { t: label, id: "s-sidebar", labelKey: "direction.sidebarSelector", hintKey: "direction.sidebarSelectorHint", rows: 1, value: prefGet("sidebarSelector"), onChange: onText("sidebarSelector") }, "s-sidebar")
		] }, "g-selectors"),
		jsx_runtime.jsx(Group, { id: "g-io", open: false, title: label("direction.group.io"), children: [
			jsx_runtime.jsx("div", { className: "dshrtl_sub", children: label("direction.exportHint") }, "note"),
			jsx_runtime.jsx("textarea", {
				className: "dshrtl_area dshrtl_areaTall",
				spellCheck: false,
				rows: 8,
				ref: ioRef,
				dir: "ltr",
				value: current,
				"aria-label": label("direction.export"),
				onChange: (event) => setIoText(event.target.value)
			}, "io"),
			jsx_runtime.jsx(ButtonRow, { t: label, status: msg, onRefresh, onCopy, onImport, onReset }, "btns")
		] }, "g-io")
	] });
}

function readMode() {
	if (localMode !== null) {
		const hosted = readHost(PREFERENCE_FIELD);
		if (hosted === localMode) localMode = null;
		else return localMode;
	}
	const hosted = readHost(PREFERENCE_FIELD);
	if (hosted === "rtl" || hosted === "ltr" || hosted === "auto") return hosted;
	const stored = readStorage();
	return stored !== undefined ? stored : undefined;
}

function setMode(id) {
	if (id !== "rtl" && id !== "ltr" && id !== "auto") return;
	localMode = id;
	writeStorage(id);
	if (settingsHost !== null) {
		try { settingsHost.set(PREFERENCE_FIELD, id); } catch (e) { /* ignore */ }
	}
	sync();
}

function readStorage() {
	try {
		const value = window.localStorage.getItem(STORAGE_KEY);
		return value === "rtl" || value === "ltr" || value === "auto" ? value : undefined;
	} catch (e) { return undefined; }
}

function writeStorage(value) {
	try { window.localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
}

function resolveDir() {
	const preference = readMode();
	if (preference === "auto") return "rtl";
	if (preference !== undefined) return preference;
	const active = localeRef !== null && localeRef !== undefined ? localeRef.getSnapshot().active : "";
	return isArabic(active) ? "rtl" : "ltr";
}

/** Apply the shell direction and (re)arm the AUTO probe. */
function sync() {
	if (typeof document === "undefined") return;
	const dir = resolveDir();
	const root = document.documentElement;
	if (root.getAttribute("dir") !== dir) root.setAttribute("dir", dir);
	if (auto !== null) {
		if (readMode() === "auto") { auto.start(); auto.pass(); }
		else auto.stop();
	}
	if (chromeObserver !== null) chromeObserver.sync();
	syncHandles();
	markTextZones();
}

function apply(ctx) {
	injectStyle(ROW_TAG, ROW_CSS, "dsh-rtl");
	injectStyle(DRIVER_TAG, DRIVER_CSS, "dsh-rtl");
	injectStyle(RTL_TAG, RTL_CSS, "dsh-rtl");

	const locale = resolveLocale(ctx);
	localeRef = locale;
	if (locale !== null && locale !== undefined) {
		ctx.effect(() => {
			try { return locale.register(SETTINGS_NS, DICT); } catch (e) { return undefined; }
		}, "dsh-rtl: settings row dictionaries");
	}

	try { settingsHost = ctx.settingsScope.bind({ namespace: HOST_NAMESPACE }); } catch (e) { settingsHost = null; }
	auto = createAutoDirector(prefGet);

	const store = createDirectionStore();
	let bound;
	let revision = 0;

	if (typeof document !== "undefined") {
		if (locale !== null && locale !== undefined) ctx.effect(() => locale.subscribe(sync), "dsh-rtl: language follows direction");
		ctx.effect(() => settingsHost !== null ? settingsHost.subscribe(sync) : undefined, "dsh-rtl: direction preference adoption");
		ctx.effect(() => {
			chromeObserver = createChromeObserver(auto);
			return () => {
				if (chromeObserver !== null) { chromeObserver.dispose(); chromeObserver = null; }
			};
		}, "dsh-rtl: text zone and handle observers");
		sync();
	}

	const injected = (actions) => {
		bound = actions;
		sync();
		return { setDirection: (id) => { setMode(id); if (bound) { revision += 1; bound.sync(resolveDir(), revision); } } };
	};

	ctx.slots.inject("settings.general.item", () => ctx.slots.register({
		name: "settings.general.item",
		id: ROW_ID,
		order: ROW_ORDER,
		store,
		locale: SETTINGS_NS,
		inject: injected
	}, DirectionRow));

	ctx.slots.inject("settings.section", () => ctx.slots.register({
		name: "settings.section",
		id: SECTION_ID,
		order: SECTION_ORDER,
		label: () => t("direction.section")
	}, DirectionSection));
}

exports.apply = apply;
exports.inject = inject;
// Test seam only: the loader reads apply/inject.
exports.__internals = {
	detectTextDir,
	considerAuto,
	considerComposer,
	clearAutoMarks,
	clampThreshold,
	resolveDir,
	normalizeOpts,
	coerceValue,
	exportConfigText,
	applyImport,
	prefReset,
	PREF_DEFAULTS,
	PREF_FIELDS,
	FIELD_BOUNDS,
	splitLines,
	matchesAny
};
return module.exports; } });
