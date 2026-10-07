import z from "@deepseek-ai/schemastery";

//#region lib/types/direction-settings.js
/** Settings namespace owned by the direction plugin. */
const DIRECTION_SETTINGS_NAMESPACE = "direction";
/** Field carrying an explicit RTL/AUTO/LTR selection; absence delegates to the language. */
const DIRECTION_PREFERENCE_FIELD = "preference";
/** The three direction modes this preference accepts. */
const DIRECTION_ID_PATTERN = /^(?:rtl|ltr|auto)$/;
/** Composer override: auto probe, or a forced side. */
const DIRECTION_COMPOSER_PATTERN = /^(?:auto|rtl|ltr)$/;
/** Share of Latin letters (percent) required before an AUTO block flips to LTR. */
const DIRECTION_THRESHOLD_MIN = 40;
const DIRECTION_THRESHOLD_MAX = 95;
/** Every field this plugin owns, in UI order; the browser half mirrors the list. */
const DIRECTION_FIELDS = [
	"preference",
	"autoContent",
	"autoComposer",
	"autoSidebar",
	"composerMode",
	"threshold",
	"minLetters",
	"maxLetters",
	"flipMixed",
	"countDigits",
	"debounce",
	"observe",
	"reactToInput",
	"debug",
	"islandEnabled",
	"scopeSelector",
	"composerSelector",
	"scanSelector",
	"blockSelector",
	"islandSelector",
	"sidebarSelector",
	"forceLtrSelector",
	"forceRtlSelector",
	"ignoreSelector"
];
/** Durable direction schema; also the wire envelope the browser scope validates against. */
const DirectionSettingsSchema = z.object({
	[DIRECTION_PREFERENCE_FIELD]: z.string().pattern(DIRECTION_ID_PATTERN).required(false),
	/** Flip mostly-English chat blocks to LTR while the shell stays RTL. */
	autoContent: z.boolean().required(false),
	/** Flip the composer to LTR while the typed text is mostly English. */
	autoComposer: z.boolean().required(false),
	/** Also flip sidebar session titles. */
	autoSidebar: z.boolean().required(false),
	/** `auto` follows the probe; `rtl`/`ltr` pin the composer. */
	composerMode: z.string().pattern(DIRECTION_COMPOSER_PATTERN).required(false),
	/** Latin-letter share (40–95) that counts as "mostly English". */
	threshold: z.number().min(DIRECTION_THRESHOLD_MIN).max(DIRECTION_THRESHOLD_MAX).required(false),
	/** Letters required before a block is judged at all. */
	minLetters: z.number().min(1).max(64).required(false),
	/** Skip blocks with more letters than this; 0 disables the cap. */
	maxLetters: z.number().min(0).max(20000).required(false),
	/** When false, blocks mixing both scripts stay RTL. */
	flipMixed: z.boolean().required(false),
	/** Count ASCII/Arabic-Indic digits as script evidence. */
	countDigits: z.boolean().required(false),
	/** Reaction delay in milliseconds (0 = immediate). */
	debounce: z.number().min(0).max(2000).required(false),
	/** Watch the DOM for new messages. */
	observe: z.boolean().required(false),
	/** Re-probe on `input` events while typing. */
	reactToInput: z.boolean().required(false),
	/** Log every decision to the console. */
	debug: z.boolean().required(false),
	/** Keep `pre, code, …` marked as permanent LTR islands. */
	islandEnabled: z.boolean().required(false),
	/** Container the content probe scans. */
	scopeSelector: z.string().required(false),
	/** Element the composer probe drives. */
	composerSelector: z.string().required(false),
	/** Selector list the content probe visits inside the scope. */
	scanSelector: z.string().required(false),
	/** Elements allowed to carry a flipped `dir` (layout guards). */
	blockSelector: z.string().required(false),
	/** Selector list forced left-to-right. */
	islandSelector: z.string().required(false),
	/** Sidebar rows to probe when `autoSidebar` is on. */
	sidebarSelector: z.string().required(false),
	/** Newline-separated selectors pinned left-to-right. */
	forceLtrSelector: z.string().required(false),
	/** Newline-separated selectors pinned right-to-left. */
	forceRtlSelector: z.string().required(false),
	/** Newline-separated selectors the probe never touches. */
	ignoreSelector: z.string().required(false)
});
//#endregion

//#region host half
/**
* Register the durable direction section when a settings provider exists.
* The browser half owns every direction decision (`<html dir>` driver, the
* Settings row and section, the generated RTL override layer and the AUTO
* text probe); the host only owns the persistence slot they write into.
* @param ctx - Host context whose optional settings service owns the section.
*/
function apply(ctx) {
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.register(DIRECTION_SETTINGS_NAMESPACE, DirectionSettingsSchema);
	});
}
//#endregion

export {
	DIRECTION_COMPOSER_PATTERN,
	DIRECTION_FIELDS,
	DIRECTION_ID_PATTERN,
	DIRECTION_PREFERENCE_FIELD,
	DIRECTION_SETTINGS_NAMESPACE,
	DIRECTION_THRESHOLD_MAX,
	DIRECTION_THRESHOLD_MIN,
	apply
};
