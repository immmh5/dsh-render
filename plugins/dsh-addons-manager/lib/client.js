// Browser half of dsh-addons-manager.
//
// Served verbatim by the host's client-modules bundle route and executed
// through the lazy CJS module table: the factory receives `require` and must
// register itself with `window.__ModuleLoader__.load`.
//
// Registers one section in the DSH Web settings page (`settings.section`, id
// `addon-manager`, order 94 — directly above the extension hub's
// "إدارة الإضافات" at order 95) with three tabs:
//   الإضافات — multi-select list, bulk enable/disable, bundle export/import
//   إعدادات الإضافات — per add-on `config:` editor (form + JSON)
//   إعداداتي — this plugin's own durable settings (namespace `addon-manager`)
window.__ModuleLoader__.load({
	id: "dsh-addons-manager",
	factory: (require) => {
		"use strict";
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");
		var h = React.createElement;

		var inject = ["slots", "connection", "remote", "locale", "settingsScope"];
		var NS = "addonManager";
		var PREF_NS = "addon-manager";
		var SECTION_ID = "addon-manager";
		var SECTION_ORDER = 94;

		// ── copy ───────────────────────────────────────────────────────────
		var DICT = {
			en: {
				"am.nav": "Bulk add-ons",
				"am.tab.plugins": "Add-ons",
				"am.tab.config": "Add-on settings",
				"am.tab.prefs": "My settings",
				"am.plugins.search": "Filter add-ons…",
				"am.plugins.all": "Select all",
				"am.plugins.none": "Clear selection",
				"am.plugins.selected": "{n} selected",
				"am.plugins.empty": "No add-on matches this filter.",
				"am.plugins.enable": "Enable selected",
				"am.plugins.disable": "Disable selected",
				"am.plugins.refresh": "Reload",
				"am.plugins.on": "Enabled",
				"am.plugins.off": "Disabled",
				"am.plugins.loading": "Loading the add-on inventory…",
				"am.plugins.confirm": "Switch {n} add-on(s)? A restart of dsh web applies it.",
				"am.export.title": "Export bundle",
				"am.export.scopeAll": "Everything",
				"am.export.scopeSelected": "Selection only",
				"am.export.config": "Include each add-on's settings",
				"am.export.sources": "Include add-on source files",
				"am.export.run": "Download JSON",
				"am.export.empty": "Pick at least one add-on first.",
				"am.import.title": "Import bundle",
				"am.import.pick": "Choose a .json bundle",
				"am.import.confirm": "Import {n} add-on(s) from this bundle?",
				"am.import.none": "The file is not a dsh-addons-manager bundle.",
				"am.row.version": "v{v}",
				"am.row.official": "official",
				"am.row.toggle": "Switch",
				"am.config.pick": "Choose an add-on",
				"am.config.none": "No add-on in this profile has a settings block.",
				"am.config.form": "Fields",
				"am.config.json": "JSON",
				"am.config.save": "Save settings",
				"am.config.clear": "Clear settings",
				"am.config.saved": "Settings saved. Restart dsh web to apply them.",
				"am.config.invalid": "Invalid JSON: {e}",
				"am.config.readFail": "Could not read the settings block.",
				"am.config.addTitle": "Add a field",
				"am.config.addKey": "key",
				"am.config.add": "Add",
				"am.config.hint": "Scalars edit in place; arrays and empty objects are edited as JSON.",
				"am.prefs.title": "These preferences belong to the bulk add-on manager itself.",
				"am.prefs.confirmBulk": "Ask before bulk changes",
				"am.prefs.exportConfig": "Include settings when exporting",
				"am.prefs.exportSources": "Include sources when exporting",
				"am.prefs.showDisabledOnly": "Show disabled add-ons only",
				"am.prefs.defaultTab": "Tab opened first",
				"am.prefs.saved": "Saved.",
				"am.msg.restart": "Restart dsh web to apply these changes.",
				"am.msg.noChange": "Nothing changed ({reason}).",
				"am.msg.changed": "{n} add-on(s) changed.",
				"am.msg.warnings": "Warning: {w}",
				"am.msg.error": "Failed: {e}",
				"am.msg.done": "Done.",
				"am.msg.copied": "Copied.",
				"am.msg.install": "Run these commands first, then restart dsh web:"
			},
			ar: {
				"am.nav": "الإضافات بالجملة",
				"am.tab.plugins": "الإضافات",
				"am.tab.config": "إعدادات الإضافات",
				"am.tab.prefs": "إعداداتي",
				"am.plugins.search": "ابحث في الإضافات…",
				"am.plugins.all": "تحديد الكل",
				"am.plugins.none": "إلغاء التحديد",
				"am.plugins.selected": "محدَّد {n}",
				"am.plugins.empty": "ما فيه إضافة تطابق هذا البحث.",
				"am.plugins.enable": "تفعيل المحدَّد",
				"am.plugins.disable": "تعطيل المحدَّد",
				"am.plugins.refresh": "تحديث",
				"am.plugins.on": "مفعّلة",
				"am.plugins.off": "معطّلة",
				"am.plugins.loading": "جاري تحميل قائمة الإضافات…",
				"am.plugins.confirm": "تغيير حالة {n} إضافة؟ يطبّق الأمر بعد إعادة تشغيل dsh web.",
				"am.export.title": "تصدير حزمة",
				"am.export.scopeAll": "الكل",
				"am.export.scopeSelected": "المحدَّد فقط",
				"am.export.config": "أرفق إعدادات كل إضافة",
				"am.export.sources": "أرفق ملفات الإضافات نفسها",
				"am.export.run": "تنزيل JSON",
				"am.export.empty": "اختر إضافة واحدة على الأقل أولاً.",
				"am.import.title": "استيراد حزمة",
				"am.import.pick": "اختر ملف حزمة .json",
				"am.import.confirm": "استيراد {n} إضافة من هذه الحزمة؟",
				"am.import.none": "الملف ليس حزمة dsh-addons-manager.",
				"am.row.version": "الإصدار {v}",
				"am.row.official": "رسمية",
				"am.row.toggle": "تبديل",
				"am.config.pick": "اختر إضافة",
				"am.config.none": "ما فيه إضافة في هذا الملف فيها إعدادات.",
				"am.config.form": "الحقول",
				"am.config.json": "JSON",
				"am.config.save": "حفظ الإعدادات",
				"am.config.clear": "مسح الإعدادات",
				"am.config.saved": "تم الحفظ. أعد تشغيل dsh web لتطبيقها.",
				"am.config.invalid": "JSON غير صالح: {e}",
				"am.config.readFail": "تعذّر قراءة كتلة الإعدادات.",
				"am.config.addTitle": "إضافة حقل",
				"am.config.addKey": "المفتاح",
				"am.config.add": "إضافة",
				"am.config.hint": "القيم البسيطة تُعدَّل مباشرة؛ المصفوفات والكائنات الفارغة تُعدَّل بصيغة JSON.",
				"am.prefs.title": "هذه التفضيلات تخص أداة الإضافات بالجملة نفسها.",
				"am.prefs.confirmBulk": "اطلب تأكيداً قبل التغيير الجماعي",
				"am.prefs.exportConfig": "أرفق الإعدادات عند التصدير",
				"am.prefs.exportSources": "أرفق الملفات عند التصدير",
				"am.prefs.showDisabledOnly": "اعرض المعطّلة فقط",
				"am.prefs.defaultTab": "التبويب المفتوح أولاً",
				"am.prefs.saved": "تم الحفظ.",
				"am.msg.restart": "أعد تشغيل dsh web لتطبيق هذه التغييرات.",
				"am.msg.noChange": "ما تغيّر شيء ({reason}).",
				"am.msg.changed": "تغيّرت {n} إضافة.",
				"am.msg.warnings": "تنبيه: {w}",
				"am.msg.error": "فشل: {e}",
				"am.msg.done": "تم.",
				"am.msg.copied": "تم النسخ.",
				"am.msg.install": "نفّذ هذه الأوامر أولاً ثم أعد تشغيل dsh web:"
			},
			zh: {
				"am.nav": "插件批量管理",
				"am.tab.plugins": "插件",
				"am.tab.config": "插件设置",
				"am.tab.prefs": "我的设置",
				"am.plugins.search": "筛选插件…",
				"am.plugins.all": "全选",
				"am.plugins.none": "清除选择",
				"am.plugins.selected": "已选 {n}",
				"am.plugins.empty": "没有匹配的插件。",
				"am.plugins.enable": "启用所选",
				"am.plugins.disable": "停用所选",
				"am.plugins.refresh": "刷新",
				"am.plugins.on": "已启用",
				"am.plugins.off": "已停用",
				"am.plugins.loading": "正在加载插件列表…",
				"am.plugins.confirm": "切换 {n} 个插件？重启 dsh web 后生效。",
				"am.export.title": "导出包",
				"am.export.scopeAll": "全部",
				"am.export.scopeSelected": "仅所选",
				"am.export.config": "包含各插件设置",
				"am.export.sources": "包含插件源文件",
				"am.export.run": "下载 JSON",
				"am.export.empty": "请先选择至少一个插件。",
				"am.import.title": "导入包",
				"am.import.pick": "选择 .json 包",
				"am.import.confirm": "从此包导入 {n} 个插件？",
				"am.import.none": "该文件不是 dsh-addons-manager 包。",
				"am.row.version": "v{v}",
				"am.row.official": "官方",
				"am.row.toggle": "切换",
				"am.config.pick": "选择插件",
				"am.config.none": "此配置中没有插件带设置块。",
				"am.config.form": "字段",
				"am.config.json": "JSON",
				"am.config.save": "保存设置",
				"am.config.clear": "清除设置",
				"am.config.saved": "已保存。重启 dsh web 生效。",
				"am.config.invalid": "JSON 无效：{e}",
				"am.config.readFail": "无法读取设置块。",
				"am.config.addTitle": "添加字段",
				"am.config.addKey": "键名",
				"am.config.add": "添加",
				"am.config.hint": "标量直接编辑；数组与空对象以 JSON 编辑。",
				"am.prefs.title": "这些偏好属于批量插件管理器本身。",
				"am.prefs.confirmBulk": "批量操作前确认",
				"am.prefs.exportConfig": "导出时包含设置",
				"am.prefs.exportSources": "导出时包含源文件",
				"am.prefs.showDisabledOnly": "只显示已停用插件",
				"am.prefs.defaultTab": "默认打开的标签页",
				"am.prefs.saved": "已保存。",
				"am.msg.restart": "重启 dsh web 以应用更改。",
				"am.msg.noChange": "没有变化（{reason}）。",
				"am.msg.changed": "已更改 {n} 个插件。",
				"am.msg.warnings": "警告：{w}",
				"am.msg.error": "失败：{e}",
				"am.msg.done": "完成。",
				"am.msg.copied": "已复制。",
				"am.msg.install": "请先执行以下命令，然后重启 dsh web："
			}
		};

		var CSS = [
			".am-sec{display:flex;flex-direction:column;gap:16px}",
			".am-root{min-height:0;max-height:min(72vh,760px);overflow:auto;overscroll-behavior:contain}",
			// One visible scroller per tab: the root bounds the section, its tab
			// panel is the scroller for config/prefs, and the add-on list shrinks
			// to fill the remaining height and scrolls on its own. Fixed chrome
			// (tabs, bar, banners) never shrinks, so nothing is ever clipped.
			".am-root > .am-sec{min-height:0;overflow:auto;overscroll-behavior:contain}",
			".am-tabs{display:flex;gap:4px;flex-wrap:wrap;flex:0 0 auto;border-bottom:.5px solid var(--dsw-alias-border-l2);padding-bottom:8px}",
			".am-tab{background:none;border:none;font:inherit;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));cursor:pointer;padding:6px 12px;border-radius:6px}",
			".am-tab:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".am-tab[data-on=\"true\"]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform);font-weight:500}",
			".am-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;flex:0 0 auto}",
			".am-bar input[type=\"search\"]{background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#15171c);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;height:32px;padding:0 10px;font:inherit;font-size:13px;min-width:180px}",
			".am-btn{background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#15171c);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;height:32px;padding:0 12px;font:inherit;font-size:13px;cursor:pointer}",
			".am-btn:hover:not([disabled]){background:var(--dsw-alias-interactive-bg-hover)}",
			".am-btn[disabled]{opacity:.5;cursor:default}",
			".am-btn[data-kind=\"primary\"]{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-module-platform));border-color:transparent}",
			".am-btn[data-kind=\"danger\"]{color:var(--dsw-alias-label-danger,var(--dsw-alias-label-primary))}",
			".am-count{color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));font-size:12px}",
			".am-list{display:flex;flex-direction:column;gap:2px;flex:0 1 auto;min-height:0;overflow:auto;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px}",
			".am-row{display:flex;align-items:center;gap:10px;padding:8px 8px;border-radius:6px}",
			".am-row:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".am-row[data-off=\"true\"]{opacity:.62}",
			".am-rowMain{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}",
			".am-name{font-size:13px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".am-sub{font-size:11px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".am-pill{font-size:11px;padding:2px 8px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary))}",
			".am-pill[data-on=\"true\"]{color:var(--dsw-alias-label-success,var(--dsw-alias-label-primary))}",
			".am-panel{flex:0 0 auto;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:10px}",
			".am-panel h4{margin:0;font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary)}",
			".am-grid{display:flex;gap:16px;flex-wrap:wrap}",
			".am-check{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--dsw-alias-label-primary)}",
			".am-msg{font-size:12px;flex:0 0 auto;border-radius:6px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l2);white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto}",
			".am-msg[data-tone=\"error\"]{color:var(--dsw-alias-label-danger,var(--dsw-alias-label-primary))}",
			".am-msg[data-tone=\"ok\"]{color:var(--dsw-alias-label-success,var(--dsw-alias-label-primary))}",
			".am-note{font-size:12px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary))}",
			".am-fields{display:flex;flex-direction:column;gap:8px}",
			".am-field{display:flex;gap:10px;align-items:flex-start}",
			".am-field label{flex:0 0 200px;font-size:12px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));padding-top:7px;word-break:break-word}",
			".am-field .am-input{flex:1;min-width:0}",
			".am-input input[type=\"text\"],.am-input input[type=\"number\"],.am-input textarea,.am-input select{width:100%;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#15171c);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px 8px;font:inherit;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}",
			".am-input textarea{min-height:88px;resize:vertical}",
			".am-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word}",
			".am-banner{font-size:12px;flex:0 0 auto;color:var(--dsw-alias-label-warning,var(--dsw-alias-label-primary));border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:8px 10px}",
			".am-addrow{display:flex;gap:8px;align-items:center}",
			".am-addrow input{background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#15171c);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;height:32px;padding:0 8px;font:inherit;font-size:13px}",
			// Native <select> pulls its face from the UA, so the popup came out
			// light-on-light with our dark-theme label colour. Own the control
			// fully: explicit face, explicit <option> colours, and a colour-scheme
			// detected from the theme's label colour so the popup matches too.
			".am-sec select{appearance:none;-webkit-appearance:none;background-color:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff));background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23888c92' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center;background-size:10px 6px;color:var(--dsw-alias-label-primary,#15171c);border:.5px solid var(--dsw-alias-border-l2,rgba(128,128,128,.4));border-radius:6px;height:32px;padding:0 28px 0 10px;font:inherit;font-size:13px;cursor:pointer;color-scheme:var(--am-scheme,light)}",
			".am-sec select:dir(rtl){background-position:left 10px center;padding:0 10px 0 28px}",
			".am-sec select option{background-color:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#15171c)}",
			".am-sec select option:checked,.am-sec select option:hover{background-color:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-module-platform,#fff));color:var(--dsw-alias-label-primary,#15171c)}",
			".am-sec select:focus-visible{outline:1px solid var(--dsw-alias-state-business-primary,var(--dsw-alias-label-primary));outline-offset:1px}",
			".am-sec select[disabled]{opacity:.5;cursor:default}"
		].join("\n");
		var CSS_TAG = "dsh-addons-manager/section.css";

		function injectStyle(tagId, css, plugin) {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;
			var tag = document.createElement("style");
			tag.dataset.plugin = plugin;
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		// "dark" when the theme paints its label colour light, so the native
		// <select> popup inherits a matching colour-scheme.
		var SCHEME = "light dark";
		function detectScheme() {
			if (typeof document === "undefined" || !document.body) return "light dark";
			try {
				var probe = document.createElement("span");
				probe.style.cssText = "position:absolute;left:-9999px;top:0;color:var(--dsw-alias-label-primary,#15171c)";
				document.body.appendChild(probe);
				var view = probe.ownerDocument && probe.ownerDocument.defaultView;
				var rgb = view && view.getComputedStyle ? view.getComputedStyle(probe).color : "";
				document.body.removeChild(probe);
				var match = /rgba?\(([^)]+)\)/.exec(rgb || "");
				if (!match) return "light dark";
				var n = match[1].split(/[,\s\/]+/).filter(Boolean).map(Number);
				var lum = (0.2126 * (n[0] || 0) + 0.7152 * (n[1] || 0) + 0.0722 * (n[2] || 0)) / 255;
				return lum > 0.5 ? "dark" : "light";
			} catch (e) { return "light dark"; }
		}

		// ── remote contribution ────────────────────────────────────────────
		var REMOTE_METHODS = ["snapshot", "setEnabled", "getConfig", "setConfig", "exportAddons", "importAddons"];
		function passthroughCodec(typeSymbol) {
			return { mode: "strict", typeSymbol: typeSymbol, schema: { parse: function (v) { return v; } } };
		}
		function makeRemoteContribution() {
			var descriptors = [];
			for (var i = 0; i < REMOTE_METHODS.length; i++) {
				descriptors.push({
					id: "dsh-addons-manager#addonManager/" + REMOTE_METHODS[i],
					service: "addonManager",
					namespace: "addonManager",
					method: REMOTE_METHODS[i],
					invocation: { kind: "direct" },
					parameters: [{ name: "input", wire: "input", source: "json", codec: passthroughCodec("dsh-addons-manager/types#Input") }],
					result: passthroughCodec("dsh-addons-manager/types#Result")
				});
			}
			return { package: "dsh-addons-manager", descriptors: descriptors };
		}
		var REMOTE_CONTRIBUTION = makeRemoteContribution();

		var ctxRef = null;
		var tRef = null;
		var apiRef = null;
		var settingsHost = null;

		var RETRY_DELAYS = [500, 1000, 2000];
		async function callWithRetry(method, input, attempt) {
			try {
				var res = await apiRef[method](input || {});
				if (res && res.ok === false) {
					var detail = res.error && (res.error.message || res.error.code);
					var err = new Error(detail ? method + ": " + detail : "RPC failed: " + method);
					err.error = res.error;
					throw err;
				}
				// The typert seam may answer `{ok, value}` or the raw payload.
				if (res && res.ok === true && res.value !== undefined) return res.value;
				return res;
			} catch (error) {
				if (attempt < RETRY_DELAYS.length) {
					await new Promise(function (resolve) { setTimeout(resolve, RETRY_DELAYS[attempt]); });
					return callWithRetry(method, input, attempt + 1);
				}
				throw error;
			}
		}
		function call(method, input) {
			return callWithRetry(method, input, 0);
		}
		function errText(e) {
			if (!e) return (tRef || function (k) { return k; })("am.msg.error");
			if (e && e.error && e.error.message) return e.error.message;
			return e.message || String(e);
		}

		function tr(t, key, vars) {
			var raw = t ? t(key) : key;
			if (raw === key && tRef) raw = tRef(key);
			if (!vars) return raw;
			return String(raw).replace(/\{(\w+)\}/g, function (m, k) {
				return vars[k] === undefined ? m : String(vars[k]);
			});
		}

		// ── own durable settings ───────────────────────────────────────────
		var PREF_DEFAULTS = { confirmBulk: false, exportConfig: true, exportSources: false, showDisabledOnly: false, defaultTab: "plugins" };
		function prefGet(field) {
			if (!settingsHost) return PREF_DEFAULTS[field];
			try {
				var snap = settingsHost.getSnapshot();
				var value = snap && snap.value ? snap.value : null;
				if (value && value[field] !== undefined && value[field] !== null) return value[field];
			} catch (e) { /* fall through */ }
			return PREF_DEFAULTS[field];
		}
		function prefSet(field, value) {
			if (!settingsHost) return;
			try { settingsHost.set(field, value); } catch (e) { /* ignore */ }
		}

		// ── value helpers ──────────────────────────────────────────────────
		function getPath(obj, path) {
			var cur = obj;
			for (var i = 0; i < path.length; i++) {
				if (cur === null || cur === undefined) return undefined;
				cur = cur[path[i]];
			}
			return cur;
		}
		function setPath(obj, path, value) {
			if (!path.length) return value;
			var copy = Array.isArray(obj) ? obj.slice() : Object.assign({}, obj || {});
			var cur = copy;
			for (var i = 0; i < path.length - 1; i++) {
				var k = path[i];
				var next = cur[k];
				next = Array.isArray(next) ? next.slice() : Object.assign({}, next || {});
				cur[k] = next;
				cur = next;
			}
			cur[path[path.length - 1]] = value;
			return copy;
		}
		function fieldsOf(value, path, out) {
			if (value === null || value === undefined) {
				out.push({ path: path, kind: "null", text: "null" });
				return out;
			}
			if (Array.isArray(value)) {
				out.push({ path: path, kind: "json", text: JSON.stringify(value, null, 2) });
				return out;
			}
			if (typeof value === "object") {
				var keys = Object.keys(value);
				if (!keys.length) {
					out.push({ path: path, kind: "json", text: "{}" });
					return out;
				}
				for (var i = 0; i < keys.length; i++) fieldsOf(value[keys[i]], path.concat(keys[i]), out);
				return out;
			}
			out.push({ path: path, kind: typeof value, text: typeof value === "boolean" ? (value ? "true" : "false") : String(value) });
			return out;
		}
		function keyOf(path) { return path.join("."); }

		function downloadJson(data, name) {
			var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
			var url = URL.createObjectURL(blob);
			var a = document.createElement("a");
			a.href = url;
			a.download = name;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
		}
		function stamp() {
			var d = new Date();
			var p = function (n) { return String(n).padStart(2, "0"); };
			return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
		}
		function copyText(text) {
			if (navigator && navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
			return Promise.reject(new Error("clipboard unavailable"));
		}

		// ── plugins tab ────────────────────────────────────────────────────
		function PluginsTab(props) {
			var t = props.t;
			var snap = props.snap;
			var selected = props.selected;
			var setSelected = props.setSelected;
			var notify = props.notify;
			var restart = props.restart;

			var filterState = React.useState("");
			var filter = filterState[0];
			var setFilter = filterState[1];
			var busyState = React.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var expOpenState = React.useState(false);
			var expOpen = expOpenState[0];
			var setExpOpen = expOpenState[1];
			var expScopeState = React.useState("all");
			var expScope = expScopeState[0];
			var setExpScope = expScopeState[1];
			var expCfgState = React.useState(prefGet("exportConfig"));
			var expCfg = expCfgState[0];
			var setExpCfg = expCfgState[1];
			var expSrcState = React.useState(prefGet("exportSources"));
			var expSrc = expSrcState[0];
			var setExpSrc = expSrcState[1];
			var fileRef = React.useRef(null);
			var searchRef = React.useRef(null);

			if (!snap || !snap.plugins) {
				return h("div", { className: "am-note" }, tr(t, "am.plugins.loading"));
			}

			var showDisabledOnly = prefGet("showDisabledOnly");
			var all = snap.plugins.filter(function (p) {
				if (showDisabledOnly && p.enabled) return false;
				if (!filter) return true;
				var q = filter.toLowerCase();
				return String(p.id).toLowerCase().indexOf(q) >= 0 || String(p.name).toLowerCase().indexOf(q) >= 0;
			});
			var visibleIds = all.map(function (p) { return p.id; });
			var selectedHere = selected.filter(function (id) { return visibleIds.indexOf(id) >= 0; });
			var allSelected = visibleIds.length > 0 && selectedHere.length === visibleIds.length;

			var toggleSelect = function (id) {
				var next = selected.slice();
				var at = next.indexOf(id);
				if (at >= 0) next.splice(at, 1);
				else next.push(id);
				setSelected(next);
			};
			var selectAll = function () {
				if (allSelected) {
					setSelected(selected.filter(function (id) { return visibleIds.indexOf(id) < 0; }));
				} else {
					var merged = selected.slice();
					for (var i = 0; i < visibleIds.length; i++) {
						if (merged.indexOf(visibleIds[i]) < 0) merged.push(visibleIds[i]);
					}
					setSelected(merged);
				}
			};

			var bulk = function (enabled) {
				var ids = selectedHere.length ? selectedHere : visibleIds;
				if (!ids.length) { notify(tr(t, "am.export.empty"), "error"); return; }
				if (prefGet("confirmBulk")) {
					var ok = window.confirm(tr(t, "am.plugins.confirm", { n: ids.length }));
					if (!ok) return;
				}
				setBusy(true);
				call("setEnabled", { ids: ids, enabled: enabled }).then(function (r) {
					if (r.warnings && r.warnings.length) notify(tr(t, "am.msg.warnings", { w: r.warnings.join(" | ") }), "error");
					else if (r.changed && r.changed.length) notify(tr(t, "am.msg.changed", { n: r.changed.length }), "ok");
					else notify(tr(t, "am.msg.noChange", { reason: (r.unchangedReason || "already") }), "ok");
					if (r.pendingRestart) restart();
					return snap.reload();
				}).catch(function (e) {
					notify(tr(t, "am.msg.error", { e: errText(e) }), "error");
				}).finally(function () { setBusy(false); });
			};

			var runExport = function () {
				var ids = expScope === "selected" ? selectedHere : [];
				if (expScope === "selected" && !ids.length) { notify(tr(t, "am.export.empty"), "error"); return; }
				setBusy(true);
				call("exportAddons", { ids: ids, includeConfig: expCfg, includeSources: expSrc }).then(function (r) {
					prefSet("exportConfig", expCfg);
					prefSet("exportSources", expSrc);
					downloadJson(r.bundle, "dsh-addons-" + stamp() + ".json");
					notify(tr(t, "am.msg.done"), "ok");
					setExpOpen(false);
				}).catch(function (e) {
					notify(tr(t, "am.msg.error", { e: errText(e) }), "error");
				}).finally(function () { setBusy(false); });
			};

			var onImportFile = function (event) {
				var file = event.target.files && event.target.files[0];
				event.target.value = "";
				if (!file) return;
				file.text().then(function (text) {
					var bundle;
					try { bundle = JSON.parse(text); }
					catch (e) { notify(tr(t, "am.import.none"), "error"); return; }
					if (!bundle || bundle.format !== "dsh-addons-manager.bundle") { notify(tr(t, "am.import.none"), "error"); return; }
					var n = (bundle.plugins || []).length;
					if (prefGet("confirmBulk")) {
						if (!window.confirm(tr(t, "am.import.confirm", { n: n }))) return;
					}
					setBusy(true);
					return call("importAddons", { bundle: bundle, overwriteConfig: true, applyEnabled: true }).then(function (r) {
						var lines = [];
						if (r.created && r.created.length) lines.push("+ " + r.created.join(", "));
						if (r.updated && r.updated.length) lines.push("~ " + r.updated.join(", "));
						if (r.filesRestored && r.filesRestored.length) lines.push("* " + r.filesRestored.length + " files");
						if (r.installCommands && r.installCommands.length) lines.push(tr(t, "am.msg.install") + "\n" + r.installCommands.join("\n"));
						lines.push(tr(t, "am.msg.restart"));
						notify(lines.join("\n"), "ok");
						restart();
						return snap.reload();
					}).catch(function (e) {
						notify(tr(t, "am.msg.error", { e: errText(e) }), "error");
					}).finally(function () { setBusy(false); });
				}).catch(function (e) {
					notify(tr(t, "am.msg.error", { e: errText(e) }), "error");
				});
			};

			var rows = all.map(function (p) {
				return h("div", { className: "am-row", key: p.id, "data-off": String(!p.enabled) },
					h("input", {
						type: "checkbox",
						checked: selected.indexOf(p.id) >= 0,
						"aria-label": p.name,
						onChange: function () { toggleSelect(p.id); }
					}),
					h("div", { className: "am-rowMain" },
						h("span", { className: "am-name" }, p.name,
							p.version ? h("span", { className: "am-sub" }, " " + tr(t, "am.row.version", { v: p.version })) : null),
						h("span", { className: "am-sub" }, p.id + (p.official ? " · " + tr(t, "am.row.official") : "") + (p.description ? " · " + p.description : ""))
					),
					h("span", { className: "am-pill", "data-on": String(p.enabled) }, p.enabled ? tr(t, "am.plugins.on") : tr(t, "am.plugins.off"))
				);
			});

			return h("div", { className: "am-sec" },
				h("div", { className: "am-bar" },
					h("input", {
						ref: searchRef,
						type: "search",
						placeholder: tr(t, "am.plugins.search"),
						value: filter,
						onChange: function (e) { setFilter(e.target.value); }
					}),
					h("button", { className: "am-btn", type: "button", onClick: selectAll }, allSelected ? tr(t, "am.plugins.none") : tr(t, "am.plugins.all")),
					h("button", { className: "am-btn", type: "button", disabled: busy, onClick: function () { bulk(true); } }, tr(t, "am.plugins.enable")),
					h("button", { className: "am-btn", type: "button", disabled: busy, onClick: function () { bulk(false); } }, tr(t, "am.plugins.disable")),
					h("button", { className: "am-btn", type: "button", onClick: function () { setExpOpen(!expOpen); } }, tr(t, "am.export.title")),
					h("button", { className: "am-btn", type: "button", disabled: busy, onClick: function () { fileRef.current && fileRef.current.click(); } }, tr(t, "am.import.pick")),
					h("button", { className: "am-btn", type: "button", disabled: busy, onClick: function () { snap.reload(); } }, tr(t, "am.plugins.refresh")),
					h("span", { className: "am-count" }, tr(t, "am.plugins.selected", { n: selected.length }))
				),
				expOpen ? h("div", { className: "am-panel" },
					h("h4", null, tr(t, "am.export.title")),
					h("div", { className: "am-grid" },
						h("label", { className: "am-check" },
							h("input", { type: "radio", name: "am-scope", checked: expScope === "all", onChange: function () { setExpScope("all"); } }),
							tr(t, "am.export.scopeAll")),
						h("label", { className: "am-check" },
							h("input", { type: "radio", name: "am-scope", checked: expScope === "selected", onChange: function () { setExpScope("selected"); } }),
							tr(t, "am.export.scopeSelected")),
						h("label", { className: "am-check" },
							h("input", { type: "checkbox", checked: expCfg, onChange: function (e) { setExpCfg(e.target.checked); } }),
							tr(t, "am.export.config")),
						h("label", { className: "am-check" },
							h("input", { type: "checkbox", checked: expSrc, onChange: function (e) { setExpSrc(e.target.checked); } }),
							tr(t, "am.export.sources")),
						h("button", { className: "am-btn", type: "button", "data-kind": "primary", disabled: busy, onClick: runExport }, tr(t, "am.export.run"))
					)
				) : null,
				h("input", { ref: fileRef, type: "file", accept: ".json,application/json", style: { display: "none" }, onChange: onImportFile }),
				all.length
					? h("div", { className: "am-list" }, rows)
					: h("div", { className: "am-note" }, tr(t, "am.plugins.empty"))
			);
		}

		// ── config tab ─────────────────────────────────────────────────────
		function ConfigTab(props) {
			var t = props.t;
			var snap = props.snap;
			var notify = props.notify;
			var restart = props.restart;

			var pickState = React.useState("");
			var pick = pickState[0];
			var setPick = pickState[1];
			var valueState = React.useState(null);
			var value = valueState[0];
			var setValue = valueState[1];
			var modeState = React.useState("form");
			var mode = modeState[0];
			var setMode = modeState[1];
			var jsonState = React.useState("");
			var json = jsonState[0];
			var setJson = jsonState[1];
			var textsState = React.useState({});
			var texts = textsState[0];
			var setTexts = textsState[1];
			var busyState = React.useState(false);
			var busy = busyState[0];
			var setBusy = busyState[1];
			var addKeyState = React.useState("");
			var addKey = addKeyState[0];
			var setAddKey = addKeyState[1];
			var errorState = React.useState("");
			var error = errorState[0];
			var setError = errorState[1];

			var plugins = snap && snap.plugins ? snap.plugins : [];
			var withConfig = plugins.filter(function (p) { return p.hasConfig || p.inProfile; });

			React.useEffect(function () {
				if (!pick) { setValue(null); setJson(""); return; }
				var alive = true;
				setBusy(true);
				setError("");
				call("getConfig", { id: pick }).then(function (r) {
					if (!alive) return;
					setValue(r && r.value !== undefined ? r.value : null);
					setJson(r && r.value !== undefined && r.value !== null ? JSON.stringify(r.value, null, 2) : "");
					setTexts({});
				}).catch(function (e) {
					if (alive) setError(tr(t, "am.config.readFail") + " " + errText(e));
				}).finally(function () { if (alive) setBusy(false); });
				return function () { alive = false; };
			}, [pick]);

			if (!plugins.length) return h("div", { className: "am-note" }, tr(t, "am.plugins.loading"));

			var save = function (next) {
				setBusy(true);
				setError("");
				call("setConfig", { id: pick, value: next }).then(function (r) {
					if (r && r.ok) {
						setValue(next);
						setJson(next === null || next === undefined ? "" : JSON.stringify(next, null, 2));
						notify(tr(t, "am.config.saved"), "ok");
						restart();
						return snap.reload();
					}
					setError((r && r.message) || tr(t, "am.config.readFail"));
				}).catch(function (e) {
					setError(tr(t, "am.msg.error", { e: errText(e) }));
				}).finally(function () { setBusy(false); });
			};

			var onFieldChange = function (field, text) {
				var next;
				if (field.kind === "boolean") next = text === true || text === "true";
				else if (field.kind === "number") {
					var n = Number(text);
					if (!isFinite(n)) return;
					next = n;
				} else if (field.kind === "json" || field.kind === "null") {
					try { next = JSON.parse(text); }
					catch (e) { setError(tr(t, "am.config.invalid", { e: e.message })); return; }
				} else next = text;
				setError("");
				setValue(setPath(value, field.path, next));
			};

			var commitJson = function (text) {
				setJson(text);
				if (text.trim() === "") { setError(""); setValue(null); return; }
				try {
					setValue(JSON.parse(text));
					setError("");
				} catch (e) {
					setError(tr(t, "am.config.invalid", { e: e.message }));
				}
			};

			var addField = function () {
				var key = String(addKey || "").trim();
				if (!key) return;
				setValue(setPath(value || {}, [key], ""));
				setAddKey("");
			};

			var body;
			if (!pick) {
				body = h("div", { className: "am-note" }, withConfig.length ? tr(t, "am.config.pick") : tr(t, "am.config.none"));
			} else if (mode === "json") {
				body = h("div", { className: "am-input" },
					h("textarea", {
						value: json,
						spellCheck: false,
						onChange: function (e) { commitJson(e.target.value); }
					})
				);
			} else {
				var fields = fieldsOf(value, [], []);
				body = h("div", null,
					h("div", { className: "am-fields" },
						fields.map(function (field) {
							var pathKey = keyOf(field.path);
							var label = pathKey === "" ? "(root)" : pathKey;
							var input;
							if (field.kind === "boolean") {
								input = h("input", {
									type: "checkbox",
									checked: getPath(value, field.path) === true,
									onChange: function (e) { onFieldChange(field, e.target.checked); }
								});
							} else if (field.kind === "json") {
								input = h("textarea", {
									spellCheck: false,
									defaultValue: field.text,
									onBlur: function (e) { onFieldChange(field, e.target.value); }
								});
							} else if (field.kind === "null") {
								input = h("input", { type: "text", value: "null", readOnly: true });
							} else {
								var shown = texts[pathKey] !== undefined ? texts[pathKey] : field.text;
								input = h("input", {
									type: field.kind === "number" ? "text" : "text",
									value: shown,
									onChange: function (e) {
										var text = e.target.value;
										setTexts(Object.assign({}, texts, (function () { var o = {}; o[pathKey] = text; return o; })()));
										onFieldChange(field, text);
									},
									onBlur: function () {
										var copy = Object.assign({}, texts);
										delete copy[pathKey];
										setTexts(copy);
									}
								});
							}
							return h("div", { className: "am-field", key: pathKey },
								h("label", null, label),
								h("div", { className: "am-input" }, input)
							);
						})
					),
					h("div", { className: "am-addrow" },
						h("input", {
							type: "text",
							placeholder: tr(t, "am.config.addKey"),
							value: addKey,
							onChange: function (e) { setAddKey(e.target.value); }
						}),
						h("button", { className: "am-btn", type: "button", onClick: addField }, tr(t, "am.config.add"))
					)
				);
			}

			return h("div", { className: "am-sec" },
				h("div", { className: "am-bar" },
					h("select", {
						className: "am-btn",
						value: pick,
						onChange: function (e) { setPick(e.target.value); }
					},
						h("option", { value: "" }, tr(t, "am.config.pick")),
						withConfig.map(function (p) {
							return h("option", { key: p.id, value: p.id }, p.name + " (" + p.id + ")");
						})),
					pick ? h("div", { className: "am-bar" },
						h("button", { className: "am-btn", type: "button", "data-on": String(mode === "form"), onClick: function () { setMode("form"); } }, tr(t, "am.config.form")),
						h("button", { className: "am-btn", type: "button", onClick: function () { setMode("json"); setJson(value === null || value === undefined ? "" : JSON.stringify(value, null, 2)); } }, tr(t, "am.config.json")),
						h("button", { className: "am-btn", type: "button", "data-kind": "primary", disabled: busy, onClick: function () { save(value); } }, tr(t, "am.config.save")),
						h("button", { className: "am-btn", type: "button", "data-kind": "danger", disabled: busy, onClick: function () { if (window.confirm(tr(t, "am.config.clear") + "?")) save(null); } }, tr(t, "am.config.clear"))
					) : null
				),
				error ? h("div", { className: "am-msg", "data-tone": "error" }, error) : null,
				pick ? h("div", { className: "am-note" }, tr(t, "am.config.hint")) : null,
				body
			);
		}

		// ── prefs tab ──────────────────────────────────────────────────────
		function PrefsTab(props) {
			var t = props.t;
			var notify = props.notify;
			var tickState = React.useState(0);
			var setTick = tickState[1];
			var bump = function () { setTick(function (n) { return n + 1; }); };

			var row = function (field, labelKey, type) {
				var value = prefGet(field);
				if (type === "boolean") {
					return h("label", { className: "am-check", key: field },
						h("input", {
							type: "checkbox",
							checked: value === true,
							onChange: function (e) { prefSet(field, e.target.checked); bump(); }
						}),
						tr(t, labelKey));
				}
				return h("div", { className: "am-field", key: field },
					h("label", null, tr(t, labelKey)),
					h("div", { className: "am-input" },
						h("select", {
							value: String(value),
							onChange: function (e) { prefSet(field, e.target.value); bump(); }
						},
							h("option", { value: "plugins" }, tr(t, "am.tab.plugins")),
							h("option", { value: "config" }, tr(t, "am.tab.config")),
							h("option", { value: "prefs" }, tr(t, "am.tab.prefs"))))
				);
			};

			return h("div", { className: "am-sec" },
				h("div", { className: "am-note" }, tr(t, "am.prefs.title")),
				h("div", { className: "am-fields" },
					row("confirmBulk", "am.prefs.confirmBulk", "boolean"),
					row("exportConfig", "am.prefs.exportConfig", "boolean"),
					row("exportSources", "am.prefs.exportSources", "boolean"),
					row("showDisabledOnly", "am.prefs.showDisabledOnly", "boolean"),
					row("defaultTab", "am.prefs.defaultTab", "select")
				),
				h("div", { className: "am-note" }, tr(t, "am.prefs.saved"))
			);
		}

		// ── section ────────────────────────────────────────────────────────
		function AddonsSection(props) {
			var t = (props && props.t) || tRef;
			var tabState = React.useState(String(prefGet("defaultTab") || "plugins"));
			var tab = tabState[0];
			var setTab = tabState[1];
			var selectedState = React.useState([]);
			var selected = selectedState[0];
			var setSelected = selectedState[1];
			var snapState = React.useState({ data: null, error: null, busy: false });
			var snapData = snapState[0];
			var setSnapData = snapState[1];
			var noticeState = React.useState(null);
			var notice = noticeState[0];
			var setNotice = noticeState[1];
			var restartState = React.useState(false);
			var needsRestart = restartState[0];
			var setNeedsRestart = restartState[1];

			var load = React.useCallback(function () {
				return call("snapshot", {}).then(function (d) {
					setSnapData({ data: d, error: null, busy: false });
					return d;
				}).catch(function (e) {
					setSnapData({ data: null, error: errText(e), busy: false });
					return null;
				});
			}, []);

			React.useEffect(function () { load(); }, [load]);

			var snap = {
				plugins: snapData.data ? snapData.data.plugins : null,
				reload: load
			};
			var notify = function (text, tone) { setNotice({ text: text, tone: tone || "ok" }); };
			var markRestart = function () { setNeedsRestart(true); };

			return h("div", { className: "am-sec am-root", style: { "--am-scheme": SCHEME } },
				h("div", { className: "am-tabs" },
					[["plugins", "am.tab.plugins"], ["config", "am.tab.config"], ["prefs", "am.tab.prefs"]].map(function (pair) {
						return h("button", {
							key: pair[0],
							className: "am-tab",
							type: "button",
							"data-on": String(tab === pair[0]),
							onClick: function () { setTab(pair[0]); }
						}, tr(t, pair[1]));
					})
				),
				needsRestart ? h("div", { className: "am-banner" }, tr(t, "am.msg.restart")) : null,
				notice ? h("div", { className: "am-msg", "data-tone": notice.tone }, notice.text) : null,
				snapData.error ? h("div", { className: "am-msg", "data-tone": "error" }, tr(t, "am.msg.error", { e: snapData.error })) : null,
				tab === "plugins" ? h(PluginsTab, { t: t, snap: snap, selected: selected, setSelected: setSelected, notify: notify, restart: markRestart }) : null,
				tab === "config" ? h(ConfigTab, { t: t, snap: snap, notify: notify, restart: markRestart }) : null,
				tab === "prefs" ? h(PrefsTab, { t: t, notify: notify }) : null
			);
		}

		// ── plugin face ────────────────────────────────────────────────────
		function apply(ctx) {
			ctxRef = ctx;
			ctx.locale.register(NS, DICT);
			tRef = ctx.locale.bind(NS);
			return ctx.remote.$mount(REMOTE_CONTRIBUTION).then(function () {
				apiRef = ctx.reflect.get("remote.addonManager");
				if (!apiRef) throw new Error("addonManager namespace failed to mount");
				try {
					settingsHost = ctx.settingsScope.bind({ namespace: PREF_NS });
				} catch (e) {
					settingsHost = null;
				}
				if (typeof document !== "undefined") { SCHEME = detectScheme(); injectStyle(CSS_TAG, CSS, "dsh-addons-manager"); }
				ctx.slots.inject("settings.section", function () {
					return ctx.slots.register({
						name: "settings.section",
						id: SECTION_ID,
						order: SECTION_ORDER,
						label: function () { return tRef("am.nav"); }
					}, AddonsSection);
				});
				return undefined;
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		// Exported for test/client.test.mjs only; the loader reads apply/inject.
		exports.__components = { AddonsSection: AddonsSection, PluginsTab: PluginsTab, ConfigTab: ConfigTab, PrefsTab: PrefsTab, call: call };
		return module.exports;
	}
});
