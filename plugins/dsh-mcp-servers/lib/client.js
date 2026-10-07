// Browser half of dsh-mcp-servers.
//
// Served verbatim by the host's client-modules bundle route and executed
// through the lazy CJS module table: the factory receives `require` and must
// register itself with `window.__ModuleLoader__.load`.
//
// Registers one section in the DSH Web settings page (`settings.section`, id
// `mcp-servers`, order 93 — directly below the extension hub's plugin manager)
// with two tabs:
//   الخوادم — server list with enable/disable, restart and live tool counts
//   خادم جديد — add or edit a server (stdio / http / sse forms)
window.__ModuleLoader__.load({
	id: "dsh-mcp-servers",
	factory: (require) => {
		"use strict";
		var module = { exports: {} };
		var exports = module.exports;
		var React = require("react");
		var h = React.createElement;

		var inject = ["slots", "connection", "remote", "locale", "settingsScope"];
		var NS = "mcpServers";
		var PREF_NS = "mcp-servers";
		var SECTION_ID = "mcp-servers";
		var SECTION_ORDER = 93;

		// ── copy ───────────────────────────────────────────────────────────
		var DICT = {
			en: {
				"ms.nav": "MCP servers",
				"ms.tab.servers": "Servers",
				"ms.tab.new": "New server",
				"ms.servers.search": "Filter servers…",
				"ms.servers.refresh": "Reload",
				"ms.servers.on": "Enabled",
				"ms.servers.off": "Disabled",
				"ms.servers.loading": "Loading MCP servers…",
				"ms.servers.empty": "No MCP server is registered yet. Use “New server” to add one.",
				"ms.servers.toggle": "Switch",
				"ms.servers.edit": "Edit",
				"ms.servers.delete": "Delete",
				"ms.servers.confirm": "Switch {n} server(s)? A restart of dsh web applies it.",
				"ms.servers.confirmDelete": "Delete {name}? This removes its row from the profile.",
				"ms.servers.transport": "transport: {t}",
				"ms.servers.tools": "{n} tools",
				"ms.servers.reachable": "reachable",
				"ms.servers.unreachable": "not reachable",
				"ms.servers.noTools": "No tools reported",
				"ms.new.title": "Add an MCP server",
				"ms.new.editTitle": "Edit {name}",
				"ms.new.id": "Server id",
				"ms.new.idHint": "lowercase letters, digits, - or _",
				"ms.new.serverName": "Display name",
				"ms.new.transport": "Transport",
				"ms.new.command": "Command",
				"ms.new.commandHint": "e.g. npx -y @modelcontextprotocol/server-filesystem /tmp",
				"ms.new.url": "Server URL",
				"ms.new.urlHint": "https://example.com/mcp",
				"ms.new.env": "Environment (KEY=value per line)",
				"ms.new.save": "Save server",
				"ms.new.update": "Update server",
				"ms.new.cancel": "Cancel",
				"ms.new.invalid": "Fix these first: {e}",
				"ms.msg.restart": "Restart dsh web to apply these changes.",
				"ms.msg.error": "Failed: {e}",
				"ms.msg.done": "Done.",
				"ms.msg.changed": "{n} server(s) changed.",
				"ms.msg.saved": "Server saved. Restart dsh web to mount it."
			},
			ar: {
				"ms.nav": "خوادم MCP",
				"ms.tab.servers": "الخوادم",
				"ms.tab.new": "خادم جديد",
				"ms.servers.search": "ابحث في الخوادم…",
				"ms.servers.refresh": "تحديث",
				"ms.servers.on": "مفعّل",
				"ms.servers.off": "معطّل",
				"ms.servers.loading": "جاري تحميل خوادم MCP…",
				"ms.servers.empty": "لا يوجد خادم MCP مسجّل بعد. استخدم «خادم جديد» لإضافة واحد.",
				"ms.servers.toggle": "تبديل",
				"ms.servers.edit": "تعديل",
				"ms.servers.delete": "حذف",
				"ms.servers.confirm": "تغيير حالة {n} خادم؟ يطبّق الأمر بعد إعادة تشغيل dsh web.",
				"ms.servers.confirmDelete": "حذف {name}؟ هذا يزيل صفه من البروفايل.",
				"ms.servers.transport": "النوع: {t}",
				"ms.servers.tools": "{n} أداة",
				"ms.servers.reachable": "متصل",
				"ms.servers.unreachable": "غير متصل",
				"ms.servers.noTools": "لا توجد أدوات",
				"ms.new.title": "إضافة خادم MCP",
				"ms.new.editTitle": "تعديل {name}",
				"ms.new.id": "معرّف الخادم",
				"ms.new.idHint": "حروف صغيرة، أرقام، - أو _",
				"ms.new.serverName": "الاسم المعروض",
				"ms.new.transport": "النوع",
				"ms.new.command": "الأمر",
				"ms.new.commandHint": "مثال: npx -y @modelcontextprotocol/server-filesystem /tmp",
				"ms.new.url": "رابط الخادم",
				"ms.new.urlHint": "https://example.com/mcp",
				"ms.new.env": "متغيرات البيئة (مفتاح=قيمة في كل سطر)",
				"ms.new.save": "حفظ الخادم",
				"ms.new.update": "تحديث الخادم",
				"ms.new.cancel": "إلغاء",
				"ms.new.invalid": "صحّح أولاً: {e}",
				"ms.msg.restart": "أعد تشغيل dsh web لتطبيق هذه التغييرات.",
				"ms.msg.error": "فشل: {e}",
				"ms.msg.done": "تم.",
				"ms.msg.changed": "تغيّر {n} خادم.",
				"ms.msg.saved": "تم حفظ الخادم. أعد تشغيل dsh web لتركيبه."
			}
		};

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
			if (!e) return (tRef || function (k) { return k; })("ms.msg.error");
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
		var PREF_DEFAULTS = { confirmToggle: false, showTools: true, defaultTab: "servers" };
		function prefGet(field) {
			if (!settingsHost) return PREF_DEFAULTS[field];
			try {
				var snap = settingsHost.getSnapshot();
				var value = snap && snap.value ? snap.value : null;
				if (value && value[field] !== undefined && value[field] !== null) return value[field];
			} catch (e) { /* fall through */ }
			return PREF_DEFAULTS[field];
		}

		// ── CSS ────────────────────────────────────────────────────────────
		var CSS = [
			".ms-sec{flex:1 1 auto;display:flex;flex-direction:column;min-height:0;min-width:0;gap:14px;font-size:14px;color:var(--dsw-alias-label-primary,#15171c)}",
			".ms-tabs{display:flex;gap:6px;flex:0 0 auto;flex-wrap:wrap}",
			".ms-tab{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#15171c)}",
			".ms-tab[data-on=\"true\"]{background:var(--dsw-alias-interactive-bg-active,var(--dsw-alias-bg-module-platform,#fff));color:var(--dsw-alias-label-active,var(--dsw-alias-label-primary));border-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-border-l1));font-weight:600}",
			".ms-banner{font-size:12px;flex:0 0 auto;color:var(--dsw-alias-label-warning,var(--dsw-alias-label-primary));border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:8px 10px}",
			".ms-msg{font-size:12px;flex:0 0 auto;border-radius:6px;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l2);white-space:pre-wrap;word-break:break-word;max-height:220px;overflow:auto}",
			".ms-msg[data-tone=\"error\"]{color:var(--dsw-alias-label-danger,var(--dsw-alias-label-primary))}",
			".ms-msg[data-tone=\"ok\"]{color:var(--dsw-alias-label-success,var(--dsw-alias-label-primary))}",
			".ms-list{flex:1 1 auto;display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto;padding-right:2px}",
			".ms-card{border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff))}",
			".ms-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}",
			".ms-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,#15171c)}",
			".ms-id{font-size:12px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));font-family:ui-monospace,SFMono-Regular,Menlo,monospace}",
			".ms-pill{font-size:11px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 9px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));white-space:nowrap}",
			".ms-pill[data-on=\"true\"]{color:var(--dsw-alias-label-success,var(--dsw-alias-label-primary))}",
			".ms-pill[data-on=\"false\"]{color:var(--dsw-alias-label-danger,var(--dsw-alias-label-primary))}",
			".ms-actions{display:flex;gap:8px;flex-wrap:wrap;margin-inline-start:auto}",
			".ms-btn{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;padding:5px 12px;font:inherit;font-size:12px;cursor:pointer;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#15171c)}",
			".ms-btn:hover{background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-module-platform,#fff))}",
			".ms-btn[data-kind=\"danger\"]{color:var(--dsw-alias-label-danger,var(--dsw-alias-label-primary))}",
			".ms-btn[disabled]{opacity:.5;cursor:default}",
			".ms-cmd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-primary,#15171c);background:var(--dsw-alias-bg-layer-1,rgba(0,0,0,.04));border-radius:6px;padding:8px}",
			".ms-tools{display:flex;flex-wrap:wrap;gap:6px}",
			".ms-tool{font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:2px 8px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary))}",
			".ms-note{font-size:12px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary))}",
			".ms-search{display:flex;gap:8px;align-items:center;flex:0 0 auto}",
			".ms-search input{flex:1;min-width:0;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#15171c);border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;height:34px;padding:0 10px;font:inherit;font-size:13px}",
			".ms-fields{display:flex;flex-direction:column;gap:10px;flex:0 0 auto}",
			".ms-field{display:flex;gap:10px;align-items:flex-start}",
			".ms-field label{flex:0 0 180px;font-size:12px;color:var(--dsw-alias-label-secondary,var(--dsw-alias-label-primary));padding-top:7px;word-break:break-word}",
			".ms-field .ms-input{flex:1;min-width:0}",
			".ms-input input[type=\"text\"],.ms-input textarea,.ms-input select{width:100%;background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary,#15171c);border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;padding:6px 8px;font:inherit;font-size:13px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}",
			".ms-input textarea{min-height:96px;resize:vertical;white-space:pre}",
			".ms-input .ms-hint{display:block;margin-top:4px;font-size:11px;color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary,#888))}",
			".ms-panel{flex:0 0 auto;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:12px}"
		].join("\n");
		var CSS_TAG = "dsh-mcp-servers/section.css";

		function injectStyle(tagId, css, plugin) {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") !== null) return;
			var tag = document.createElement("style");
			tag.dataset.plugin = plugin;
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

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
		var REMOTE_METHODS = ["snapshot", "setEnabled", "upsert", "remove"];
		function passthroughCodec(typeSymbol) {
			return { mode: "strict", typeSymbol: typeSymbol, schema: { parse: function (v) { return v; } } };
		}
		function makeRemoteContribution() {
			var descriptors = [];
			for (var i = 0; i < REMOTE_METHODS.length; i++) {
				descriptors.push({
					id: "dsh-mcp-servers#mcpServers/" + REMOTE_METHODS[i],
					service: "mcpServers",
					namespace: "mcpServers",
					method: REMOTE_METHODS[i],
					invocation: { kind: "direct" },
					parameters: [{ name: "input", wire: "input", source: "json", codec: passthroughCodec("dsh-mcp-servers/types#Input") }],
					result: passthroughCodec("dsh-mcp-servers/types#Result")
				});
			}
			return { package: "dsh-mcp-servers", descriptors: descriptors };
		}
		var REMOTE_CONTRIBUTION = makeRemoteContribution();

		// ── helpers ────────────────────────────────────────────────────────
		function envToText(env) {
			if (!env) return "";
			return Object.keys(env).map(function (k) { return k + "=" + env[k]; }).join("\n");
		}
		function textToEnv(text) {
			var env = {};
			String(text || "").split("\n").forEach(function (line) {
				var i = line.indexOf("=");
				if (i <= 0) return;
				var k = line.slice(0, i).trim();
				if (!k) return;
				env[k] = line.slice(i + 1);
			});
			return env;
		}
		function commandText(server) {
			if (!server) return "";
			if (server.transport !== "stdio") return server.url || "";
			var parts = [server.command || ""].concat(server.args || []);
			return parts.filter(Boolean).join(" ");
		}

		// ── servers tab ────────────────────────────────────────────────────
		function ServerCard(props) {
			var t = props.t;
			var server = props.server;
			var onToggle = props.onToggle;
			var onEdit = props.onEdit;
			var onDelete = props.onDelete;
			var busy = !!props.busy;

			var doDelete = function () {
				var label = server.serverName || server.id;
				var msg = tr(t, "ms.servers.confirmDelete", { name: label });
				if (typeof window !== "undefined" && window.confirm && !window.confirm(msg)) return;
			onDelete(server.id);
			};

			return h("div", { className: "ms-card", key: server.id },
				h("div", { className: "ms-head" },
					h("span", { className: "ms-title" }, server.serverName || server.id),
					h("span", { className: "ms-id" }, server.id),
					h("span", { className: "ms-pill", "data-on": String(server.disabled === false) },
						server.disabled ? tr(t, "ms.servers.off") : tr(t, "ms.servers.on")),
					h("span", { className: "ms-pill" }, tr(t, "ms.servers.transport", { t: server.transport || "stdio" })),
					server.reachable === true ? h("span", { className: "ms-pill", "data-on": "true" }, tr(t, "ms.servers.reachable")) : null,
					server.reachable === false ? h("span", { className: "ms-pill", "data-on": "false" }, tr(t, "ms.servers.unreachable")) : null,
					server.tools && server.tools.length ? h("span", { className: "ms-pill" }, tr(t, "ms.servers.tools", { n: server.tools.length })) : null,
					h("div", { className: "ms-actions" },
						h("button", { className: "ms-btn", type: "button", disabled: busy, onClick: function () { onToggle(server.id, !server.disabled); } }, tr(t, "ms.servers.toggle")),
						h("button", { className: "ms-btn", type: "button", disabled: busy, onClick: function () { onEdit(server); } }, tr(t, "ms.servers.edit")),
						h("button", { className: "ms-btn", "data-kind": "danger", type: "button", disabled: busy, onClick: doDelete }, tr(t, "ms.servers.delete"))
					)
				),
				h("div", { className: "ms-cmd" }, commandText(server) || "—"),
				(server.env && Object.keys(server.env).length) ? h("div", { className: "ms-note" }, envToText(server.env)) : null,
				(prefGet("showTools") && server.tools && server.tools.length) ? h("div", { className: "ms-tools" },
					server.tools.map(function (tool) {
						return h("span", { className: "ms-tool", key: tool.name, title: tool.description || "" }, tool.name);
					})
				) : null
			);
		}

		function ServersTab(props) {
			var t = props.t;
			var snap = props.snap;
			var onToggle = props.onToggle;
			var onEdit = props.onEdit;
			var onDelete = props.onDelete;
			var goNew = props.goNew;

			var queryState = React.useState("");
			var query = queryState[0];
			var setQuery = queryState[1];

			// Keep null distinct from []: null means "still fetching" and drives
			// the loading note, [] means "fetched and empty". `|| []` would fold
			// both into [] and make the loading branch dead code.
			var servers = snap.servers === undefined ? [] : snap.servers;
			var loading = servers === null;
			var filtered = loading ? [] : servers.filter(function (s) {
				if (!query) return true;
				var hay = (s.id + " " + (s.serverName || "") + " " + commandText(s)).toLowerCase();
				return hay.indexOf(query.toLowerCase()) !== -1;
			});

			if (loading) return h("div", { className: "ms-note" }, tr(t, "ms.servers.loading"));
			if (!servers.length) {
				return h("div", { className: "ms-panel" },
					h("div", { className: "ms-note" }, tr(t, "ms.servers.empty")),
					h("div", null,
						h("button", { className: "ms-btn", type: "button", onClick: goNew }, tr(t, "ms.tab.new"))
					)
				);
			}

			return h(React.Fragment, null,
				h("div", { className: "ms-search" },
					h("input", { type: "text", placeholder: tr(t, "ms.servers.search"), value: query, onChange: function (e) { setQuery(e.target.value); } })
				),
				filtered.length
					? h("div", { className: "ms-list" },
						filtered.map(function (s) {
							return h(ServerCard, { t: t, server: s, busy: snap.busy, onToggle: onToggle, onEdit: onEdit, onDelete: onDelete, key: s.id });
						})
					)
					: h("div", { className: "ms-note" }, tr(t, "ms.servers.empty"))
			);
		}

		// ── new/edit tab ───────────────────────────────────────────────────
		function NewServerTab(props) {
			var t = props.t;
			var draft = props.draft;
			var setDraft = props.setDraft;
			var onSave = props.onSave;
			var onCancel = props.onCancel;
			var saving = !!props.saving;
			var formError = props.formError;

			var isEdit = !!(draft && draft.editing);

			var upd = function (field, value) {
				var next = Object.assign({}, draft);
				next[field] = value;
				if (field === "transport") {
					if (value === "stdio") { next.url = ""; } else { next.command = ""; next.args = []; next.envText = ""; }
				}
				setDraft(next);
			};

			var envText = draft.envText === undefined ? envToText(draft.env) : draft.envText;

			return h("div", { className: "ms-panel" },
				h("h4", { style: { margin: 0, fontSize: "13px", fontWeight: 600 } },
					isEdit ? tr(t, "ms.new.editTitle", { name: draft.editing }) : tr(t, "ms.new.title")),
				h("div", { className: "ms-fields" },
					h("label", { className: "ms-field" },
						h("span", null, tr(t, "ms.new.id")),
						h("span", { className: "ms-input" },
							h("input", { type: "text", value: draft.id || "", disabled: isEdit, spellCheck: false,
								onChange: function (e) { upd("id", e.target.value); } }),
							h("span", { className: "ms-hint" }, tr(t, "ms.new.idHint"))
						)
					),
					h("label", { className: "ms-field" },
						h("span", null, tr(t, "ms.new.serverName")),
						h("span", { className: "ms-input" },
							h("input", { type: "text", value: draft.serverName || "", spellCheck: false,
								onChange: function (e) { upd("serverName", e.target.value); } })
						)
					),
					h("label", { className: "ms-field" },
						h("span", null, tr(t, "ms.new.transport")),
						h("span", { className: "ms-input" },
							h("select", { value: draft.transport || "stdio", onChange: function (e) { upd("transport", e.target.value); } },
								["stdio", "http", "sse"].map(function (tr_) {
									return h("option", { key: tr_, value: tr_ }, tr_);
								})
							)
						)
					),
					(draft.transport || "stdio") === "stdio"
						? h("label", { className: "ms-field" },
							h("span", null, tr(t, "ms.new.command")),
							h("span", { className: "ms-input" },
								h("input", { type: "text", value: draft.command === undefined ? commandText(draft) : draft.command, spellCheck: false,
									placeholder: tr(t, "ms.new.commandHint"),
									onChange: function (e) { upd("command", e.target.value); } })
							)
						)
						: h("label", { className: "ms-field" },
							h("span", null, tr(t, "ms.new.url")),
							h("span", { className: "ms-input" },
								h("input", { type: "text", value: draft.url || "", spellCheck: false,
									placeholder: tr(t, "ms.new.urlHint"),
									onChange: function (e) { upd("url", e.target.value); } })
							)
						),
					(draft.transport || "stdio") === "stdio"
						? h("label", { className: "ms-field" },
							h("span", null, tr(t, "ms.new.env")),
							h("span", { className: "ms-input" },
								h("textarea", { value: envText, spellCheck: false,
									onChange: function (e) { setDraft(Object.assign({}, draft, { envText: e.target.value })); } })
							)
						)
						: null
				),
				formError ? h("div", { className: "ms-msg", "data-tone": "error" }, tr(t, "ms.new.invalid", { e: formError })) : null,
				h("div", { className: "ms-head" },
					h("button", { className: "ms-btn", type: "button", disabled: saving, onClick: onSave },
						isEdit ? tr(t, "ms.new.update") : tr(t, "ms.new.save")),
					h("button", { className: "ms-btn", type: "button", disabled: saving, onClick: onCancel }, tr(t, "ms.new.cancel"))
				)
			);
		}

		// ── section ────────────────────────────────────────────────────────
		function McpSection(props) {
			var t = (props && props.t) || tRef;
			var tabState = React.useState(String(prefGet("defaultTab") || "servers"));
			var tab = tabState[0];
			var setTab = tabState[1];
			var snapState = React.useState({ servers: null, error: null, busy: false });
			var snap = snapState[0];
			var setSnap = snapState[1];
			var noticeState = React.useState(null);
			var notice = noticeState[0];
			var setNotice = noticeState[1];
			var restartState = React.useState(false);
			var needsRestart = restartState[0];
			var setNeedsRestart = restartState[1];
			var draftState = React.useState({ id: "", serverName: "", transport: "stdio", command: "", url: "", envText: "" });
			var draft = draftState[0];
			var setDraft = draftState[1];
			var formErrorState = React.useState("");
			var formError = formErrorState[0];
			var setFormError = formErrorState[1];

			var load = React.useCallback(function () {
				setSnap(function (s) { return Object.assign({}, s, { busy: true }); });
				return call("snapshot", { live: true }).then(function (d) {
					setSnap({ servers: (d && d.servers) || [], error: null, busy: false });
					return d;
				}).catch(function (e) {
					setSnap({ servers: null, error: errText(e), busy: false });
					return null;
				});
			}, []);

			React.useEffect(function () { load(); }, [load]);

			var notify = function (text, tone) { setNotice({ text: text, tone: tone || "ok" }); };
			var markRestart = function () { setNeedsRestart(true); };

			var onToggle = function (id, enable) {
				var count = (snap.servers || []).length;
				if (prefGet("confirmToggle")) {
					var msg = tr(t, "ms.servers.confirm", { n: 1 });
					if (typeof window !== "undefined" && window.confirm && !window.confirm(msg)) return;
				}
				setSnap(function (s) { return Object.assign({}, s, { busy: true }); });
				call("setEnabled", { ids: [id], enabled: !!enable }).then(function (r) {
					var changed = r && r.changed ? r.changed.length : 0;
					notify(tr(t, "ms.msg.changed", { n: changed }), "ok");
					markRestart();
					return load();
				}).catch(function (e) { notify(errText(e), "error"); setSnap(function (s) { return Object.assign({}, s, { busy: false }); }); });
			};

			var onDelete = function (id) {
				setSnap(function (s) { return Object.assign({}, s, { busy: true }); });
				call("remove", { id: id }).then(function () {
					notify(tr(t, "ms.msg.done"), "ok");
					markRestart();
					return load();
				}).catch(function (e) { notify(errText(e), "error"); setSnap(function (s) { return Object.assign({}, s, { busy: false }); }); });
			};

			var onEdit = function (server) {
				var parts = [server.command || ""].concat(server.args || []);
				setDraft({
					editing: server.id,
					id: server.id,
					serverName: server.serverName || server.id,
					transport: server.transport || "stdio",
					command: parts.filter(Boolean).join(" "),
					url: server.url || "",
					envText: envToText(server.env)
				});
				setFormError("");
				setTab("new");
			};

			var goNew = function () {
				setDraft({ id: "", serverName: "", transport: "stdio", command: "", url: "", envText: "" });
				setFormError("");
				setTab("new");
			};

			var onSave = function () {
				var payload = {
					id: draft.id,
					serverName: draft.serverName,
					transport: draft.transport || "stdio",
					replace: !!draft.editing
				};
				if (payload.transport === "stdio") {
					payload.command = draft.command || "";
					var envTextVal = draft.envText === undefined ? envToText(draft.env) : draft.envText;
					payload.env = textToEnv(envTextVal);
				} else {
					payload.url = draft.url || "";
				}
				call("upsert", payload).then(function (r) {
					if (r && r.ok === false) {
						var detail = r.errors && r.errors.length ? r.errors.join("; ") : tr(t, "ms.msg.error", { e: "rejected" });
						setFormError(detail);
						return null;
					}
					setFormError("");
					notify(tr(t, "ms.msg.saved"), "ok");
					markRestart();
					goNew();
					setTab("servers");
					return load();
				}).catch(function (e) { setFormError(errText(e)); });
			};

			var onCancel = function () {
				goNew();
				setTab("servers");
			};

			return h("div", { className: "ms-sec", style: { "--am-scheme": SCHEME } },
				h("div", { className: "ms-tabs" },
					[["servers", "ms.tab.servers"], ["new", "ms.tab.new"]].map(function (pair) {
						return h("button", {
							key: pair[0],
							className: "ms-tab",
							type: "button",
							"data-on": String(tab === pair[0]),
							onClick: function () { if (pair[0] === "new") goNew(); else setTab(pair[0]); }
						}, tr(t, pair[1]));
					})
				),
				needsRestart ? h("div", { className: "ms-banner" }, tr(t, "ms.msg.restart")) : null,
				notice ? h("div", { className: "ms-msg", "data-tone": notice.tone }, notice.text) : null,
				snap.error ? h("div", { className: "ms-msg", "data-tone": "error" }, tr(t, "ms.msg.error", { e: snap.error })) : null,
				tab === "servers"
					? h(ServersTab, { t: t, snap: snap, onToggle: onToggle, onEdit: onEdit, onDelete: onDelete, goNew: goNew })
					: h(NewServerTab, { t: t, draft: draft, setDraft: setDraft, onSave: onSave, onCancel: onCancel, saving: snap.busy, formError: formError })
			);
		}

		// ── plugin face ────────────────────────────────────────────────────
		function apply(ctx) {
			ctxRef = ctx;
			ctx.locale.register(NS, DICT);
			tRef = ctx.locale.bind(NS);
			return ctx.remote.$mount(REMOTE_CONTRIBUTION).then(function () {
				apiRef = ctx.reflect.get("remote.mcpServers");
				if (!apiRef) throw new Error("mcpServers namespace failed to mount");
				try {
					settingsHost = ctx.settingsScope.bind({ namespace: PREF_NS });
				} catch (e) {
					settingsHost = null;
				}
				if (typeof document !== "undefined") { SCHEME = detectScheme(); injectStyle(CSS_TAG, CSS, "dsh-mcp-servers"); }
				ctx.slots.inject("settings.section", function () {
					return ctx.slots.register({
						name: "settings.section",
						id: SECTION_ID,
						order: SECTION_ORDER,
						label: function () { return tRef("ms.nav"); }
					}, McpSection);
				});
				return undefined;
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__components = { McpSection: McpSection, ServersTab: ServersTab, NewServerTab: NewServerTab, ServerCard: ServerCard, call: call };
		return module.exports;
	}
});
