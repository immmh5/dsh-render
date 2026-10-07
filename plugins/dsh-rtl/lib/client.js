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

const DICT = {
 "en": {
  "direction.title": "Text direction",
  "direction.rtl": "Right to left",
  "direction.auto": "Automatic",
  "direction.ltr": "Left to right",
  "direction.hint": "Applies to the whole interface. Automatic keeps the shell right-to-left and flips mostly-English blocks to left-to-right. Code, terminals, diffs, JSON and file paths stay left to right.",
  "direction.section": "Automatic text direction",
  "direction.autoHint": "The shell stays right-to-left; every block whose letters are mostly English flips to left-to-right on its own — chat messages, lists and the composer. Everything below is a knob you can change at any time.",
  "direction.group.modes": "Mode",
  "direction.group.zones": "Where it applies",
  "direction.group.detect": "Detection",
  "direction.group.perf": "Behaviour and performance",
  "direction.group.overrides": "Override rules",
  "direction.group.selectors": "Selectors (advanced)",
  "direction.group.io": "Import / export",
  "direction.autoContent": "Auto-direction for chat messages",
  "direction.autoContentHint": "Each paragraph, list item and bubble is judged on its own letters, so English replies read left-to-right while Arabic stays right-to-left.",
  "direction.autoComposer": "Auto-direction while typing",
  "direction.autoComposerHint": "While you type, the composer follows the same probe as chat messages.",
  "direction.composerMode": "Composer override",
  "direction.composerModeHint": "Auto follows the probe; RTL or LTR pins the composer no matter what you type.",
  "direction.composerMode.auto": "Auto",
  "direction.composerMode.rtl": "Pin right-to-left",
  "direction.composerMode.ltr": "Pin left-to-right",
  "direction.autoSidebar": "Auto-direction for sidebar titles",
  "direction.autoSidebarHint": "Judges each session title on its own letters. Off by default.",
  "direction.islandEnabled": "Keep code and paths left-to-right",
  "direction.islandEnabledHint": "Marks pre, code, JSON, diffs and file paths as permanent left-to-right islands inside the right-to-left shell.",
  "direction.threshold": "English-dominant threshold",
  "direction.thresholdHint": "Latin letters must reach this share (40–95%) before a block flips to left-to-right. Raise it when mixed text flips too eagerly.",
  "direction.minLetters": "Minimum letters",
  "direction.minLettersHint": "Blocks with fewer letters than this are left untouched (1–64).",
  "direction.maxLetters": "Maximum letters",
  "direction.maxLettersHint": "Skip blocks longer than this many letters; 0 means no limit.",
  "direction.flipMixed": "Flip mixed text",
  "direction.flipMixedHint": "Off: text mixing Arabic and Latin letters always stays right-to-left.",
  "direction.countDigits": "Count digits as evidence",
  "direction.countDigitsHint": "ASCII digits count as Latin and ٠–٩ as Arabic instead of being ignored.",
  "direction.debounce": "Reaction delay (ms)",
  "direction.debounceHint": "How long the probe waits after a page change (0–2000 ms, 0 = immediate).",
  "direction.observe": "Watch for new messages",
  "direction.observeHint": "Observes the thread for new content; turn it off to save work and re-probe only when you change a setting.",
  "direction.reactToInput": "React while typing",
  "direction.reactToInputHint": "Re-probes the composer on input events; off means the observer drives it alone.",
  "direction.debug": "Log decisions",
  "direction.debugHint": "Prints every direction decision to the console as [dsh-rtl] …",
  "direction.selectorsNote": "One selector per line. Leave a field empty to fall back to the default.",
  "direction.forceLtr": "Always left-to-right",
  "direction.forceLtrHint": "Selectors pinned to left-to-right, even inside an Arabic message.",
  "direction.forceRtl": "Always right-to-left",
  "direction.forceRtlHint": "Selectors pinned to right-to-left.",
  "direction.ignore": "Never touch",
  "direction.ignoreHint": "Selectors the probe must leave exactly as they are.",
  "direction.scopeSelector": "Content scope",
  "direction.scopeSelectorHint": "Container the message probe scans (default [data-conversation-scroll]).",
  "direction.composerSelector": "Composer element",
  "direction.composerSelectorHint": "Element the typing probe drives (default [data-composer-input]).",
  "direction.scanSelector": "Scan selector",
  "direction.scanSelectorHint": "Candidates visited inside the scope; blocks and leaf div/span are both listed here.",
  "direction.blockSelector": "Block list",
  "direction.blockSelectorHint": "Elements allowed to carry a flipped dir; DIV/SPAN leaves are always eligible.",
  "direction.islandSelector": "Island selector",
  "direction.islandSelectorHint": "Elements forced left-to-right whenever islands are on.",
  "direction.sidebarSelector": "Sidebar rows",
  "direction.sidebarSelectorHint": "Rows probed while sidebar auto-direction is on.",
  "direction.export": "Configuration JSON",
  "direction.exportHint": "Copy this to keep it, or paste a configuration here and press Apply to restore it on another machine.",
  "direction.refresh": "Reload from settings",
  "direction.copy": "Copy",
  "direction.import": "Apply",
  "direction.importDone": "Applied",
  "direction.importError": "Could not apply — check the JSON",
  "direction.reset": "Restore defaults",
  "direction.resetDone": "Defaults restored",
  "direction.copied": "Copied"
 },
 "ar": {
  "direction.title": "اتجاه النص",
  "direction.rtl": "من اليمين إلى اليسار",
  "direction.auto": "تلقائي",
  "direction.ltr": "من اليسار إلى اليمين",
  "direction.hint": "يطبق على الواجهة كلها. وضع «تلقائي» يبقي الواجهة من اليمين إلى اليسار ويعكس أي نص أغلبه إنجليزي إلى من اليسار إلى اليمين. الشيفرة والتيرمينال والفروقات وملفات JSON ومسارات الملفات تبقى من اليسار إلى اليمين.",
  "direction.section": "اتجاه النص التلقائي",
  "direction.autoHint": "الواجهة تبقى من اليمين إلى اليسار، وكل نص أغلب حروفه إنجليزية ينعكس تلقائيًا إلى من اليسار إلى اليمين — رسائل المحادثة والقوائم وصندوق الكتابة. كل اللي تحت من إعدادات تقدر تغيّرها في أي وقت.",
  "direction.group.modes": "الوضع",
  "direction.group.zones": "أين يطبق",
  "direction.group.detect": "الكشف",
  "direction.group.perf": "السلوك والأداء",
  "direction.group.overrides": "قواعد التجاوز",
  "direction.group.selectors": "المحددات (متقدم)",
  "direction.group.io": "استيراد / تصدير",
  "direction.autoContent": "عكس اتجاه رسائل المحادثة تلقائيًا",
  "direction.autoContentHint": "يُفحص كل فقرة وعنصر قائمة ورسالة على حدة؛ الرد الإنجليزي يُعرض من اليسار إلى اليمين والعربي يبقى من اليمين إلى اليسار.",
  "direction.autoComposer": "عكس اتجاه صندوق الكتابة أثناء الكتابة",
  "direction.autoComposerHint": "أثناء الكتابة يمشي الصندوق على نفس الفحص مثل رسائل المحادثة.",
  "direction.composerMode": "تثبيت اتجاه الصندوق",
  "direction.composerModeHint": "«تلقائي» يعتمد الفحص؛ «من اليمين» أو «من اليسار» يثبّت الاتجاه مهما كتبت.",
  "direction.composerMode.auto": "تلقائي",
  "direction.composerMode.rtl": "تثبيت من اليمين إلى اليسار",
  "direction.composerMode.ltr": "تثبيت من اليسار إلى اليمين",
  "direction.autoSidebar": "عكس اتجاه عناوين القائمة الجانبية",
  "direction.autoSidebarHint": "يقيس كل عنوان جلسة بحروفه هو. معطّل افتراضيًا.",
  "direction.islandEnabled": "إبقاء الشيفرة والمسارات من اليسار إلى اليمين",
  "direction.islandEnabledHint": "يعلّم pre والشيفرة وJSON والفروقات ومسارات الملفات كجزر ثابتة من اليسار إلى اليمين داخل واجهة من اليمين إلى اليسار.",
  "direction.threshold": "نسبة الأغلبية الإنجليزية",
  "direction.thresholdHint": "لازم تصل نسبة الحروف اللاتينية لهذا الحد (40–95%) قبل ينعكس النص. ارفعها إذا انعكس نص مختلط بسرعة.",
  "direction.minLetters": "أقل عدد حروف",
  "direction.minLettersHint": "النصوص اللي حروفها أقل من هذا العدد تُترك كما هي (1–64).",
  "direction.maxLetters": "أقصى عدد حروف",
  "direction.maxLettersHint": "تجاهل النصوص الأطول من هذا العدد من الحروف؛ الصفر يعني بدون حد.",
  "direction.flipMixed": "عكس النص المختلط",
  "direction.flipMixedHint": "عند الإيقاف: أي نص فيه حروف عربية ولاتينية يبقى من اليمين إلى اليسار.",
  "direction.countDigits": "احتساب الأرقام في الحكم",
  "direction.countDigitsHint": "الأرقام 0–9 تُحسب لاتينية و٠–٩ عربية بدل ما تتجاهل.",
  "direction.debounce": "تأخير الاستجابة (مللي ثانية)",
  "direction.debounceHint": "كم ينتظر الفحص بعد أي تغيير في الصفحة (0–2000، والصفر يعني فوري).",
  "direction.observe": "مراقبة الرسائل الجديدة",
  "direction.observeHint": "يشغّل مراقبة الصفحة؛ أوقفه لتوفير المعالجة، ويُعاد الفحص فقط عند تغيير إعداد.",
  "direction.reactToInput": "الاستجابة أثناء الكتابة",
  "direction.reactToInputHint": "يعيد فحص الصندوق مع كل ضغطة مفتاح؛ الإيقاف يعني الاعتماد على المراقبة فقط.",
  "direction.debug": "تسجيل القرارات",
  "direction.debugHint": "يطبع كل قرار اتجاه في وحدة التحكم بصيغة [dsh-rtl] …",
  "direction.selectorsNote": "محدد واحد في كل سطر. اترك الحقل فارغًا ليرجع للقيمة الافتراضية.",
  "direction.forceLtr": "دائمًا من اليسار إلى اليمين",
  "direction.forceLtrHint": "محددات تُجبر من اليسار إلى اليمين حتى لو كانت داخل رسالة عربية.",
  "direction.forceRtl": "دائمًا من اليمين إلى اليسار",
  "direction.forceRtlHint": "محددات تُجبر من اليمين إلى اليسار.",
  "direction.ignore": "لا تلمسها",
  "direction.ignoreHint": "محددات يتركها الفحص كما هي تمامًا.",
  "direction.scopeSelector": "نطاق فحص الرسائل",
  "direction.scopeSelectorHint": "الحاوية اللي يمسحها فحص الرسائل (الافتراضي [data-conversation-scroll]).",
  "direction.composerSelector": "عنصر صندوق الكتابة",
  "direction.composerSelectorHint": "العنصر الذي يقوده فحص الكتابة (الافتراضي [data-composer-input]).",
  "direction.scanSelector": "محدد المسح",
  "direction.scanSelectorHint": "العناصر اللي يزورها الفحص داخل النطاق، وبها تُجمع الفقرات وأوراق div/span.",
  "direction.blockSelector": "قائمة الفقرات",
  "direction.blockSelectorHint": "العناصر المسموح لها بحمل dir معكوس؛ أوراق DIV/SPAN مؤهلة دائمًا.",
  "direction.islandSelector": "محدد الجزر",
  "direction.islandSelectorHint": "العناصر اللي تُجبر من اليسار إلى اليمين طالما الجزر مفعّلة.",
  "direction.sidebarSelector": "صفوف القائمة الجانبية",
  "direction.sidebarSelectorHint": "الصفوف اللي يفحصها الوضع التلقائي للقائمة الجانبية.",
  "direction.export": "الإعدادات بصيغة JSON",
  "direction.exportHint": "انسخ هذا للحفظ، أو الصق إعدادات هنا واضغط «تطبيق» عشان ترجّعها على جهاز ثاني.",
  "direction.refresh": "تحديث من الإعدادات",
  "direction.copy": "نسخ",
  "direction.import": "تطبيق",
  "direction.importDone": "تم التطبيق",
  "direction.importError": "ما انطبق — تأكد من صيغة JSON",
  "direction.reset": "استعادة الافتراضي",
  "direction.resetDone": "رجعنا للإعدادات الافتراضية",
  "direction.copied": "تم النسخ"
 },
 "zh": {
  "direction.title": "文字方向",
  "direction.rtl": "从右到左",
  "direction.auto": "自动",
  "direction.ltr": "从左到右",
  "direction.hint": "作用于整个界面。自动模式保持界面从右到左，并把以英文为主的文本块翻转为从左到右。代码、终端、差异、JSON 和文件路径始终从左到右。",
  "direction.section": "自动文字方向",
  "direction.autoHint": "界面保持从右到左，而字母以英文为主的文本块会自行翻转为从左到右——聊天消息、列表和输入框。下面的所有项都是随时可改的设置。",
  "direction.group.modes": "模式",
  "direction.group.zones": "作用范围",
  "direction.group.detect": "判定",
  "direction.group.perf": "行为与性能",
  "direction.group.overrides": "覆盖规则",
  "direction.group.selectors": "选择器（高级）",
  "direction.group.io": "导入 / 导出",
  "direction.autoContent": "聊天消息自动方向",
  "direction.autoContentHint": "每段文字、列表项和气泡单独判定，因此英文回复从左到右，阿拉伯文保持从右到左。",
  "direction.autoComposer": "输入时自动方向",
  "direction.autoComposerHint": "输入时，输入框与聊天消息使用相同的判定。",
  "direction.composerMode": "固定输入框方向",
  "direction.composerModeHint": "“自动”跟随判定；“从右到左”或“从左到右”无论输入什么都固定不变。",
  "direction.composerMode.auto": "自动",
  "direction.composerMode.rtl": "固定从右到左",
  "direction.composerMode.ltr": "固定从左到右",
  "direction.autoSidebar": "侧栏标题自动方向",
  "direction.autoSidebarHint": "按每个会话标题自身的字母判定。默认关闭。",
  "direction.islandEnabled": "代码与路径保持从左到右",
  "direction.islandEnabledHint": "把 pre、代码、JSON、差异和文件路径标记为始终从左到右的孤岛。",
  "direction.threshold": "英文占优阈值",
  "direction.thresholdHint": "拉丁字母需要达到该比例（40–95%）才会翻转为从左到右。混合文本翻转过快时调高它。",
  "direction.minLetters": "最少字母数",
  "direction.minLettersHint": "字母数少于该值的文本块保持不动（1–64）。",
  "direction.maxLetters": "最多字母数",
  "direction.maxLettersHint": "超过该字母数的文本块跳过；0 表示不限制。",
  "direction.flipMixed": "翻转混合文本",
  "direction.flipMixedHint": "关闭后：同时含阿拉伯字母和拉丁字母的文本始终从右到左。",
  "direction.countDigits": "把数字计入判定",
  "direction.countDigitsHint": "0–9 计为拉丁，٠–٩ 计为阿拉伯，而不是忽略。",
  "direction.debounce": "响应延迟（毫秒）",
  "direction.debounceHint": "页面变化后判定等待多久（0–2000 毫秒，0 表示立即）。",
  "direction.observe": "监视新消息",
  "direction.observeHint": "观察会话内容变化；关闭可省资源，只在改动设置时重新判定。",
  "direction.reactToInput": "输入时响应",
  "direction.reactToInputHint": "输入事件会重新判定输入框；关闭后只由监视器驱动。",
  "direction.debug": "记录判定",
  "direction.debugHint": "把每次方向判定以 [dsh-rtl] … 输出到控制台。",
  "direction.selectorsNote": "每行一个选择器。留空则使用默认值。",
  "direction.forceLtr": "始终从左到右",
  "direction.forceLtrHint": "强制从左到右的选择器，即使位于阿拉伯文消息内。",
  "direction.forceRtl": "始终从右到左",
  "direction.forceRtlHint": "强制从右到左的选择器。",
  "direction.ignore": "完全不处理",
  "direction.ignoreHint": "判定完全不会碰的选择器。",
  "direction.scopeSelector": "内容范围",
  "direction.scopeSelectorHint": "消息判定扫描的容器（默认 [data-conversation-scroll]）。",
  "direction.composerSelector": "输入框元素",
  "direction.composerSelectorHint": "输入判定驱动的元素（默认 [data-composer-input]）。",
  "direction.scanSelector": "扫描选择器",
  "direction.scanSelectorHint": "在范围内访问的候选元素，块级与叶子 div/span 都列在这里。",
  "direction.blockSelector": "文本块列表",
  "direction.blockSelectorHint": "允许携带翻转 dir 的元素；DIV/SPAN 叶子始终合格。",
  "direction.islandSelector": "孤岛选择器",
  "direction.islandSelectorHint": "开启孤岛时强制从左到右的元素。",
  "direction.sidebarSelector": "侧栏行",
  "direction.sidebarSelectorHint": "侧栏自动方向开启时被判定的行。",
  "direction.export": "配置 JSON",
  "direction.exportHint": "复制以备份，或在此粘贴配置后按“应用”，即可在另一台机器上恢复。",
  "direction.refresh": "从设置重新载入",
  "direction.copy": "复制",
  "direction.import": "应用",
  "direction.importDone": "已应用",
  "direction.importError": "无法应用——请检查 JSON",
  "direction.reset": "恢复默认",
  "direction.resetDone": "已恢复默认设置",
  "direction.copied": "已复制"
 }
};

const ROW_CSS = ".dshrtl_row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}\n.dshrtl_rowText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:48px;display:flex}\n.dshrtl_title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}\n.dshrtl_hint{color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));font-size:12px;font-weight:400;line-height:18px}\n.dshrtl_selector{background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;border-radius:18px;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}\n.dshrtl_selector:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.dshrtl_chevron{flex:none}\n\n/* Settings section: the AUTO direction panel. */\n.dshrtl_sec{display:flex;flex-direction:column;gap:16px}\n.dshrtl_secHead{display:flex;flex-direction:column;gap:4px}\n.dshrtl_secTitle{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:500;line-height:22px}\n.dshrtl_secNote{color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));font-size:12px;line-height:18px}\n.dshrtl_box{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:12px}\n.dshrtl_field{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}\n.dshrtl_fieldText{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}\n.dshrtl_label{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}\n.dshrtl_sub{color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));font-size:12px;line-height:18px}\n.dshrtl_pills{display:flex;gap:6px;flex-wrap:wrap}\n.dshrtl_pill{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;height:32px;padding:0 12px;font:inherit;font-size:13px;cursor:pointer}\n.dshrtl_pill:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.dshrtl_pill[data-on=\"true\"]{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-module-platform));border-color:transparent;font-weight:500}\n.dshrtl_num{width:96px;height:32px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:0 8px;font:inherit;font-size:13px;text-align:center}\n.dshrtl_check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary)}\n.dshrtl_switch{cursor:pointer}\n.dshrtl_switch input{accent-color:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-label-primary));cursor:pointer;flex:none;height:16px;width:16px}\n\n/* Collapsible groups: every direction knob lives in one of these. */\n.dshrtl_group{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;display:flex;flex-direction:column;overflow:hidden}\n.dshrtl_sum{align-items:center;cursor:pointer;display:flex;font-size:13px;font-weight:500;gap:8px;list-style:none;padding:10px 12px;user-select:none;color:var(--dsw-alias-label-primary)}\n.dshrtl_sum::-webkit-details-marker{display:none}\n.dshrtl_sum::after{content:\"›\";font-size:15px;line-height:1;margin-inline-start:auto;opacity:.55;transform:rotate(90deg);transition:transform .15s ease}\n.dshrtl_group[open]>.dshrtl_sum::after{transform:rotate(-90deg)}\n.dshrtl_group>.dshrtl_box{border:none;border-radius:0;border-top:.5px solid var(--dsw-alias-border-l2)}\n.dshrtl_textareaRow{display:flex;flex-direction:column;gap:6px}\n.dshrtl_area{direction:ltr;text-align:left;background:var(--dsw-alias-bg-module-platform);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:18px;min-height:56px;padding:8px;resize:vertical;width:100%}\n.dshrtl_areaTall{min-height:160px}\n.dshrtl_select{background:var(--dsw-alias-bg-module-platform);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;height:32px;min-width:132px;padding:0 8px}\n.dshrtl_numWide{width:116px}\n.dshrtl_btns{align-items:center;display:flex;flex-wrap:wrap;gap:8px}\n.dshrtl_btn{background:var(--dsw-alias-bg-module-platform);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:13px;height:32px;padding:0 12px}\n.dshrtl_btn:hover{background:var(--dsw-alias-interactive-bg-hover)}\n.dshrtl_btnDanger{border-color:var(--dsw-alias-semantic-danger-border,var(--dsw-alias-border-l2));color:var(--dsw-alias-semantic-danger-fg,var(--dsw-alias-label-primary))}\n.dshrtl_status{color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));font-size:12px}\n";
const ROW_TAG = "dsh-rtl/DirectionRow.css";
const DRIVER_CSS = "/* Layout drag handles only: their inline `left` is mirrored into\n   --dsh-h-start by the driver, which RTL consumes as `right`. Scoped to the\n   two handle sides so tooltips and the chat width handles keep their own\n   inline positioning. */\nhtml[dir=\"rtl\"] [data-side=\"sidebar\"],\nhtml[dir=\"rtl\"] [data-side=\"rightbar\"] {\n	left: auto !important;\n	right: var(--dsh-h-start, 0px) !important;\n	margin-left: 0 !important;\n	margin-right: -4px !important;\n	transition: right var(--ds-transition-duration-slow, 0.25s) var(--ds-ease-in-out, ease) !important;\n}\n\n/* A tooltip flipped to the anchor's left side is centred like the right one. */\nhtml[dir=\"rtl\"] [role=\"tooltip\"][data-side=\"left\"] {\n	transform: translateY(-50%);\n}\n\nhtml[dir=\"rtl\"] [data-dsh-text-zone=\"ltr\"] {\n	direction: ltr !important;\n	text-align: left !important;\n	unicode-bidi: isolate;\n}\n\nhtml[dir=\"rtl\"] .dshrtl_rowText {\n	padding-right: 0 !important;\n	padding-left: 48px !important;\n}\n";
const DRIVER_TAG = "dsh-rtl/driver.css";
const RTL_CSS = "/* dsh-rtl: generated RTL override layer -- do not edit; run install.sh */\n/* scanned 132 css blobs from dsh-web-frontend and 65 dsh.client packages */\n\n/* ---- LTR islands: code, terminals, diffs, JSON, file paths ---- */\nhtml[dir=\"rtl\"] .md-code-block { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }\nhtml[dir=\"rtl\"] [data-files-path] { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }\nhtml[dir=\"rtl\"] .Y0dWHa_jsonPayload { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }\nhtml[dir=\"rtl\"] .Y0dWHa_jsonPreview { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }\nhtml[dir=\"rtl\"] .Y0dWHa_promptDiff { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }\nhtml[dir=\"rtl\"] .Y0dWHa_resultBlockText { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }\nhtml[dir=\"rtl\"] .Y0dWHa_sourceBlockContent { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }\nhtml[dir=\"rtl\"] .o3BgMG_codeBody { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }\nhtml[dir=\"rtl\"] .o3BgMG_diffBody { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }\nhtml[dir=\"rtl\"] .o3BgMG_terminalBody { direction: ltr !important; text-align: left !important; unicode-bidi: isolate; }\n\n/* ---- Arabic interface fonts ---- */\nhtml[dir=\"rtl\"] {\n	--dsw-font-family: \"Noto Sans Arabic\", \"Noto Kufi Arabic\", \"Geeza Pro\", \"Segoe UI\", Tahoma, -apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Helvetica Neue\", Arial, sans-serif !important;\n	--ds-font-family: \"Noto Sans Arabic\", \"Noto Kufi Arabic\", \"Geeza Pro\", \"Segoe UI\", Tahoma, -apple-system, BlinkMacSystemFont, \"PingFang SC\", \"Helvetica Neue\", Arial, sans-serif !important;\n}\n\n/* ---- mirrored declarations ---- */\nhtml[dir=\"rtl\"] ._leading_luwio_29 { margin-right: 0 !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] ._list_1nxmc_8:not(._portal_1nxmc_44) { left: auto; right: 0 }\nhtml[dir=\"rtl\"] ._portal_1nxmc_44 { right: auto }\nhtml[dir=\"rtl\"] ._alignEnd_1nxmc_57:not(._portal_1nxmc_44) { left: 0; right: auto }\nhtml[dir=\"rtl\"] ._item_1nxmc_92 { text-align: right !important }\nhtml[dir=\"rtl\"] ._submenu_1nxmc_9 { left: auto; right: calc(100% + 10px) }\nhtml[dir=\"rtl\"] ._submenu_1nxmc_9:before { left: auto; right: -10px }\nhtml[dir=\"rtl\"] ._header_w1urq_45 { padding-right: 24px !important; padding-left: 14px !important }\nhtml[dir=\"rtl\"] ._label_1ycze_51 { text-align: right !important }\nhtml[dir=\"rtl\"] ._dots_1ycze_78 { text-align: right !important }\nhtml[dir=\"rtl\"] ._refIcon_z12h9_36 { margin-right: 0 !important; margin-left: 4px !important }\nhtml[dir=\"rtl\"] ._expandedTopLevel_4qrvp_39 { padding-right: 14px !important; padding-left: 8px !important }\nhtml[dir=\"rtl\"] ._row_4qrvp_55._topLevelBracket_4qrvp_46 { margin-right: 0 !important; padding-right: 0 !important }\nhtml[dir=\"rtl\"] ._row_4qrvp_55 { padding-right: 10px !important; padding-left: 0 !important }\nhtml[dir=\"rtl\"] ._label_4qrvp_95 { margin-right: 0 !important; margin-left: 3px !important }\nhtml[dir=\"rtl\"] ._expander_4qrvp_78 { left: auto; right: 0 }\nhtml[dir=\"rtl\"] ._expander_4qrvp_78:before { border-left-width: 0 !important; border-left-style: none !important; border-right-width: 6px !important; border-right-style: solid !important; border-right-color: currentColor !important }\nhtml[dir=\"rtl\"] ._block_1gdtu_1 { padding-left: 0 !important; padding-right: var(--dsl-terminal-gutter) !important }\nhtml[dir=\"rtl\"] ._header_1gdtu_32 { margin-left: 0 !important; padding-right: var(--dsl-terminal-gutter) !important; padding-left: 14px !important; margin-right: calc(-1 * var(--dsl-terminal-gutter)) !important }\nhtml[dir=\"rtl\"] ._runState_1gdtu_91 { left: auto; right: calc(-1 * var(--dsl-terminal-gutter) + 8px) }\nhtml[dir=\"rtl\"] ._output_1gdtu_156 { padding-right: 0 !important; padding-left: 14px !important }\nhtml[dir=\"rtl\"] ._expand_1gdtu_185 { text-align: right !important }\nhtml[dir=\"rtl\"] ._empty_1gdtu_201 { padding-right: 0 !important; padding-left: 14px !important }\nhtml[dir=\"rtl\"] ._gutter_onbk6_82 { padding-right: 0 !important; text-align: left !important; padding-left: 14px !important }\nhtml[dir=\"rtl\"] ._expand_onbk6_97 { padding-right: var(--dsl-read-gutter) !important; padding-left: 0 !important; text-align: right !important }\nhtml[dir=\"rtl\"] ._copyButton_12o37_16 { right: auto; left: 12px }\nhtml[dir=\"rtl\"] ._path_12o37_47 { padding-right: 0 !important; padding-left: 56px !important }\nhtml[dir=\"rtl\"] ._expand_12o37_79 { text-align: right !important }\nhtml[dir=\"rtl\"] ._body_1h7p4_43 { padding-right: 0 !important; padding-left: 14px !important }\nhtml[dir=\"rtl\"] ._line_1h7p4_52 { padding-left: 0 !important; padding-right: 14px !important }\nhtml[dir=\"rtl\"] ._fileHeader_1h7p4_66 { text-align: right !important }\nhtml[dir=\"rtl\"] ._expand_1h7p4_92 { text-align: right !important }\nhtml[dir=\"rtl\"] ._linkIcon_kcgor_92 { margin-right: 0 !important; margin-left: 5px !important }\nhtml[dir=\"rtl\"] ._markdown_kcgor_5 :where(ul,ol) { padding-left: 0 !important; padding-right: 18px !important }\nhtml[dir=\"rtl\"] ._markdown_kcgor_5 :where(ul,ol) ol { padding-right: 0 !important }\nhtml[dir=\"rtl\"] ._markdown_kcgor_5 blockquote { border-left-width: 0 !important; border-left-style: none !important; border-left-color: currentColor !important; padding-left: 0 !important; padding-right: 14px !important; border-right-width: 2px !important; border-right-style: solid !important; border-right-color: var(--dsw-alias-label-caption) !important }\nhtml[dir=\"rtl\"] ._markdown_kcgor_5 input[type=checkbox] { margin-right: 0 !important; margin-left: 8px !important }\nhtml[dir=\"rtl\"] ._tableScroll_kcgor_190 th:first-child, html[dir=\"rtl\"] ._tableScroll_kcgor_190 td:first-child { padding-right: 0 !important }\nhtml[dir=\"rtl\"] ._tableScroll_kcgor_190 td:last-child { padding-left: 0 !important }\nhtml[dir=\"rtl\"] ._sources_19q7d_40 { padding-left: 0 !important; padding-right: 2.5em !important }\nhtml[dir=\"rtl\"] ._linkIcon_19q7d_65 { margin-right: 0 !important; margin-left: 5px !important }\nhtml[dir=\"rtl\"] ._splitRow_17p4l_24>._divider_17p4l_39:before { left: auto; right: -.25px }\nhtml[dir=\"rtl\"] ._tabStrip_17p4l_156 { padding-right: 10px !important; padding-left: 6px !important }\nhtml[dir=\"rtl\"] ._stripChrome_17p4l_212 { margin-left: 0 !important; margin-right: 4px !important }\nhtml[dir=\"rtl\"] ._tabClose_17p4l_314 { right: auto; left: 4px }\nhtml[dir=\"rtl\"] ._menuItem_17p4l_460 { text-align: right !important }\nhtml[dir=\"rtl\"] ._dockHint_17p4l_500[data-dockkit-dock-zone=left] { left: auto; right: 0 }\nhtml[dir=\"rtl\"] ._dockHint_17p4l_500[data-dockkit-dock-zone=right] { right: auto; left: 0 }\nhtml[dir=\"rtl\"] [data-dockkit-drop-zones=horizontal] ._dockHint_17p4l_500[data-dockkit-dock-zone=left] { padding-right: 0 !important; padding-left: 4px !important }\nhtml[dir=\"rtl\"] [data-dockkit-drop-zones=horizontal] ._dockHint_17p4l_500[data-dockkit-dock-zone=right] { padding-left: 0 !important; padding-right: 4px !important }\nhtml[dir=\"rtl\"] ._floatResize_17p4l_696 { right: auto; left: 0 }\nhtml[dir=\"rtl\"] ._floatResize_17p4l_696:after { right: auto; border-right-width: 0 !important; border-right-style: none !important; border-right-color: currentColor !important; border-bottom-right-radius: 0 !important; left: 4px; border-left-width: 1.5px !important; border-left-style: solid !important; border-left-color: var(--dsw-alias-label-caption) !important; border-bottom-left-radius: 16px !important }\nhtml[dir=\"rtl\"] .katex .vlist-t2 { margin-right: 0 !important; margin-left: -2px !important }\nhtml[dir=\"rtl\"] .katex .msupsub { text-align: right !important }\nhtml[dir=\"rtl\"] .katex .llap>.inner { right: auto; left: 0 }\nhtml[dir=\"rtl\"] .katex .clap>.inner, html[dir=\"rtl\"] .katex .rlap>.inner { left: auto; right: 0 }\nhtml[dir=\"rtl\"] .katex .clap>.inner>span { margin-left: 50% !important; margin-right: -50% !important }\nhtml[dir=\"rtl\"] .katex .sqrt>.root { margin-left: -.5555555556em !important; margin-right: .2777777778em !important }\nhtml[dir=\"rtl\"] .katex .mtable .col-align-l>.vlist-t { text-align: right !important }\nhtml[dir=\"rtl\"] .katex .mtable .col-align-r>.vlist-t { text-align: left !important }\nhtml[dir=\"rtl\"] .katex .svg-align { text-align: right !important }\nhtml[dir=\"rtl\"] .katex .halfarrow-left { left: auto; right: 0 }\nhtml[dir=\"rtl\"] .katex .halfarrow-right { right: auto; left: 0 }\nhtml[dir=\"rtl\"] .katex .brace-left { left: auto; right: 0 }\nhtml[dir=\"rtl\"] .katex .brace-center { left: auto; right: 25% }\nhtml[dir=\"rtl\"] .katex .brace-right { right: auto; left: 0 }\nhtml[dir=\"rtl\"] .katex .cd-arrow-pad { padding-right: .27778em !important; padding-left: .55556em !important }\nhtml[dir=\"rtl\"] .katex .angl { border-right-width: 0 !important; border-right-style: none !important; margin-right: 0 !important; margin-left: .03889em !important; border-left-width: .049em !important; border-left-style: solid !important }\nhtml[dir=\"rtl\"] .katex .cd-label-left { right: auto; text-align: right !important; left: calc(50% + .3em) }\nhtml[dir=\"rtl\"] .katex .cd-label-right { left: auto; text-align: left !important; right: calc(50% + .3em) }\nhtml[dir=\"rtl\"] .katex-display>.katex>.katex-html>.tag { right: auto; left: 0 }\nhtml[dir=\"rtl\"] .katex-display.leqno>.katex>.katex-html>.tag { left: auto; right: 0 }\nhtml[dir=\"rtl\"] .katex-display.fleqn>.katex { padding-left: 0 !important; text-align: right !important; padding-right: 2em !important }\nhtml[dir=\"rtl\"] .hVGvvW_rowText { padding-right: 0 !important; padding-left: 48px !important }\nhtml[dir=\"rtl\"] .SVAs4q_label { padding-right: 0 !important; padding-left: 2px !important }\nhtml[dir=\"rtl\"] .rtSEdW_brokenTip { text-align: right !important; left: auto; right: 0 }\nhtml[dir=\"rtl\"] .rtSEdW_cardMain { text-align: right !important }\nhtml[dir=\"rtl\"] .rtSEdW_inUse { margin-left: 0 !important; margin-right: auto !important }\nhtml[dir=\"rtl\"] .rtSEdW_iconButton:after { left: auto; right: 50% }\nhtml[dir=\"rtl\"] .JVDQca_remove { right: auto; left: 4px }\nhtml[dir=\"rtl\"] .JVDQca_arrowLeft { left: auto; right: 4px }\nhtml[dir=\"rtl\"] .JVDQca_arrowRight { right: auto; left: 4px }\nhtml[dir=\"rtl\"] .gSkjMW_card { text-align: right !important }\nhtml[dir=\"rtl\"] .gSkjMW_retry { text-align: right !important }\nhtml[dir=\"rtl\"] .gSkjMW_remove { right: auto; left: 6px }\nhtml[dir=\"rtl\"] .gSkjMW_card:hover .gSkjMW_name, html[dir=\"rtl\"] .gSkjMW_card:focus-within .gSkjMW_name { padding-right: 0 !important; padding-left: 18px !important }\nhtml[dir=\"rtl\"] .fNh4Da_close { right: auto; left: 20px }\nhtml[dir=\"rtl\"] ._54WpYG_remove { right: auto; left: 4px }\nhtml[dir=\"rtl\"] .Sixlwa_compactionButton { text-align: right !important }\nhtml[dir=\"rtl\"] .Sixlwa_compactionLeading { margin-right: 0 !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] .Sixlwa_compactionBody { padding-right: calc(22px + var(--dsh-content-font-delta,0px)) !important; padding-left: 0 !important }\nhtml[dir=\"rtl\"] .Sixlwa_retryDetails { padding-left: 0 !important; padding-right: 14px !important }\nhtml[dir=\"rtl\"] .Sixlwa_turnErrorTitle { margin-right: 0 !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] .Sixlwa_maxTokensTitle { margin-right: 0 !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] .XrJvXW_body { margin-right: calc(22px + var(--dsh-content-font-delta,0px)) !important; margin-left: 0 !important; padding-right: 12px !important; padding-left: 16px !important }\nhtml[dir=\"rtl\"] .xzv4MW_timeStart { padding-right: 0 !important; padding-left: 12px !important }\nhtml[dir=\"rtl\"] .EvIC1a_turnStatusClock { margin-left: 0 !important; margin-right: 8px !important }\nhtml[dir=\"rtl\"] .EvIC1a_toBottomSlot { padding-right: 0 !important; padding-left: max(0px, calc((100% - var(--dsh-chat-content-width)) / 2)) !important }\nhtml[dir=\"rtl\"] .eGxaPq_frame { right: auto; left: calc(12px - (var(--dsh-composer-side-clearance) + 16px)) }\nhtml[dir=\"rtl\"] .eGxaPq_mark { right: auto; left: 0 }\nhtml[dir=\"rtl\"] .eGxaPq_preview { right: auto; left: calc(100% + 10px) }\n@keyframes lcKema_dsh-reasoning-row-sweep{\n0% { left: auto; right: -300px }\n}\n@keyframes lcKema_dsh-reasoning-row-sweep{\n90%,to { left: auto; right: 100% }\n}\nhtml[dir=\"rtl\"] .lcKema_thinkBody { padding-right: calc(22px + var(--dsh-content-font-delta,0px)) !important; padding-left: 0 !important }\nhtml[dir=\"rtl\"] .hWmORq_body .md-table-wide { margin-left: 0 !important; padding-left: 0 !important; margin-right: calc(-1 * var(--dsh-table-lead)) !important; padding-right: var(--dsh-table-lead) !important }\nhtml[dir=\"rtl\"] .hWmORq_actions { margin-left: 0 !important; margin-right: -6px !important }\n@keyframes _5OnbHa_dsh-command-row-sweep{\n0% { left: auto; right: -300px }\n}\n@keyframes _5OnbHa_dsh-command-row-sweep{\n90%,to { left: auto; right: 100% }\n}\nhtml[dir=\"rtl\"] ._5OnbHa_body { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .l_V-RG_root { text-align: right !important }\nhtml[dir=\"rtl\"] .l_V-RG_chevron { margin-left: 0 !important; margin-right: 6px !important }\nhtml[dir=\"rtl\"] .Q51KRG_root+.Q51KRG_root { margin-left: 0 !important; margin-right: -6px !important }\n@media (width<=480px){\nhtml[dir=\"rtl\"] .Q51KRG_root+.Q51KRG_root { margin-right: 0 !important }\n}\nhtml[dir=\"rtl\"] .bRhRbq_details dd { text-align: left !important }\nhtml[dir=\"rtl\"] .TS9iAW_actions { margin-left: 0 !important; margin-right: -6px !important }\nhtml[dir=\"rtl\"] .lats3W_rowText { padding-right: 0 !important; padding-left: 48px !important }\nhtml[dir=\"rtl\"] .mufS8W_card { left: auto; right: 0 }\nhtml[dir=\"rtl\"] ._7yHdaG_header { text-align: right !important }\nhtml[dir=\"rtl\"] ._7yHdaG_row { padding-right: 12px !important; padding-left: 5px !important }\nhtml[dir=\"rtl\"] .T1PP_q_rowText { padding-right: 0 !important; padding-left: 48px !important }\nhtml[dir=\"rtl\"] .pXSMma_body>.pXSMma_workspaceRow { padding-left: 0 !important; padding-right: 8px !important }\nhtml[dir=\"rtl\"] .wSkVaW_header { padding-right: 20px !important; padding-left: 28px !important }\nhtml[dir=\"rtl\"] .wSkVaW_headerUtilities { margin-left: 0 !important; margin-right: 20px !important }\nhtml[dir=\"rtl\"] .wSkVaW_headerCorner { margin-left: -16px !important; margin-right: 8px !important }\nhtml[dir=\"rtl\"] .wSkVaW_tabs { padding-left: 0 !important; padding-right: 8px !important }\nhtml[dir=\"rtl\"] .wSkVaW_widthHandle[data-side=left] { right: auto; left: calc(50% + var(--dsh-chat-content-width) / 2 + 24px) }\nhtml[dir=\"rtl\"] .wSkVaW_widthHandle[data-side=right] { left: auto; right: calc(50% + var(--dsh-chat-content-width) / 2 + 24px) }\nhtml[dir=\"rtl\"] .wSkVaW_widthHandle[data-side=left]:after { right: auto; left: 16px }\nhtml[dir=\"rtl\"] .wSkVaW_widthHandle[data-side=right]:after { left: auto; right: 16px }\nhtml[dir=\"rtl\"] .wSkVaW_scrollBody { margin-right: 0 !important; margin-left: 2px !important }\nhtml[dir=\"rtl\"] .wSkVaW_scrollBody:has([data-conversation-composer-overlay])>.wSkVaW_composerSeat { right: 0; left: var(--dsh-scrollbar-width) }\nhtml[dir=\"rtl\"] .wSkVaW_heroWorkspaceRow { padding-right: 20px !important; padding-left: 16px !important }\nhtml[dir=\"rtl\"] .JObwrW_panel { right: auto; left: 0 }\nhtml[dir=\"rtl\"] .JObwrW_figures { margin-left: 0 !important; margin-right: auto !important }\nhtml[dir=\"rtl\"] .JObwrW_swatch { margin-right: 0 !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] .Sh0Q9G_trigger { padding-right: 8px !important; padding-left: 4px !important }\nhtml[dir=\"rtl\"] .uV2eYG_scroll { margin-right: 0 !important; margin-left: 4px !important }\nhtml[dir=\"rtl\"] .uV2eYG_input { padding-right: 14px !important; padding-left: 8px !important }\nhtml[dir=\"rtl\"] .uV2eYG_placeholder { right: 14px; left: 8px }\nhtml[dir=\"rtl\"] .uV2eYG_trailing { margin-left: 0 !important; margin-right: auto !important }\nhtml[dir=\"rtl\"] .uV2eYG_retry { margin-left: 0 !important; margin-right: 8px !important }\nhtml[dir=\"rtl\"] .lXshSW_header { text-align: right !important }\nhtml[dir=\"rtl\"] .cvtE3a_icon { margin-right: 0 !important; margin-left: 8px !important }\nhtml[dir=\"rtl\"] .cvtE3a_status { margin-left: 0 !important; margin-right: 8px !important }\nhtml[dir=\"rtl\"] .cvtE3a_inspect { margin-left: 0 !important; margin-right: 4px !important }\nhtml[dir=\"rtl\"] .gNWCoW_purpose { margin-left: 0 !important; margin-right: 8px !important }\nhtml[dir=\"rtl\"] .gNWCoW_requestError { margin-left: 0 !important; margin-right: 8px !important }\nhtml[dir=\"rtl\"] .gNWCoW_readout { margin-left: 0 !important; margin-right: 8px !important }\nhtml[dir=\"rtl\"] .gNWCoW_panelHint { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .gNWCoW_approvalPrompt { margin-left: 0 !important; margin-right: 8px !important }\nhtml[dir=\"rtl\"] .gNWCoW_notice { margin-left: 0 !important; margin-right: 8px !important }\nhtml[dir=\"rtl\"] .gNWCoW_sourceCard { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .gNWCoW_codeSection { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .gNWCoW_inspectButton { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .Nqubda_badge { padding-right: 8px !important; padding-left: 10px !important }\nhtml[dir=\"rtl\"] .Nqubda_badgeCount { margin-left: 0 !important; margin-right: auto !important }\nhtml[dir=\"rtl\"] .Nqubda_transitionActions { margin-left: 0 !important; margin-right: auto !important }\nhtml[dir=\"rtl\"] .Nqubda_doubleCheck svg:first-child { left: auto; right: 0 }\nhtml[dir=\"rtl\"] .Nqubda_doubleCheck svg:last-child { left: auto; right: 5px }\nhtml[dir=\"rtl\"] ._93YTAG_summary { margin-left: 0 !important; margin-right: 8px !important }\nhtml[dir=\"rtl\"] .nyYjTG_chevron { border-left-width: 0 !important; border-left-style: none !important; border-left-color: currentColor !important; border-right-width: .5px !important; border-right-style: solid !important; border-right-color: var(--dsw-alias-border-l3) !important }\nhtml[dir=\"rtl\"] .ZuhsRW_header { padding-right: 24px !important; padding-left: 14px !important }\nhtml[dir=\"rtl\"] .ZuhsRW_crumbBar { margin-left: 0 !important; margin-right: -9px !important }\nhtml[dir=\"rtl\"] .ZuhsRW_content { padding-right: 24px !important; padding-left: 16px !important }\nhtml[dir=\"rtl\"] .ZuhsRW_column { padding-right: 0 !important; padding-left: 8px !important }\nhtml[dir=\"rtl\"] .ZuhsRW_row { text-align: right !important }\nhtml[dir=\"rtl\"] .ZuhsRW_status, html[dir=\"rtl\"] .ZuhsRW_error { padding-right: 4px !important; padding-left: 120px !important }\nhtml[dir=\"rtl\"] .ZuhsRW_loadingFloat { right: auto; left: 16px }\nhtml[dir=\"rtl\"] .nLMEza_bar { padding-right: 12px !important; padding-left: 5px !important }\nhtml[dir=\"rtl\"] ._3e4SsG_item { text-align: right !important }\nhtml[dir=\"rtl\"] ._3e4SsG_trailing { margin-left: 0 !important; margin-right: auto !important }\nhtml[dir=\"rtl\"] .QsffPG_menu { left: auto; right: 0 }\nhtml[dir=\"rtl\"] .pI_x6G_sidebarCol { border-right-width: 0 !important; border-right-style: none !important; border-right-color: currentColor !important; border-left-width: .5px !important; border-left-style: solid !important; border-left-color: var(--dsw-alias-border-l3) !important }\nhtml[dir=\"rtl\"] .pI_x6G_handle { transition: right var(--ds-transition-duration-slow) var(--ds-ease-in-out) !important; margin-left: 0 !important; margin-right: -4px !important }\nhtml[dir=\"rtl\"] ._8_XoUG_failure { padding-left: 0 !important; padding-right: 4px !important }\nhtml[dir=\"rtl\"] ._7KE1Ra_trigger { padding-right: 8px !important; padding-left: 4px !important }\nhtml[dir=\"rtl\"] ._7KE1Ra_option { text-align: right !important }\nhtml[dir=\"rtl\"] ._7KE1Ra_cell { text-align: right !important }\nhtml[dir=\"rtl\"] ._7KE1Ra_cellValue { text-align: left !important }\nhtml[dir=\"rtl\"] .CAgGvG_main { padding-right: 7px !important; padding-left: 6px !important }\nhtml[dir=\"rtl\"] .CAgGvG_chevron { border-left-width: 0 !important; border-left-style: none !important; border-left-color: currentColor !important; padding-right: 4px !important; padding-left: 6px !important; border-right-width: .5px !important; border-right-style: solid !important; border-right-color: var(--dsw-alias-border-l4) !important }\nhtml[dir=\"rtl\"] .oY77xG_rowText { padding-right: 0 !important; padding-left: 48px !important }\nhtml[dir=\"rtl\"] .-\\\\34 LnlG_count { margin-left: 0 !important; margin-right: 2px !important }\nhtml[dir=\"rtl\"] .VOzbGW_trigger { padding-right: 8px !important; padding-left: 10px !important }\nhtml[dir=\"rtl\"] .VOzbGW_navCell { text-align: right !important; padding-right: 12px !important; padding-left: 16px !important }\nhtml[dir=\"rtl\"] .VOzbGW_header { padding-right: 10px !important; padding-left: 14px !important }\nhtml[dir=\"rtl\"] .VOzbGW_actions { margin-left: 0 !important; margin-right: auto !important }\nhtml[dir=\"rtl\"] .zGbnIq_rowActions { margin-left: 0 !important; margin-right: auto !important }\nhtml[dir=\"rtl\"] .zGbnIq_customizedSummary { margin-left: 0 !important; margin-right: -4px !important }\nhtml[dir=\"rtl\"] .qSYn7G_search>svg { left: auto; right: 12px }\nhtml[dir=\"rtl\"] .qSYn7G_search input { padding-right: 36px !important; padding-left: 34px !important }\nhtml[dir=\"rtl\"] .qSYn7G_cardContent { text-align: right !important }\nhtml[dir=\"rtl\"] .qSYn7G_headerEnd { margin-left: 0 !important; margin-right: auto !important }\nhtml[dir=\"rtl\"] .qSYn7G_groupToggle { text-align: right !important }\nhtml[dir=\"rtl\"] .qSYn7G_groupSub { margin-right: 20px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .YyYd_a_header { text-align: right !important }\nhtml[dir=\"rtl\"] .dhJKeW_header { padding-right: 16px !important; padding-left: 6px !important }\nhtml[dir=\"rtl\"] .dhJKeW_path { margin-right: 0 !important; margin-left: 12px !important }\nhtml[dir=\"rtl\"] .dhJKeW_pathText { margin-right: 0 !important; margin-left: auto !important }\nhtml[dir=\"rtl\"] .dhJKeW_retry { padding-right: 12px !important; padding-left: 14px !important }\nhtml[dir=\"rtl\"] .k-1LKG_header { padding-right: 16px !important; padding-left: 6px !important }\nhtml[dir=\"rtl\"] .k-1LKG_path { margin-right: 0 !important; margin-left: 12px !important }\nhtml[dir=\"rtl\"] .k-1LKG_pathText { margin-right: 0 !important; margin-left: auto !important }\nhtml[dir=\"rtl\"] .k-1LKG_body { margin-right: 0 !important; padding-right: 8px !important; padding-left: 0 !important; margin-left: 2px !important }\nhtml[dir=\"rtl\"] .k-1LKG_level .k-1LKG_level { padding-left: 0 !important; padding-right: 18px !important }\nhtml[dir=\"rtl\"] .k-1LKG_row { text-align: right !important }\nhtml[dir=\"rtl\"] .geFEbW_entry { text-align: right !important }\nhtml[dir=\"rtl\"] .P3OORG_panel { border-left-width: 0 !important; border-left-style: none !important; border-left-color: currentColor !important; right: auto; left: 0; border-right-width: .5px !important; border-right-style: solid !important; border-right-color: var(--dsw-alias-border-l4) !important }\nhtml[dir=\"rtl\"] .hHd-Xa_logoRow { padding-right: 4px !important; padding-left: 0 !important }\nhtml[dir=\"rtl\"] .hHd-Xa_panelRow { text-align: right !important }\nhtml[dir=\"rtl\"] .hHd-Xa_regionArea { margin-left: calc(-1 * var(--dsh-sidebar-inline-padding)) !important; margin-right: -4px !important; padding-left: 0 !important; padding-right: 4px !important }\nhtml[dir=\"rtl\"] .hHd-Xa_collapsed .hHd-Xa_regionArea { padding-right: 0 !important }\n@keyframes iWrAna_dsh-skill-row-sweep{\n0% { left: auto; right: -300px }\n}\n@keyframes iWrAna_dsh-skill-row-sweep{\n90%,to { left: auto; right: 100% }\n}\nhtml[dir=\"rtl\"] .iWrAna_leading { margin-right: 0 !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] .iWrAna_instructionsCard { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .iWrAna_inspectButton { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .ZKlsPq_switcherRoot { margin-left: 0 !important; margin-right: 6px !important }\nhtml[dir=\"rtl\"] .ZKlsPq_menu>.ZKlsPq_node { margin-left: 0 !important; margin-right: -3px !important }\nhtml[dir=\"rtl\"] .ZKlsPq_row { text-align: right !important; padding-right: 11px !important; padding-left: 8px !important }\nhtml[dir=\"rtl\"] .ZKlsPq_metrics { text-align: left !important }\nhtml[dir=\"rtl\"] .ZKlsPq_children { margin-left: 0 !important; padding-left: 0 !important; margin-right: 18px !important; padding-right: 4px !important }\nhtml[dir=\"rtl\"] .ZKlsPq_children>.ZKlsPq_node:before { left: auto; right: -4px }\nhtml[dir=\"rtl\"] .bVCLcG_rowText { padding-right: 0 !important; padding-left: 48px !important }\nhtml[dir=\"rtl\"] .bVCLcG_arrows { right: auto; left: 8px }\nhtml[dir=\"rtl\"] .fsXYAq_card { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .fsXYAq_questionList { padding-left: 0 !important; padding-right: 20px !important }\n@keyframes o3BgMG_dsh-tool-row-sweep{\n0% { left: auto; right: -300px }\n}\n@keyframes o3BgMG_dsh-tool-row-sweep{\n90%,to { left: auto; right: 100% }\n}\nhtml[dir=\"rtl\"] .o3BgMG_summarySuffix { margin-left: 0 !important; margin-right: 4px !important }\nhtml[dir=\"rtl\"] .o3BgMG_diffStat { margin-left: 0 !important; margin-right: 10px !important }\nhtml[dir=\"rtl\"] .o3BgMG_fileLink { text-align: right !important }\nhtml[dir=\"rtl\"] .o3BgMG_inspectButton { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .o3BgMG_ioCard { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .o3BgMG_codeBody, html[dir=\"rtl\"] .o3BgMG_terminalBody, html[dir=\"rtl\"] .o3BgMG_diffBody, html[dir=\"rtl\"] .o3BgMG_readBody, html[dir=\"rtl\"] .o3BgMG_imageBody, html[dir=\"rtl\"] .o3BgMG_searchBody, html[dir=\"rtl\"] .o3BgMG_webBody { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .o3BgMG_searchRecovery { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .ztWv_q_subCalls { border-left-width: 0 !important; border-left-style: none !important; border-left-color: currentColor !important; margin-right: 22px !important; margin-left: 0 !important; padding-left: 0 !important; padding-right: 8px !important; border-right-width: .5px !important; border-right-style: solid !important; border-right-color: var(--dsw-alias-border-l2) !important }\nhtml[dir=\"rtl\"] .CY-8Ka_terminal { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .CY-8Ka_ioCard { margin-right: 4px !important; margin-left: 0 !important }\n@keyframes CY-8Ka_dsh-bash-row-sweep{\n0% { left: auto; right: -300px }\n}\n@keyframes CY-8Ka_dsh-bash-row-sweep{\n90%,to { left: auto; right: 100% }\n}\nhtml[dir=\"rtl\"] .CY-8Ka_leading { margin-right: 0 !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] .CY-8Ka_inspectButton { margin-right: 4px !important; margin-left: 0 !important }\nhtml[dir=\"rtl\"] .Y0dWHa_table th { text-align: right !important }\nhtml[dir=\"rtl\"] .Y0dWHa_eventHeader { text-align: left !important; padding-right: 0 !important; padding-left: 4px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_requestBoundaryControl { left: auto; right: calc(var(--request-boundary-base-left) + var(--request-boundary-offset,0px)) }\nhtml[dir=\"rtl\"] .Y0dWHa_requestBoundaryControl:after { left: auto; right: 17px }\nhtml[dir=\"rtl\"] .Y0dWHa_turnRail, html[dir=\"rtl\"] .Y0dWHa_selectionRail { left: auto; right: 0 }\nhtml[dir=\"rtl\"] .Y0dWHa_event { padding-left: 4px !important; padding-right: 36px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_turnLabel { border-bottom-right-radius: 0 !important; border-bottom-left-radius: 2px !important; left: auto; right: 0 }\nhtml[dir=\"rtl\"] .Y0dWHa_content { padding-left: 0 !important; padding-right: 4px !important }\n@container Y0dWHa_trajectory-table (width<=620px){\nhtml[dir=\"rtl\"] .Y0dWHa_event { padding-left: 3px !important; padding-right: 28px !important }\n}\n@media (prefers-reduced-motion:no-preference){\nhtml[dir=\"rtl\"] .Y0dWHa_requestBoundaryControl { transition-property: right !important }\n}\nhtml[dir=\"rtl\"] .Y0dWHa_collapsedTurnEllipsis { margin-right: 0 !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_toolCallPayload { margin-left: 0 !important; margin-right: 7px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_table tbody tr[data-kind=subtool] .Y0dWHa_content { padding-left: 0 !important; padding-right: 26px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_arrow { margin-right: 0 !important; margin-left: 8px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_details { border-left-width: 0 !important; border-left-style: none !important; border-left-color: currentColor !important; border-right-width: .5px !important; border-right-style: solid !important; border-right-color: var(--dsw-alias-border-l2) !important }\nhtml[dir=\"rtl\"] .Y0dWHa_detailsResizeHandle { left: auto; right: -4px }\nhtml[dir=\"rtl\"] .Y0dWHa_detailsHeader { padding-right: 12px !important; padding-left: 8px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_compactedSummary .Y0dWHa_markdownPayload { padding-right: 0 !important; padding-left: 18px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_overview>.Y0dWHa_requestTokenDetail dt { padding-left: 0 !important; padding-right: 12px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_overviewHeading { padding-right: 14px !important; padding-left: 0 !important }\nhtml[dir=\"rtl\"] .Y0dWHa_thinkingQuote { border-left-width: 0 !important; border-left-style: none !important; border-left-color: currentColor !important; margin-right: 12px !important; margin-left: 14px !important; padding-left: 0 !important; padding-right: 6px !important; border-right-width: 2px !important; border-right-style: solid !important; border-right-color: var(--dsw-alias-markdown-citation) !important }\nhtml[dir=\"rtl\"] .Y0dWHa_schemaTree { margin-right: 0 !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_assistantToolCallButton { margin-left: 0 !important; margin-right: -4px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_assistantToolCallIcon { margin-right: 0 !important; margin-left: 5px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_assistantToolCallName { margin-right: 0 !important; margin-left: 5px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_toolCatalogDefinition { padding-right: 29px !important; padding-left: 0 !important }\nhtml[dir=\"rtl\"] .Y0dWHa_toolCatalogFullDescription { padding-right: 0 !important; padding-left: 14px !important }\nhtml[dir=\"rtl\"] .Y0dWHa_toolCatalogTree { margin-left: 6px !important; margin-right: -14px !important }\n@media (width<=760px){\nhtml[dir=\"rtl\"] .Y0dWHa_details { border-left-color: currentColor !important; right: auto; left: 0; border-right-color: var(--dsw-alias-border-l3) !important }\n}\nhtml[dir=\"rtl\"] .fV0t5q_controlThumb { left: auto; right: 2px }\nhtml[dir=\"rtl\"] .fV0t5q_search { margin-left: 0 !important; margin-right: auto !important }\nhtml[dir=\"rtl\"] ._1p9O6q_labels { border-right-width: 0 !important; border-right-style: none !important; border-right-color: currentColor !important; border-left-width: .5px !important; border-left-style: solid !important; border-left-color: var(--dsw-alias-border-l1) !important }\nhtml[dir=\"rtl\"] ._1p9O6q_labels span { text-align: left !important; right: auto; left: 3px }\nhtml[dir=\"rtl\"] ._1p9O6q_earlierHistory { padding-left: 0 !important; left: auto; right: 0; padding-right: 3px !important }\nhtml[dir=\"rtl\"] ._1p9O6q_empty { left: auto; right: 50% }\nhtml[dir=\"rtl\"] ._1p9O6q_lanes { left: auto; right: var(--trajectory-domain-left) }\nhtml[dir=\"rtl\"] ._1p9O6q_turnBoundaries { left: auto; right: var(--trajectory-domain-left) }\n@media (prefers-reduced-motion:no-preference){\nhtml[dir=\"rtl\"] ._1p9O6q_lanes[data-animate-viewport=true], html[dir=\"rtl\"] ._1p9O6q_turnBoundaries[data-animate-viewport=true] { transition: right .18s ease-out !important }\n}\nhtml[dir=\"rtl\"] ._1p9O6q_turnBoundary { left: auto; right: var(--trajectory-turn-left) }\nhtml[dir=\"rtl\"] ._1p9O6q_span { left: auto; right: calc(var(--trajectory-span-left) + var(--trajectory-span-gap)) }\nhtml[dir=\"rtl\"] ._1p9O6q_selection { left: auto; right: var(--trajectory-selection-left) }\nhtml[dir=\"rtl\"] ._1p9O6q_selectionEdges { left: auto; right: var(--trajectory-selection-left) }\nhtml[dir=\"rtl\"] ._1p9O6q_hoverLine { left: auto; right: clamp(0px, calc(var(--trajectory-hover-left) - 1px), calc(100% - 2px)) }\nhtml[dir=\"rtl\"] ._1p9O6q_selectionEdges:before { left: auto; right: 0 }\nhtml[dir=\"rtl\"] ._1p9O6q_selectionEdges:after { right: auto; left: 0 }\nhtml[dir=\"rtl\"] .Mbwy4a_header { padding-right: 24px !important; padding-left: 16px !important }\nhtml[dir=\"rtl\"] .Mbwy4a_option { text-align: right !important; padding-right: 8px !important; padding-left: 12px !important }\nhtml[dir=\"rtl\"] .Mbwy4a_customRow { padding-right: 8px !important; padding-left: 12px !important }\nhtml[dir=\"rtl\"] .Mbwy4a_footer { padding-right: 18px !important; padding-left: 10px !important }\nhtml[dir=\"rtl\"] .Mbwy4a_feedback { text-align: left !important }\n@media (width<=720px){\nhtml[dir=\"rtl\"] .Mbwy4a_header { padding-right: 18px !important; padding-left: 12px !important }\n}\nhtml[dir=\"rtl\"] .DBuyfa_runLeading { margin-left: 0 !important }\nhtml[dir=\"rtl\"] .DBuyfa_phaseLeading { margin-left: 0 !important }\nhtml[dir=\"rtl\"] .DBuyfa_phaseStatus { text-align: left !important }\nhtml[dir=\"rtl\"] .DBuyfa_phaseList { padding-right: 16px !important; padding-left: 0 !important }\nhtml[dir=\"rtl\"] .DBuyfa_members { padding-right: 16px !important; padding-left: 0 !important }\nhtml[dir=\"rtl\"] .DBuyfa_memberRow, html[dir=\"rtl\"] .DBuyfa_memberButton { text-align: right !important }\nhtml[dir=\"rtl\"] .DBuyfa_memberStatus { text-align: left !important }\n@media (width<=560px){\nhtml[dir=\"rtl\"] .DBuyfa_phaseList, html[dir=\"rtl\"] .DBuyfa_members { padding-left: 0 !important; padding-right: 12px !important }\n}\nhtml[dir=\"rtl\"] .YDXeBa_searchResultRow { text-align: right !important }\nhtml[dir=\"rtl\"] .YDXeBa_searchResultTitle { margin-left: 0 !important; margin-right: 4px !important }\nhtml[dir=\"rtl\"] .YDXeBa_searchResultMeta { margin-left: 0 !important; margin-right: 20px !important }\nhtml[dir=\"rtl\"] .YDXeBa_sessionRow .YDXeBa_title { margin-right: 4px !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] .YDXeBa_flatSessionRowWithoutStatus .YDXeBa_title { margin-right: 0 !important }\nhtml[dir=\"rtl\"] .YDXeBa_scheduleIndicator { margin-right: 0 !important; margin-left: 6px !important }\nhtml[dir=\"rtl\"] .YDXeBa_searchScheduleIndicator { margin-left: 0 !important; margin-right: 4px !important }\nhtml[dir=\"rtl\"] .bhn1Oq_root { padding-right: 0 !important; padding-left: var(--dsh-session-list-edge-inset) !important }\nhtml[dir=\"rtl\"] .bhn1Oq_root.bhn1Oq_rail { padding-left: 0 !important }\nhtml[dir=\"rtl\"] .bhn1Oq_sectionHeader { padding-left: 0 !important; padding-right: 4px !important }\nhtml[dir=\"rtl\"] .bhn1Oq_root:not(.bhn1Oq_rail) .bhn1Oq_sectionHeader { margin-right: 0 !important; margin-left: -4px !important }\nhtml[dir=\"rtl\"] .bhn1Oq_sectionLabelHidden { margin-right: 0 !important; margin-left: -4px !important }\nhtml[dir=\"rtl\"] .bhn1Oq_searchSlot { margin-left: 0 !important; margin-right: auto !important; padding-right: 0 !important }\nhtml[dir=\"rtl\"] .bhn1Oq_searchSlotExpanded { padding-right: 0 !important }\nhtml[dir=\"rtl\"] .bhn1Oq_searchExpanded { padding-right: 0 !important; padding-left: 4px !important }\nhtml[dir=\"rtl\"] .bhn1Oq_searchExpanded .bhn1Oq_searchInput { margin-left: 0 !important; margin-right: -2px !important }\nhtml[dir=\"rtl\"] .bhn1Oq_rail .bhn1Oq_sectionHeader { padding-right: 0 !important }\nhtml[dir=\"rtl\"] .bhn1Oq_listArea { margin-left: calc(-1 * var(--dsh-session-list-edge-inset)) !important; margin-right: -4px !important; padding-left: 0 !important; padding-right: 4px !important }\nhtml[dir=\"rtl\"] .bhn1Oq_rail .bhn1Oq_listArea { padding-right: 0 !important }\nhtml[dir=\"rtl\"] .bhn1Oq_fade { left: var(--dsh-session-list-edge-inset); right: 0 }\nhtml[dir=\"rtl\"] .bhn1Oq_list { margin-left: var(--dsh-session-list-scrollbar-offset) !important; margin-right: -4px !important; padding-left: calc(var(--dsh-session-list-edge-inset) - var(--dsh-session-list-scrollbar-width) - var(--dsh-session-list-scrollbar-offset)) !important; padding-right: 4px !important }\nhtml[dir=\"rtl\"] .bhn1Oq_listTopDropIndicator { left: var(--dsh-session-list-edge-inset); right: 0 }\nhtml[dir=\"rtl\"] .bhn1Oq_sessionOverflowButton { text-align: right !important; padding-right: 28px !important; padding-left: 12px !important }\n";
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
