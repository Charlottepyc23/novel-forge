window.__ModuleLoader__.load({
	id: "@ryan/dsh-novel-forge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_dom_client = require("react-dom/client");
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/protocol.ts
		/**
		* dsh-novel-forge — shared protocol between the host half (Node) and the
		* browser half (web GUI). Route paths, request/response shapes, the project
		* state file format, and the NDJSON generation stream frames all live here so
		* both halves spell exactly one vocabulary.
		*/
		/** The /api/dsh-novel-forge route family (same-origin, loopback-fenced). */
		const NOVEL_API = {
			status: "/api/dsh-novel-forge/status",
			loadOutline: "/api/dsh-novel-forge/load-outline",
			saveOutline: "/api/dsh-novel-forge/save-outline",
			plan: "/api/dsh-novel-forge/plan",
			volumes: "/api/dsh-novel-forge/volumes",
			bible: "/api/dsh-novel-forge/bible",
			assets: "/api/dsh-novel-forge/assets",
			styleEngine: "/api/dsh-novel-forge/style-engine",
			generate: "/api/dsh-novel-forge/generate",
			review: "/api/dsh-novel-forge/review",
			rewrite: "/api/dsh-novel-forge/rewrite",
			polish: "/api/dsh-novel-forge/polish",
			summary: "/api/dsh-novel-forge/summary",
			foreshadow: "/api/dsh-novel-forge/foreshadow",
			exportBook: "/api/dsh-novel-forge/export",
			chapter: "/api/dsh-novel-forge/chapter",
			assistant: "/api/dsh-novel-forge/assistant",
			assistantHistory: "/api/dsh-novel-forge/assistant-history",
			bookshelf: "/api/dsh-novel-forge/bookshelf",
			config: "/api/dsh-novel-forge/config",
			openFolder: "/api/dsh-novel-forge/open-folder"
		};
		//#endregion
		//#region src/client/api.ts
		/**
		* Browser-side API client for the /api/dsh-novel-forge route family. Plain
		* fetch, same origin; generation/rewrite/polish ride NDJSON streams read
		* incrementally.
		*/
		/** Error carrying the route's JSON error message. */
		var NovelApiError = class extends Error {
			constructor(message) {
				super(message);
				this.name = "NovelApiError";
			}
		};
		/** Parse a JSON response or throw a NovelApiError. */
		async function readJson(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new NovelApiError(`HTTP ${response.status}: invalid JSON response`);
			}
			if (!response.ok) throw new NovelApiError(typeof body === "object" && body !== null && typeof body.error === "string" ? body.error : `HTTP ${response.status}`);
			return body;
		}
		/** POST JSON, return parsed JSON. */
		async function postJson(path, payload) {
			return readJson(await fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload)
			}));
		}
		/** The browser half's only data entry point. */
		var NovelApi = class {
			async status() {
				return readJson(await fetch(NOVEL_API.status));
			}
			async loadOutline(path, text) {
				return postJson(NOVEL_API.loadOutline, {
					path,
					text
				});
			}
			async saveOutline(text) {
				return postJson(NOVEL_API.saveOutline, { text });
			}
			async plan(outline, chapterCount, volume) {
				return postJson(NOVEL_API.plan, {
					outline,
					chapterCount,
					volume
				});
			}
			async volumes(outline) {
				return postJson(NOVEL_API.volumes, { outline });
			}
			async bible(outline) {
				return postJson(NOVEL_API.bible, { outline });
			}
			async review(chapterNo) {
				return postJson(NOVEL_API.review, { chapterNo });
			}
			async summarize(chapterNo) {
				return postJson(NOVEL_API.summary, { chapterNo });
			}
			async foreshadow(req) {
				return postJson(NOVEL_API.foreshadow, req);
			}
			async exportBook(format) {
				return postJson(NOVEL_API.exportBook, { format });
			}
			async chapter(no) {
				return readJson(await fetch(`${NOVEL_API.chapter}?no=${no}`));
			}
			async patchConfig(patch) {
				return postJson(NOVEL_API.config, patch);
			}
			async openFolder() {
				await fetch(NOVEL_API.openFolder, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "{}"
				});
			}
			/** 书架快照。 */
			async bookshelf() {
				return readJson(await fetch(NOVEL_API.bookshelf));
			}
			/** 新建书并激活。 */
			async bookCreate(bookName, outputDir) {
				return postJson(NOVEL_API.bookshelf, {
					bookName,
					outputDir
				});
			}
			/** 切换当前书。 */
			async bookActivate(id) {
				return postJson("/api/dsh-novel-forge/bookshelf/activate", { id });
			}
			/** 移除书架条目。 */
			async bookRemove(id) {
				return postJson("/api/dsh-novel-forge/bookshelf/remove", { id });
			}
			/** Get project writing assets + built-in libraries. */
			async assets() {
				return readJson(await fetch(NOVEL_API.assets));
			}
			/** Patch project writing assets. */
			async patchAssets(patch) {
				return postJson(NOVEL_API.assets, patch);
			}
			/** Extract a style asset from sample text. */
			async styleEngine(req) {
				return postJson(NOVEL_API.styleEngine, req);
			}
			/**
			* Consume an NDJSON job stream (generate / rewrite / polish).
			* @param path - the route to POST to.
			* @param payload - the JSON body.
			* @param onFrame - receives every frame as it lands.
			*/
			async streamJob(path, payload, onFrame) {
				const response = await fetch(path, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(payload)
				});
				if (!response.ok) {
					await readJson(response);
					return;
				}
				if (response.body === null) throw new NovelApiError("job: no response body");
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) {
						if (line.trim() === "") continue;
						let frame;
						try {
							frame = JSON.parse(line);
						} catch {
							continue;
						}
						onFrame(frame);
						if (frame.type === "error") throw new NovelApiError(frame.message);
					}
				}
			}
			/** Generate one chapter. */
			async generate(chapterNo, skipReview, onFrame) {
				await this.streamJob(NOVEL_API.generate, {
					chapterNo,
					skipReview
				}, onFrame);
			}
			/** Rewrite one chapter (whole-chapter, or local when `target` is given). */
			async rewrite(chapterNo, instructions, target, onFrame) {
				await this.streamJob(NOVEL_API.rewrite, {
					chapterNo,
					instructions,
					target
				}, onFrame);
			}
			/** Polish (de-AI-ify) one chapter. */
			async polish(chapterNo, onFrame) {
				await this.streamJob(NOVEL_API.polish, { chapterNo }, onFrame);
			}
			/** Run one assistant turn (NDJSON stream). */
			async assistant(message, onFrame) {
				const response = await fetch(NOVEL_API.assistant, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ message })
				});
				if (!response.ok) {
					await readJson(response);
					return;
				}
				if (response.body === null) throw new NovelApiError("assistant: no response body");
				const reader = response.body.getReader();
				const decoder = new TextDecoder();
				let buffer = "";
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) {
						if (line.trim() === "") continue;
						let frame;
						try {
							frame = JSON.parse(line);
						} catch {
							continue;
						}
						onFrame(frame);
						if (frame.type === "error") throw new NovelApiError(frame.message);
					}
				}
			}
			/** Load the persisted assistant conversation. */
			async assistantHistory() {
				return (await readJson(await fetch(NOVEL_API.assistantHistory))).messages;
			}
		};
		//#endregion
		//#region src/client/locales.ts
		/**
		* dsh-novel-forge — locale dictionaries (zh / en).
		*/
		/** zh dictionary. */
		const zh$1 = {
			"entry.label": "小说工坊",
			"entry.tooltip": "AI 编译小说工作台：大纲 → 设定圣经 → 卷计划 → 章节计划 → 逐章生成+审稿",
			"panel.title": "小说工坊",
			"common.close": "关闭",
			"common.loading": "加载中…",
			"common.save": "保存",
			"common.error": "错误",
			"common.success": "成功",
			"common.generating": "生成中…",
			"common.chars": "字",
			"tab.workflow": "工作流",
			"tab.overview": "大纲",
			"tab.plan": "章节",
			"tab.bible": "设定库",
			"tab.foreshadow": "伏笔",
			"tab.assistant": "AI 助手",
			"tab.settings": "设置",
			"workflow.title": "创作工作流",
			"workflow.step1": "① 加载大纲",
			"workflow.step2": "② 提炼设定圣经",
			"workflow.step3": "③ 规划卷",
			"workflow.step4": "④ 生成章节计划",
			"workflow.step5": "⑤ 逐章写作 + AI 审稿",
			"workflow.step6": "⑥ 润色 / 导出",
			"workflow.loadOutline": "读取大纲",
			"workflow.genBible": "提炼设定圣经",
			"workflow.genVolumes": "生成卷计划",
			"workflow.genPlan": "生成章节计划",
			"workflow.done": "已完成",
			"workflow.todo": "待办",
			"workflow.bibleDone": "设定圣经已生成（{n} 条规则 / {c} 个角色 / {r} 条红线）",
			"workflow.volumesDone": "卷计划已生成（{n} 卷）",
			"workflow.planDone": "章节计划已生成（{n} 章）",
			"workflow.progress": "进度：大纲 ✓ · 设定 {bible} · 卷 {volumes} · 计划 {plan} · 已完成 {done}/{total} 章",
			"overview.loadDocx": "从 docx 读取大纲",
			"overview.loadDocxDefault": "读取默认大纲",
			"overview.loadingOutline": "正在解析 docx…",
			"overview.outlineHint": "大纲文本（可编辑）",
			"overview.outlineChars": "大纲字数",
			"overview.saveOutline": "保存大纲",
			"overview.saved": "大纲已保存",
			"overview.bookName": "书名",
			"overview.loadCustom": "指定 docx 路径",
			"overview.loadCustomHint": "绝对路径，留空使用默认",
			"plan.generate": "生成章节计划",
			"plan.generateHint": "章节数量",
			"plan.count": "章",
			"plan.empty": "暂无章节计划，请先生成",
			"plan.chapter": "章",
			"plan.pending": "待生成",
			"plan.generating": "生成中",
			"plan.written": "待审稿",
			"plan.reviewing": "审稿中",
			"plan.approved": "已通过",
			"plan.rejected": "待修订",
			"plan.error": "失败",
			"plan.write": "生成本章",
			"plan.rewrite": "修订",
			"plan.review": "审稿",
			"plan.polish": "去AI味",
			"plan.writeAll": "批量生成全部",
			"plan.writeAllPending": "批量生成剩余",
			"plan.generated": "已生成",
			"plan.progress": "进度",
			"plan.beats": "剧情要点",
			"plan.reviewReport": "审稿报告",
			"plan.reviewScore": "评分",
			"plan.reviewVerdict": "总评",
			"plan.reviewIssues": "问题清单",
			"plan.reviewPass": "通过",
			"plan.reviewFail": "未通过",
			"plan.approve": "手动通过",
			"plan.summary": "章节摘要",
			"plan.volumes": "卷",
			"plan.noVolume": "未分卷",
			"bible.title": "设定圣经",
			"bible.gen": "AI 提炼设定圣经",
			"bible.genre": "题材基调",
			"bible.worldRules": "世界规则",
			"bible.characters": "角色卡",
			"bible.redLines": "写作红线",
			"bible.style": "风格要求",
			"bible.none": "尚未生成设定圣经。生成后写作会严格遵守人设与金手指规则，审稿也会按红线检查。",
			"foreshadow.title": "伏笔管理",
			"foreshadow.suggest": "AI 建议伏笔",
			"foreshadow.none": "暂无伏笔",
			"foreshadow.status": "状态",
			"foreshadow.planned": "计划中",
			"foreshadow.planted": "已埋设",
			"foreshadow.progressing": "推进中",
			"foreshadow.resolved": "已回收",
			"foreshadow.abandoned": "已放弃",
			"foreshadow.target": "预计回收",
			"foreshadow.plantedAt": "埋设于",
			"foreshadow.setPlanted": "标记已埋设",
			"foreshadow.setResolved": "标记已回收",
			"settings.title": "设置",
			"settings.outlinePath": "默认大纲路径",
			"settings.outputDir": "输出目录",
			"settings.provider": "模型提供商",
			"settings.model": "模型",
			"settings.chapterChars": "每章目标字数",
			"settings.maxTokens": "单章最大输出 tokens",
			"settings.reviewPassScore": "审稿通过分数（0-100）",
			"settings.autoReview": "生成后自动审稿",
			"settings.save": "保存设置",
			"settings.saved": "设置已保存",
			"settings.openFolder": "打开输出文件夹",
			"settings.export": "导出",
			"settings.exportTxt": "导出 TXT",
			"settings.exportMd": "导出 Markdown",
			"settings.exported": "已导出：{file}（{chars} 字，{chapters} 章）",
			"progress.generating": "正在生成第 {no} 章《{title}》…",
			"progress.done": "第 {no} 章完成（{chars} 字）→ {file}",
			"progress.reviewed": "第 {no} 章审稿：{score} 分 — {verdict}",
			"progress.error": "第 {no} 章失败：{message}",
			"progress.rewriting": "正在修订第 {no} 章…",
			"progress.polishing": "正在润色第 {no} 章…",
			"progress.empty": "生成/审稿进度将显示在这里",
			"assistant.hint": "和 AI 编辑讨论剧情、人设、伏笔；达成一致后可让它直接修改大纲、设定圣经、章节内容。",
			"assistant.placeholder": "例如：我想让第 2 章结尾加一个悬念——墟境里传来爷爷的声音…",
			"assistant.send": "发送",
			"assistant.toolStart": "⚙ 执行操作：{name}…",
			"assistant.toolDone": "✓ {name} 完成：{detail}",
			"assistant.toolError": "✗ {name} 失败：{detail}",
			"assistant.empty": "还没有对话。和 AI 编辑聊聊剧情吧。",
			"status.projectNone": "输出目录中还没有项目。请先加载大纲。",
			"status.files": "已生成文件",
			"api.error": "请求失败"
		};
		/** en dictionary (fallback). */
		const en = {
			"entry.label": "Novel Forge",
			"entry.tooltip": "AI novel workbench: outline → bible → volumes → plan → write + review",
			"panel.title": "Novel Forge",
			"common.close": "Close",
			"common.loading": "Loading…",
			"common.save": "Save",
			"common.error": "Error",
			"common.success": "Success",
			"common.generating": "Generating…",
			"common.chars": " chars",
			"tab.workflow": "Workflow",
			"tab.overview": "Outline",
			"tab.plan": "Chapters",
			"tab.bible": "Bible",
			"tab.foreshadow": "Foreshadow",
			"tab.settings": "Settings",
			"workflow.title": "Writing workflow",
			"workflow.step1": "① Load outline",
			"workflow.step2": "② Extract story bible",
			"workflow.step3": "③ Plan volumes",
			"workflow.step4": "④ Plan chapters",
			"workflow.step5": "⑤ Write + AI review",
			"workflow.step6": "⑥ Polish / export",
			"workflow.loadOutline": "Load outline",
			"workflow.genBible": "Extract bible",
			"workflow.genVolumes": "Plan volumes",
			"workflow.genPlan": "Plan chapters",
			"workflow.done": "done",
			"workflow.todo": "todo",
			"workflow.bibleDone": "Bible ready ({n} rules / {c} characters / {r} red lines)",
			"workflow.volumesDone": "Volumes ready ({n})",
			"workflow.planDone": "Plan ready ({n} chapters)",
			"workflow.progress": "Outline ✓ · bible {bible} · volumes {volumes} · plan {plan} · {done}/{total} chapters",
			"overview.loadDocx": "Load outline from docx",
			"overview.loadDocxDefault": "Load default outline",
			"overview.loadingOutline": "Parsing docx…",
			"overview.outlineHint": "Outline text (editable)",
			"overview.outlineChars": "Outline length",
			"overview.saveOutline": "Save outline",
			"overview.saved": "Outline saved",
			"overview.bookName": "Book",
			"overview.loadCustom": "Custom docx path",
			"overview.loadCustomHint": "Absolute path; empty = default",
			"plan.generate": "Plan chapters",
			"plan.generateHint": "Chapter count",
			"plan.count": " chapters",
			"plan.empty": "No plan yet — generate one first",
			"plan.chapter": "Ch.",
			"plan.pending": "pending",
			"plan.generating": "writing",
			"plan.written": "to review",
			"plan.reviewing": "reviewing",
			"plan.approved": "approved",
			"plan.rejected": "to revise",
			"plan.error": "failed",
			"plan.write": "Write",
			"plan.rewrite": "Revise",
			"plan.review": "Review",
			"plan.polish": "De-AI",
			"plan.writeAll": "Write all",
			"plan.writeAllPending": "Write remaining",
			"plan.generated": "generated",
			"plan.progress": "progress",
			"plan.beats": "Beats",
			"plan.reviewReport": "Review report",
			"plan.reviewScore": "Score",
			"plan.reviewVerdict": "Verdict",
			"plan.reviewIssues": "Issues",
			"plan.reviewPass": "Passed",
			"plan.reviewFail": "Failed",
			"plan.approve": "Approve",
			"plan.summary": "Summary",
			"plan.volumes": "Volumes",
			"plan.noVolume": "No volume",
			"bible.title": "Story bible",
			"bible.gen": "Extract bible with AI",
			"bible.genre": "Genre",
			"bible.worldRules": "World rules",
			"bible.characters": "Characters",
			"bible.redLines": "Red lines",
			"bible.style": "Style",
			"bible.none": "No bible yet. Generation and review follow it strictly once extracted.",
			"foreshadow.title": "Foreshadowing",
			"foreshadow.suggest": "Suggest with AI",
			"foreshadow.none": "No foreshadows",
			"foreshadow.status": "Status",
			"foreshadow.planned": "planned",
			"foreshadow.planted": "planted",
			"foreshadow.progressing": "progressing",
			"foreshadow.resolved": "resolved",
			"foreshadow.abandoned": "abandoned",
			"foreshadow.target": "target",
			"foreshadow.plantedAt": "planted at",
			"foreshadow.setPlanted": "Mark planted",
			"foreshadow.setResolved": "Mark resolved",
			"settings.title": "Settings",
			"settings.outlinePath": "Default outline path",
			"settings.outputDir": "Output directory",
			"settings.provider": "Provider",
			"settings.model": "Model",
			"settings.chapterChars": "Chars per chapter",
			"settings.maxTokens": "Max output tokens",
			"settings.reviewPassScore": "Review pass score (0-100)",
			"settings.autoReview": "Auto-review after writing",
			"settings.save": "Save settings",
			"settings.saved": "Settings saved",
			"settings.openFolder": "Open output folder",
			"settings.export": "Export",
			"settings.exportTxt": "Export TXT",
			"settings.exportMd": "Export Markdown",
			"settings.exported": "Exported: {file} ({chars} chars, {chapters} chapters)",
			"progress.generating": "Writing chapter {no} “{title}”…",
			"progress.done": "Chapter {no} done ({chars} chars) → {file}",
			"progress.reviewed": "Chapter {no} review: {score} — {verdict}",
			"progress.error": "Chapter {no} failed: {message}",
			"progress.rewriting": "Revising chapter {no}…",
			"progress.polishing": "Polishing chapter {no}…",
			"progress.empty": "Generation/review progress appears here",
			"assistant.hint": "Discuss plot, characters, foreshadowing with the AI editor; once agreed, let it edit the outline, bible, or chapters directly.",
			"assistant.placeholder": "e.g. Add a hook at the end of chapter 2…",
			"assistant.send": "Send",
			"assistant.toolStart": "⚙ Running {name}…",
			"assistant.toolDone": "✓ {name} done: {detail}",
			"assistant.toolError": "✗ {name} failed: {detail}",
			"assistant.empty": "No conversation yet. Chat with the AI editor.",
			"status.projectNone": "No project in the output directory yet. Load an outline first.",
			"status.files": "Generated files",
			"api.error": "Request failed"
		};
		//#endregion
		//#region src/client/panel/helpers.ts
		/**
		* Tiny translation helper for the panel: reads the zh dict with the en dict
		* as fallback (the family plugins use a full locale registry; the panel keeps
		* a dependency-free helper so the client bundle stays self-contained).
		*/
		/** Translate one key with optional {placeholder} substitution. */
		function tt(key, params) {
			let text = zh$1[key] ?? en[key] ?? key;
			if (params !== void 0) for (const [name, value] of Object.entries(params)) text = text.replaceAll(`{${name}}`, String(value));
			return text;
		}
		//#endregion
		//#region \0dsh-css:<用户目录>\Desktop\ai xiaoshuo\src\client\panel\panel.module.css.mjs
		const css = "._8EKcRG_entry{width:100%;color:var(--dsw-alias-label-primary,#1f1f23);cursor:pointer;text-align:left;background:0 0;border:none;border-radius:6px;align-items:center;gap:8px;padding:8px 12px;font-size:13px;transition:background .15s;display:flex}body[data-ds-dark-theme] ._8EKcRG_entry{color:var(--dsw-alias-label-primary,#ececf1)}._8EKcRG_entry:hover{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1f)}._8EKcRG_entry[data-active]{background:var(--dsw-alias-interactive-bg-active,#7f7f7f33)}._8EKcRG_entryIcon{flex-shrink:0;justify-content:center;align-items:center;display:inline-flex}._8EKcRG_entryLabel{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}[data-pane=conversation]{position:relative}._8EKcRG_view{z-index:60;color-scheme:light;--nf-bg:#fafafc;--nf-bg-raise:#fff;--nf-bg-inset:#f1f1f5;--nf-border:#0000001a;--nf-border-strong:#00000038;--nf-text:#1f1f23;--nf-text-2:#5b5b66;--nf-text-3:#8a8a94;--nf-accent:#4d6bfe;--nf-accent-hover:#3d5bf0;--nf-accent-soft:#4d6bfe1f;--nf-accent-fg:#fff;--nf-hover:#0000000f;--nf-success:#16a34a;--nf-error:#e5484d;--nf-warn:#d97706;--nf-info:#7c5cf6;--nf-shadow:0 1px 2px #1018280d, 0 4px 14px #1018280f;--nf-shadow-lg:0 4px 10px #1018280f, 0 12px 28px #1018281a;background:var(--nf-bg);color:var(--nf-text);display:none;position:absolute;inset:0;overflow:auto}body[data-ds-dark-theme] ._8EKcRG_view{color-scheme:dark;--nf-bg:#121216;--nf-bg-raise:#1a1a20;--nf-bg-inset:#232329;--nf-border:#ffffff1a;--nf-border-strong:#ffffff3d;--nf-text:#ececf1;--nf-text-2:#b0b0ba;--nf-text-3:#7d7d88;--nf-accent:#5b7cff;--nf-accent-hover:#7390ff;--nf-accent-soft:#5b7cff2e;--nf-accent-fg:#fff;--nf-hover:#ffffff14;--nf-success:#4ade80;--nf-error:#f87171;--nf-warn:#fbbf24;--nf-info:#a78bfa;--nf-shadow:0 1px 2px #0006, 0 4px 14px #00000059;--nf-shadow-lg:0 4px 10px #0006, 0 12px 28px #00000080}html[data-dsh-novelforge-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) ._8EKcRG_view{display:block}._8EKcRG_panel{flex-direction:column;min-width:0;height:100%;font-size:14px;line-height:1.6;display:flex}._8EKcRG_panelHeader{border-bottom:1px solid var(--nf-border);background:var(--nf-bg-raise);z-index:5;flex-shrink:0;justify-content:space-between;align-items:center;padding:12px 18px;display:flex;position:sticky;top:0}._8EKcRG_panelTitle{letter-spacing:.2px;align-items:center;gap:8px;margin:0;font-size:16px;font-weight:700;display:flex}._8EKcRG_panelTitle:before{content:\"\";background:linear-gradient(180deg, var(--nf-accent), var(--nf-info));border-radius:2px;width:4px;height:16px}._8EKcRG_iconButton{cursor:pointer;color:var(--nf-text-2);background:0 0;border:none;border-radius:8px;padding:4px 9px;font-size:16px;transition:background .15s,color .15s}._8EKcRG_iconButton:hover{background:var(--nf-hover);color:var(--nf-text)}._8EKcRG_tabBar{border-bottom:1px solid var(--nf-border);background:var(--nf-bg-raise);z-index:4;flex-shrink:0;gap:2px;padding:8px 14px 0;display:flex;position:sticky;top:45px}._8EKcRG_tab{cursor:pointer;color:var(--nf-text-2);background:0 0;border:none;border-radius:8px 8px 0 0;padding:7px 13px;font-size:13.5px;font-weight:500;transition:color .15s,background .15s;position:relative}._8EKcRG_tab:hover{color:var(--nf-text);background:var(--nf-hover)}._8EKcRG_tab[data-active]{color:var(--nf-accent);font-weight:600}._8EKcRG_tab[data-active]:after{content:\"\";background:var(--nf-accent);border-radius:2px 2px 0 0;height:2.5px;position:absolute;bottom:-1px;left:10px;right:10px}._8EKcRG_panelContent{flex-direction:column;flex:1;gap:14px;padding:16px 18px 20px;display:flex;overflow:auto}._8EKcRG_card{border:1px solid var(--nf-border);background:var(--nf-bg-raise);box-shadow:var(--nf-shadow);border-radius:12px;flex-direction:column;gap:10px;padding:14px 16px;transition:border-color .2s,box-shadow .2s;display:flex}._8EKcRG_cardTitle{color:var(--nf-text);align-items:center;gap:8px;margin:0;font-size:14px;font-weight:650;display:flex}._8EKcRG_button{border:1px solid var(--nf-border-strong);background:var(--nf-bg-inset);color:var(--nf-text);cursor:pointer;white-space:nowrap;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:500;transition:background .15s,border-color .15s,transform .1s,box-shadow .15s}._8EKcRG_button:hover:not([disabled]){background:var(--nf-hover);border-color:var(--nf-border-strong)}._8EKcRG_button:active:not([disabled]){transform:translateY(1px)}._8EKcRG_button[disabled]{opacity:.45;cursor:not-allowed}._8EKcRG_buttonPrimary{border-color:var(--nf-accent);background:linear-gradient(180deg, var(--nf-accent), var(--nf-accent-hover));color:var(--nf-accent-fg);box-shadow:0 1px 3px #4d6bfe40}._8EKcRG_buttonPrimary:hover:not([disabled]){background:linear-gradient(180deg, var(--nf-accent-hover), var(--nf-accent));border-color:var(--nf-accent-hover)}._8EKcRG_buttonDanger{border-color:var(--nf-error);color:var(--nf-error)}._8EKcRG_buttonDanger:hover:not([disabled]){background:#e5484d1a}._8EKcRG_buttonSmall{border-radius:6px;padding:3px 10px;font-size:12px}._8EKcRG_field{flex-direction:column;gap:5px;display:flex}._8EKcRG_fieldLabel{color:var(--nf-text-2);font-size:12px;font-weight:500}._8EKcRG_input{border:1px solid var(--nf-border-strong);background:var(--nf-bg-inset);color:var(--nf-text);box-sizing:border-box;border-radius:8px;width:100%;padding:7px 11px;font-size:13px;transition:border-color .15s,box-shadow .15s}._8EKcRG_input:focus,._8EKcRG_textarea:focus{border-color:var(--nf-accent);box-shadow:0 0 0 3px var(--nf-accent-soft);outline:none}._8EKcRG_input::placeholder,._8EKcRG_textarea::placeholder{color:var(--nf-text-3)}._8EKcRG_textarea{border:1px solid var(--nf-border-strong);background:var(--nf-bg-inset);color:var(--nf-text);box-sizing:border-box;resize:vertical;border-radius:8px;width:100%;min-height:200px;padding:9px 11px;font-family:inherit;font-size:13px;line-height:1.7;transition:border-color .15s,box-shadow .15s}._8EKcRG_row{flex-wrap:wrap;align-items:center;gap:8px;display:flex}._8EKcRG_spaceBetween{justify-content:space-between}._8EKcRG_chapterList{flex-direction:column;gap:8px;display:flex}._8EKcRG_chapter{border:1px solid var(--nf-border);background:var(--nf-bg);border-radius:10px;align-items:center;gap:10px;padding:9px 12px;transition:border-color .15s,box-shadow .15s,transform .1s;display:flex}._8EKcRG_chapter:hover{border-color:var(--nf-border-strong);box-shadow:var(--nf-shadow)}._8EKcRG_chapterNum{background:var(--nf-bg-inset);border:1px solid var(--nf-border);min-width:28px;height:28px;color:var(--nf-text-2);border-radius:8px;flex-shrink:0;justify-content:center;align-items:center;padding:0 8px;font-size:12px;font-weight:700;display:inline-flex}._8EKcRG_chapterMain{flex:1;min-width:0}._8EKcRG_chapterTitle{color:var(--nf-text);align-items:center;gap:8px;font-size:13px;font-weight:600;display:flex}._8EKcRG_chapterBeats{color:var(--nf-text-2);opacity:.85;text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}._8EKcRG_chapterActions{opacity:.85;flex-shrink:0;gap:4px;transition:opacity .15s;display:flex}._8EKcRG_chapter:hover ._8EKcRG_chapterActions{opacity:1}._8EKcRG_badge{white-space:nowrap;letter-spacing:.2px;border:1px solid;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600}._8EKcRG_badgePending{color:var(--nf-info);border-color:var(--nf-info);background:color-mix(in srgb, var(--nf-info) 10%, transparent)}._8EKcRG_badgeGenerating{color:var(--nf-accent);border-color:var(--nf-accent);background:color-mix(in srgb, var(--nf-accent) 12%, transparent);animation:1.2s ease-in-out infinite _8EKcRG_pulse}._8EKcRG_badgeWritten{color:var(--nf-warn);border-color:var(--nf-warn);background:color-mix(in srgb, var(--nf-warn) 10%, transparent)}._8EKcRG_badgeRejected{color:var(--nf-error);border-color:var(--nf-error);background:color-mix(in srgb, var(--nf-error) 10%, transparent)}._8EKcRG_badgeDone{color:var(--nf-success);border-color:var(--nf-success);background:color-mix(in srgb, var(--nf-success) 10%, transparent)}._8EKcRG_badgeError{color:var(--nf-error);border-color:var(--nf-error);background:color-mix(in srgb, var(--nf-error) 10%, transparent)}._8EKcRG_reviewBox{border:1px solid var(--nf-border);background:var(--nf-bg-inset);border-radius:10px;flex-direction:column;gap:6px;padding:10px 12px;font-size:12.5px;display:flex}._8EKcRG_chapterPreview{white-space:pre-wrap;word-break:break-all;max-height:320px;color:var(--nf-text);background:var(--nf-bg-inset);border:1px solid var(--nf-border);border-radius:10px;margin:0;padding:10px 12px;font-family:inherit;font-size:12.5px;line-height:1.8;overflow:auto}._8EKcRG_chatScroll{border:1px solid var(--nf-border);background:var(--nf-bg-inset);border-radius:12px;flex-direction:column;flex:1;gap:10px;min-height:240px;max-height:480px;padding:14px;display:flex;overflow-y:auto}._8EKcRG_chatBubbleUser{background:linear-gradient(180deg, var(--nf-accent), var(--nf-accent-hover));max-width:90%;color:var(--nf-accent-fg);border-radius:14px 14px 4px;align-self:flex-end;padding:9px 14px;font-size:13px;box-shadow:0 2px 6px #4d6bfe33}._8EKcRG_chatBubbleAssistant{background:var(--nf-bg-raise);max-width:92%;color:var(--nf-text);border:1px solid var(--nf-border);box-shadow:var(--nf-shadow);border-radius:14px 14px 14px 4px;align-self:flex-start;padding:9px 14px;font-size:13px}._8EKcRG_chatRole{color:var(--nf-text-3);margin-bottom:3px;font-size:11px;font-weight:600}._8EKcRG_toolLive{background:var(--nf-bg-inset);border:1px dashed var(--nf-border-strong);white-space:pre-wrap;word-break:break-all;color:var(--nf-text-2);border-radius:8px;max-height:180px;margin-top:6px;padding:8px 10px;font-size:12px;line-height:1.7;overflow-y:auto}._8EKcRG_progress{border:1px solid var(--nf-border);white-space:pre-wrap;word-break:break-all;min-height:60px;max-height:220px;color:var(--nf-text-2);background:var(--nf-bg-inset);border-radius:10px;padding:10px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.8;overflow:auto}._8EKcRG_progressLine{color:var(--nf-text-2);opacity:.9}._8EKcRG_progressLineDone{color:var(--nf-success);font-weight:600}._8EKcRG_progressLineError{color:var(--nf-error);font-weight:600}._8EKcRG_meta{color:var(--nf-text-2);opacity:.9;font-size:12px}._8EKcRG_fileList{color:var(--nf-text-2);opacity:.9;word-break:break-all;flex-direction:column;gap:3px;font-size:12px;display:flex}._8EKcRG_panelContent::-webkit-scrollbar,._8EKcRG_chatScroll::-webkit-scrollbar,._8EKcRG_chapterPreview::-webkit-scrollbar,._8EKcRG_progress::-webkit-scrollbar,._8EKcRG_toolLive::-webkit-scrollbar{width:8px;height:8px}._8EKcRG_panelContent::-webkit-scrollbar-thumb,._8EKcRG_chatScroll::-webkit-scrollbar-thumb,._8EKcRG_chapterPreview::-webkit-scrollbar-thumb,._8EKcRG_progress::-webkit-scrollbar-thumb,._8EKcRG_toolLive::-webkit-scrollbar-thumb{background:var(--nf-border-strong);border-radius:4px}._8EKcRG_panelContent::-webkit-scrollbar-thumb:hover,._8EKcRG_chatScroll::-webkit-scrollbar-thumb:hover,._8EKcRG_chapterPreview::-webkit-scrollbar-thumb:hover,._8EKcRG_progress::-webkit-scrollbar-thumb:hover,._8EKcRG_toolLive::-webkit-scrollbar-thumb:hover{background:var(--nf-text-3)}._8EKcRG_workflowList{flex-direction:column;gap:0;display:flex}._8EKcRG_workflowRow{align-items:flex-start;gap:12px;padding:8px 4px;display:flex;position:relative}._8EKcRG_workflowRow:before{content:\"\";background:var(--nf-border);width:2px;position:absolute;top:34px;bottom:-8px;left:13px}._8EKcRG_workflowRow:last-child:before{display:none}._8EKcRG_workflowDot{border:2px solid var(--nf-border-strong);background:var(--nf-bg-raise);width:28px;height:28px;color:var(--nf-text-2);z-index:1;border-radius:50%;flex-shrink:0;justify-content:center;align-items:center;font-size:12px;font-weight:700;display:inline-flex}._8EKcRG_workflowDotDone{border-color:var(--nf-success);background:color-mix(in srgb, var(--nf-success) 15%, var(--nf-bg-raise));color:var(--nf-success)}._8EKcRG_workflowDotActive{border-color:var(--nf-accent);background:var(--nf-accent);color:var(--nf-accent-fg);box-shadow:0 0 0 4px var(--nf-accent-soft)}._8EKcRG_workflowBody{flex-direction:column;flex:1;gap:4px;min-width:0;padding-top:2px;display:flex}._8EKcRG_workflowLabel{color:var(--nf-text);font-size:13px;font-weight:600}._8EKcRG_workflowHint{color:var(--nf-text-2);font-size:12px}@keyframes _8EKcRG_pulse{0%,to{opacity:1}50%{opacity:.45}}@keyframes _8EKcRG_fadeIn{0%{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}._8EKcRG_card{animation:.2s _8EKcRG_fadeIn}._8EKcRG_bookshelf{border-bottom:1px solid var(--nf-border);background:var(--nf-bg-raise);flex-wrap:wrap;flex-shrink:0;align-items:center;gap:10px;padding:8px 18px;display:flex}._8EKcRG_bookshelfLabel{color:var(--nf-text-3);letter-spacing:1px;flex-shrink:0;font-size:12px;font-weight:700}._8EKcRG_bookshelfList{flex-wrap:wrap;flex:1;align-items:center;gap:6px;min-width:0;display:flex}._8EKcRG_bookChip{border:1px solid var(--nf-border);background:var(--nf-bg-inset);cursor:pointer;border-radius:999px;align-items:center;gap:6px;max-width:220px;padding:4px 8px 4px 10px;font-size:12px;transition:border-color .15s,background .15s;display:flex}._8EKcRG_bookChip:hover{border-color:var(--nf-border-strong)}._8EKcRG_bookChipActive{border-color:var(--nf-accent);background:var(--nf-accent-soft);color:var(--nf-accent)}._8EKcRG_bookChipName{text-overflow:ellipsis;white-space:nowrap;font-weight:600;overflow:hidden}._8EKcRG_bookChipMeta{opacity:.7;white-space:nowrap;font-size:11px}._8EKcRG_bookChipRemove{color:var(--nf-text-3);cursor:pointer;background:0 0;border:none;border-radius:4px;padding:0 2px;font-size:13px;line-height:1}._8EKcRG_bookChipRemove:hover{color:var(--nf-error)}._8EKcRG_bookAdd{border:1px dashed var(--nf-border-strong);color:var(--nf-text-2);cursor:pointer;background:0 0;border-radius:999px;padding:4px 12px;font-size:12px;transition:border-color .15s,color .15s}._8EKcRG_bookAdd:hover{border-color:var(--nf-accent);color:var(--nf-accent)}._8EKcRG_bookCreateForm{align-items:center;gap:6px;display:flex}._8EKcRG_dropzone{border:2px dashed var(--nf-border-strong);text-align:center;color:var(--nf-text-2);cursor:pointer;border-radius:10px;flex-direction:column;align-items:center;gap:6px;padding:18px 14px;font-size:13px;transition:border-color .15s,background .15s;display:flex}._8EKcRG_dropzone:hover,._8EKcRG_dropzoneActive{border-color:var(--nf-accent);background:var(--nf-accent-soft);color:var(--nf-accent)}._8EKcRG_dropzoneIcon{font-size:22px;line-height:1}";
		const tagId = "@ryan/dsh-novel-forge/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@ryan/dsh-novel-forge";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"textarea": "_8EKcRG_textarea",
			"buttonDanger": "_8EKcRG_buttonDanger",
			"bookChipMeta": "_8EKcRG_bookChipMeta",
			"chapterTitle": "_8EKcRG_chapterTitle",
			"bookChipActive": "_8EKcRG_bookChipActive",
			"panelHeader": "_8EKcRG_panelHeader",
			"badge": "_8EKcRG_badge",
			"toolLive": "_8EKcRG_toolLive",
			"pulse": "_8EKcRG_pulse",
			"workflowDotActive": "_8EKcRG_workflowDotActive",
			"bookshelf": "_8EKcRG_bookshelf",
			"entry": "_8EKcRG_entry",
			"chapterActions": "_8EKcRG_chapterActions",
			"workflowDotDone": "_8EKcRG_workflowDotDone",
			"spaceBetween": "_8EKcRG_spaceBetween",
			"progress": "_8EKcRG_progress",
			"chapterMain": "_8EKcRG_chapterMain",
			"button": "_8EKcRG_button",
			"progressLine": "_8EKcRG_progressLine",
			"chatScroll": "_8EKcRG_chatScroll",
			"badgeRejected": "_8EKcRG_badgeRejected",
			"badgeGenerating": "_8EKcRG_badgeGenerating",
			"panel": "_8EKcRG_panel",
			"chatBubbleAssistant": "_8EKcRG_chatBubbleAssistant",
			"workflowLabel": "_8EKcRG_workflowLabel",
			"chapterList": "_8EKcRG_chapterList",
			"bookChipName": "_8EKcRG_bookChipName",
			"workflowList": "_8EKcRG_workflowList",
			"dropzoneIcon": "_8EKcRG_dropzoneIcon",
			"entryLabel": "_8EKcRG_entryLabel",
			"iconButton": "_8EKcRG_iconButton",
			"chatRole": "_8EKcRG_chatRole",
			"workflowRow": "_8EKcRG_workflowRow",
			"entryIcon": "_8EKcRG_entryIcon",
			"bookAdd": "_8EKcRG_bookAdd",
			"fileList": "_8EKcRG_fileList",
			"progressLineDone": "_8EKcRG_progressLineDone",
			"workflowDot": "_8EKcRG_workflowDot",
			"chapterNum": "_8EKcRG_chapterNum",
			"buttonPrimary": "_8EKcRG_buttonPrimary",
			"card": "_8EKcRG_card",
			"tab": "_8EKcRG_tab",
			"workflowBody": "_8EKcRG_workflowBody",
			"bookChipRemove": "_8EKcRG_bookChipRemove",
			"dropzoneActive": "_8EKcRG_dropzoneActive",
			"fieldLabel": "_8EKcRG_fieldLabel",
			"row": "_8EKcRG_row",
			"chatBubbleUser": "_8EKcRG_chatBubbleUser",
			"fadeIn": "_8EKcRG_fadeIn",
			"chapterBeats": "_8EKcRG_chapterBeats",
			"input": "_8EKcRG_input",
			"badgeError": "_8EKcRG_badgeError",
			"badgeDone": "_8EKcRG_badgeDone",
			"dropzone": "_8EKcRG_dropzone",
			"meta": "_8EKcRG_meta",
			"workflowHint": "_8EKcRG_workflowHint",
			"bookCreateForm": "_8EKcRG_bookCreateForm",
			"buttonSmall": "_8EKcRG_buttonSmall",
			"cardTitle": "_8EKcRG_cardTitle",
			"panelTitle": "_8EKcRG_panelTitle",
			"reviewBox": "_8EKcRG_reviewBox",
			"tabBar": "_8EKcRG_tabBar",
			"field": "_8EKcRG_field",
			"chapterPreview": "_8EKcRG_chapterPreview",
			"chapter": "_8EKcRG_chapter",
			"bookshelfList": "_8EKcRG_bookshelfList",
			"badgePending": "_8EKcRG_badgePending",
			"view": "_8EKcRG_view",
			"panelContent": "_8EKcRG_panelContent",
			"progressLineError": "_8EKcRG_progressLineError",
			"bookshelfLabel": "_8EKcRG_bookshelfLabel",
			"bookChip": "_8EKcRG_bookChip",
			"badgeWritten": "_8EKcRG_badgeWritten"
		};
		//#endregion
		//#region src/client/panel/AssistantTab.tsx
		/**
		* AI 助手页签：与 AI 编辑对话讨论剧情，助手可通过动作指令直接修改
		* 大纲 / 设定圣经 / 章节。流式渲染回复，工具调用以事件行展示。
		*/
		/** The assistant conversation tab. */
		function AssistantTab({ api }) {
			const [lines, setLines] = (0, react.useState)([]);
			const [input, setInput] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const idRef = (0, react.useRef)(0);
			const scrollRef = (0, react.useRef)(null);
			/** Append a bubble (or extend the current assistant bubble). */
			const pushLine = (0, react.useCallback)((line) => {
				setLines((prev) => {
					const last = prev[prev.length - 1];
					if (line.role === "assistant" && last !== void 0 && last.role === "assistant" && last.tools.length === 0) return [...prev.slice(0, -1), {
						...last,
						text: last.text + line.text
					}];
					return [...prev, {
						...line,
						id: idRef.current++
					}];
				});
			}, []);
			/** Push a tool event onto the current assistant bubble. */
			const pushTool = (0, react.useCallback)((tool) => {
				setLines((prev) => {
					const last = prev[prev.length - 1];
					if (last === void 0 || last.role !== "assistant") return [...prev, {
						id: idRef.current++,
						role: "assistant",
						text: "",
						tools: [tool]
					}];
					return [...prev.slice(0, -1), {
						...last,
						tools: [...last.tools, tool],
						live: void 0
					}];
				});
			}, []);
			/** Append live tool output onto the current assistant bubble. */
			const pushToolDelta = (0, react.useCallback)((text) => {
				setLines((prev) => {
					const last = prev[prev.length - 1];
					if (last === void 0 || last.role !== "assistant") return prev;
					return [...prev.slice(0, -1), {
						...last,
						live: (last.live ?? "") + text
					}];
				});
			}, []);
			/** Load persisted history on mount. */
			(0, react.useEffect)(() => {
				let cancelled = false;
				(async () => {
					try {
						const history = await api.assistantHistory();
						if (cancelled) return;
						const restored = [];
						for (const entry of history) if (entry.role === "user") restored.push({
							id: idRef.current++,
							role: "user",
							text: entry.content,
							tools: []
						});
						else if (entry.role === "assistant") restored.push({
							id: idRef.current++,
							role: "assistant",
							text: entry.content,
							tools: []
						});
						else if (entry.role === "tool") {
							const last = restored[restored.length - 1];
							if (last !== void 0 && last.role === "assistant") last.tools.push({
								name: entry.tool ?? "tool",
								status: "done",
								detail: entry.content.slice(0, 120)
							});
						}
						setLines(restored);
					} catch (err) {
						if (!cancelled) setError(err.message);
					}
				})();
				return () => {
					cancelled = true;
				};
			}, [api]);
			/** Auto-scroll to the newest line. */
			(0, react.useEffect)(() => {
				scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
			}, [lines]);
			/** Send one message. */
			const handleSend = async () => {
				const message = input.trim();
				if (message === "" || busy) return;
				setInput("");
				setError("");
				pushLine({
					role: "user",
					text: message,
					tools: []
				});
				setLines((prev) => [...prev, {
					id: idRef.current++,
					role: "assistant",
					text: "",
					tools: []
				}]);
				setBusy(true);
				try {
					await api.assistant(message, (frame) => {
						if (frame.type === "delta") pushLine({
							role: "assistant",
							text: frame.text,
							tools: []
						});
						else if (frame.type === "tool") pushTool({
							name: frame.name,
							status: frame.status,
							detail: frame.detail
						});
						else if (frame.type === "toolDelta") pushToolDelta(frame.text);
						else if (frame.type === "error") pushTool({
							name: "error",
							status: "error",
							detail: frame.message
						});
					});
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.card,
				style: {
					flex: 1,
					minHeight: 0,
					display: "flex",
					flexDirection: "column"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.cardTitle,
						children: tt("tab.assistant")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.meta,
						children: tt("assistant.hint")
					}),
					error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							color: "var(--nf-error)",
							fontSize: 12
						},
						children: [
							tt("common.error"),
							": ",
							error
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						ref: scrollRef,
						className: panel_module_css_default.chatScroll,
						children: [
							lines.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.meta,
								children: tt("assistant.empty")
							}),
							lines.map((line) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: line.role === "user" ? panel_module_css_default.chatBubbleUser : panel_module_css_default.chatBubbleAssistant,
								children: [
									line.role === "user" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.chatRole,
										children: "你"
									}),
									line.text !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											whiteSpace: "pre-wrap",
											wordBreak: "break-word"
										},
										children: line.text
									}),
									line.live !== void 0 && line.live !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.toolLive,
										children: line.live
									}),
									line.tools.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											display: "flex",
											flexDirection: "column",
											gap: 2,
											marginTop: 4,
											fontSize: 11
										},
										children: line.tools.map((tool, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											style: { color: tool.status === "error" ? "var(--nf-error)" : tool.status === "start" ? "var(--nf-accent)" : "var(--nf-success)" },
											children: tool.status === "start" ? tt("assistant.toolStart", { name: tool.name }) : tool.status === "done" ? tt("assistant.toolDone", {
												name: tool.name,
												detail: tool.detail ?? ""
											}) : tt("assistant.toolError", {
												name: tool.name,
												detail: tool.detail ?? ""
											})
										}, i))
									})
								]
							}, line.id)),
							busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.meta,
								style: { color: "var(--nf-accent)" },
								children: "…"
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						style: { marginTop: 8 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							className: panel_module_css_default.textarea,
							style: {
								minHeight: 64,
								flex: 1
							},
							placeholder: tt("assistant.placeholder"),
							value: input,
							onChange: (e) => {
								setInput(e.target.value);
							},
							onKeyDown: (e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSend();
								}
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							disabled: busy || input.trim() === "",
							onClick: () => {
								handleSend();
							},
							children: tt("assistant.send")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/AssetsTab.tsx
		/**
		* 写作资产页签：题材基底库 / 推进模式库 / 反 AI 规则 / 写法引擎。
		* 学习自 AI-Novel-Writing-Assistant 的四大资产模块，注入到生成与审稿提示词中。
		*/
		/** 渲染题材树（带勾选当前题材）。 */
		function GenreTree({ node, selected, onSelect }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				style: {
					display: "flex",
					alignItems: "flex-start",
					gap: 6,
					cursor: "pointer"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
					type: "radio",
					name: "genre",
					checked: selected === node.name,
					onChange: () => {
						onSelect(node);
					}
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: node.name }), node.description !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default.meta,
					children: [" — ", node.description]
				})] })]
			}), node.children.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					marginLeft: 22,
					display: "flex",
					flexDirection: "column",
					gap: 4
				},
				children: node.children.map((child) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GenreTree, {
					node: child,
					selected,
					onSelect
				}, child.name))
			})] });
		}
		/** 子页签定义。 */
		const SUB_TABS = [
			{
				id: "genre",
				label: "题材基底"
			},
			{
				id: "progression",
				label: "推进模式"
			},
			{
				id: "templates",
				label: "预置写法"
			},
			{
				id: "rules",
				label: "反 AI 规则"
			},
			{
				id: "style",
				label: "自定义写法"
			}
		];
		/** 写作资产页签。 */
		function AssetsTab({ api }) {
			const [assetTab, setAssetTab] = (0, react.useState)("genre");
			const [data, setData] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [sampleText, setSampleText] = (0, react.useState)("");
			const [styleName, setStyleName] = (0, react.useState)("");
			const [newRule, setNewRule] = (0, react.useState)("");
			const [newProgression, setNewProgression] = (0, react.useState)("");
			(0, react.useRef)(0);
			/** Load assets (or reset from a new call). */
			const refresh = (0, react.useCallback)(async () => {
				try {
					const result = await api.assets();
					setData(result);
				} catch (err) {
					setError(err.message);
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			/** Patch assets and refresh. */
			const patch = async (patch) => {
				setBusy(true);
				setError("");
				try {
					const result = await api.patchAssets(patch);
					setData(result);
					setNotice("已保存");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 提取写法资产。 */
			const handleExtractStyle = async () => {
				if (sampleText.trim().length < 50) {
					setError(tt("settings.exported") === "" ? "样本文本过短" : "样本文本过短（<50 字符）");
					return;
				}
				setBusy(true);
				setError("");
				try {
					const result = await api.styleEngine({
						sampleText,
						name: styleName
					});
					setData((prev) => prev === null ? prev : {
						...prev,
						projectAssets: {
							...prev.projectAssets,
							styleAssets: [...prev.projectAssets.styleAssets ?? [], result.styleAsset],
							updatedAt: (/* @__PURE__ */ new Date()).toISOString()
						}
					});
					setNotice(`写法资产「${result.styleAsset.name}」已提取并绑定`);
					setSampleText("");
					setStyleName("");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 添加自定义反 AI 规则（一行 "名称：要避免的" 简单格式由用户填写 JSON）。 */
			const handleAddRule = async () => {
				const text = newRule.trim();
				if (text === "") return;
				let rule;
				try {
					const parsed = JSON.parse(text);
					rule = {
						name: parsed.name ?? "自定义规则",
						avoid: parsed.avoid ?? "",
						fix: parsed.fix ?? ""
					};
				} catch {
					rule = {
						name: `自定义规则 ${(data?.projectAssets.antiAiRules ?? []).length + 1}`,
						avoid: text,
						fix: ""
					};
				}
				if (rule.avoid === "" && rule.fix === "") return;
				const next = [...data?.projectAssets.antiAiRules ?? [], rule];
				await patch({ antiAiRules: next });
				setNewRule("");
			};
			/** 设置题材。 */
			const handleSelectGenre = (node) => {
				patch({ genre: node });
			};
			/** 添加推进模式（从内置库选择）。 */
			const handleAddProgression = async (mode) => {
				const current = data?.projectAssets;
				if ((data?.projectAssets.primaryProgression ?? void 0) === void 0) await patch({ primaryProgression: {
					...mode,
					primary: true
				} });
				else await patch({ auxiliaryProgressions: [...current?.auxiliaryProgressions ?? [], {
					...mode,
					primary: false
				}] });
			};
			if (data === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.card,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.meta,
					children: tt("common.loading")
				})
			});
			const assets = data.projectAssets;
			const builtinRules = data.antiAiLibrary;
			const customRules = assets.antiAiRules ?? [];
			const genreLibrary = data.genreLibrary;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 12
				},
				children: [
					error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.card,
						style: { borderColor: "var(--nf-error)" },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: { color: "var(--nf-error)" },
							children: [
								tt("common.error"),
								": ",
								error
							]
						})
					}),
					notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.card,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color: "var(--nf-success)" },
							children: notice
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.tabBar,
						role: "tablist",
						style: {
							padding: "0 0 8px",
							borderBottom: "1px solid var(--nf-border)"
						},
						children: SUB_TABS.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": assetTab === tab.id,
							"data-active": assetTab === tab.id ? "" : void 0,
							className: panel_module_css_default.tab,
							onClick: () => {
								setAssetTab(tab.id);
							},
							children: tab.label
						}, tab.id))
					}),
					assetTab === "genre" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.card,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cardTitle,
								children: "题材基底库"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.meta,
								children: "这本书属于哪个阅读市场？题材定位会注入章节生成与审稿提示词。"
							}),
							assets.genre !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									border: "1px solid var(--nf-border)",
									borderRadius: 6,
									padding: "6px 10px",
									fontSize: 12
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["当前题材：", assets.genre.name] }),
									" — ",
									assets.genre.description
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 8,
									maxHeight: 340,
									overflowY: "auto"
								},
								children: genreLibrary.map((root) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GenreTree, {
									node: root,
									selected: assets.genre?.name ?? "",
									onSelect: handleSelectGenre
								}, root.name))
							})
						]
					}),
					assetTab === "progression" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.card,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cardTitle,
								children: "推进模式库"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.meta,
								children: "读者为什么继续看下一章？主模式 + 辅助模式注入卷规划与章节生成。"
							}),
							assets.primaryProgression !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									border: "1px solid var(--nf-accent)",
									borderRadius: 6,
									padding: "6px 10px",
									fontSize: 12,
									color: "var(--nf-accent)"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: ["主推进：", assets.primaryProgression.name] }),
									" — ",
									assets.primaryProgression.driver
								]
							}),
							assets.auxiliaryProgressions.map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									border: "1px solid var(--nf-border)",
									borderRadius: 6,
									padding: "6px 10px",
									fontSize: 12
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: mode.name }),
									" — ",
									mode.driver
								]
							}, mode.name)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.meta,
								children: "从内置推进模式库选择添加（第一个设为主推进）："
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 6,
									maxHeight: 260,
									overflowY: "auto"
								},
								children: data.progressionLibrary.map((mode) => {
									const alreadyPrimary = assets.primaryProgression?.name === mode.name;
									const alreadyAux = assets.auxiliaryProgressions.some((m) => m.name === mode.name);
									if (alreadyPrimary || alreadyAux) return null;
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										className: panel_module_css_default.button,
										disabled: busy,
										onClick: () => {
											handleAddProgression(mode);
										},
										children: [
											"＋ ",
											assets.primaryProgression === void 0 ? `主推进：` : "辅助：",
											mode.name,
											" — ",
											mode.driver.slice(0, 40),
											"…"
										]
									}, mode.name);
								})
							})
						]
					}),
					assetTab === "templates" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.card,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cardTitle,
								children: "预置写法模板"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.meta,
								children: "从内置 8 套叙事风格模板中一键选用（来自 AI-Novel-Writing-Assistant 写法引擎），无需样本文本；绑定后生成与润色都遵循该风格。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 8,
									maxHeight: 420,
									overflowY: "auto"
								},
								children: data.styleTemplates.map((template) => {
									const bound = assets.styleAssets.some((s) => s.name === template.name);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											border: `1px solid ${bound ? "var(--nf-accent)" : "var(--nf-border)"}`,
											borderRadius: 6,
											padding: "8px 10px",
											fontSize: 12
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "flex",
													alignItems: "center",
													justifyContent: "space-between",
													gap: 8
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: template.name }),
													" ",
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.badge,
														style: {
															borderColor: "var(--nf-text-3)",
															color: "var(--nf-text-3)"
														},
														children: template.category
													})
												] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${bound ? "" : panel_module_css_default.buttonPrimary}`,
													disabled: busy || bound,
													onClick: () => {
														const styleAsset = {
															name: template.name,
															proseRules: [...template.proseRules, ...template.rhythmRules.map((r) => `节奏：${r}`)],
															dialogueRules: template.dialogueRules,
															descriptionRules: template.languageRules,
															boundaries: [`模板「${template.name}」适用题材：${template.applicableGenres.join("、")}`, "不要违背模板的叙事单元结构与节奏约束"],
															createdAt: (/* @__PURE__ */ new Date()).toISOString()
														};
														patch({ styleAssets: [...data.projectAssets.styleAssets ?? [], styleAsset] });
													},
													children: bound ? "✓ 已绑定" : "＋ 绑定"
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: panel_module_css_default.meta,
												children: template.description
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.meta,
												children: ["叙述：", template.proseRules.slice(0, 2).join("；")]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.meta,
												children: ["台词：", template.dialogueRules.slice(0, 1).join("；")]
											})
										]
									}, template.key);
								})
							})
						]
					}),
					assetTab === "rules" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.card,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cardTitle,
								children: "反 AI 规则"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.meta,
								children: "写作时必须遵守的表达边界（内置全局 + 项目自定义），生成与审稿都会检查。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 6,
									maxHeight: 280,
									overflowY: "auto"
								},
								children: [builtinRules.map((rule) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										border: "1px solid var(--nf-border)",
										borderRadius: 6,
										padding: "6px 10px",
										fontSize: 12
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: rule.name }),
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.badge,
											style: {
												borderColor: "var(--nf-text-3)",
												color: "var(--nf-text-3)"
											},
											children: "内置"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.meta,
											children: ["避免：", rule.avoid]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.meta,
											children: ["修正：", rule.fix]
										})
									]
								}, rule.name)), customRules.map((rule) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										border: "1px solid var(--nf-accent)",
										borderRadius: 6,
										padding: "6px 10px",
										fontSize: 12
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: rule.name }),
										" ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.badge,
											style: {
												borderColor: "var(--nf-accent)",
												color: "var(--nf-accent)"
											},
											children: "自定义"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.meta,
											children: ["避免：", rule.avoid]
										}),
										rule.fix !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.meta,
											children: ["修正：", rule.fix]
										})
									]
								}, rule.name))]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									style: { flex: 1 },
									placeholder: "新增规则（格式：{\"name\":\"规则名\",\"avoid\":\"要避免的\",\"fix\":\"修正方向\"}；或直接填要避免的问题）",
									value: newRule,
									onChange: (e) => {
										setNewRule(e.target.value);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
									disabled: busy || newRule.trim() === "",
									onClick: () => {
										handleAddRule();
									},
									children: "＋ 添加"
								})]
							})
						]
					}),
					assetTab === "style" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.card,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cardTitle,
								children: "自定义写法引擎"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.meta,
								children: "粘贴一段你喜欢的样本文本，AI 提取叙事风格规则并绑定到本书，后续章节保持同一味道。"
							}),
							assets.styleAssets.map((style) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									border: "1px solid var(--nf-border)",
									borderRadius: 6,
									padding: "6px 10px",
									fontSize: 12
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: style.name }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.meta,
										children: ["叙述：", style.proseRules.slice(0, 3).join("；")]
									}),
									style.dialogueRules.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.meta,
										children: ["台词：", style.dialogueRules.slice(0, 2).join("；")]
									})
								]
							}, style.name)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: panel_module_css_default.textarea,
								style: { minHeight: 90 },
								placeholder: "粘贴样本文本（一段能代表目标风格的文字，50 字以上）…",
								value: sampleText,
								onChange: (e) => {
									setSampleText(e.target.value);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									style: { flex: 1 },
									placeholder: "写法资产名（可选）",
									value: styleName,
									onChange: (e) => {
										setStyleName(e.target.value);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
									disabled: busy || sampleText.trim().length < 50,
									onClick: () => {
										handleExtractStyle();
									},
									children: "提取并绑定"
								})]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/BookshelfBar.tsx
		/**
		* 书架条：显示所有书，点击切换当前书（继续编译），＋ 新建。
		*/
		/** 书架条。 */
		function BookshelfBar({ api, shelf, onSwitch }) {
			const [creating, setCreating] = (0, react.useState)(false);
			const [name, setName] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const handleCreate = async () => {
				const bookName = name.trim();
				if (bookName === "") return;
				setBusy(true);
				setError("");
				try {
					await api.bookCreate(bookName);
					setCreating(false);
					setName("");
					onSwitch();
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			const handleActivate = async (id) => {
				if (id === shelf.activeBookId) return;
				setBusy(true);
				try {
					await api.bookActivate(id);
					onSwitch();
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			const handleRemove = async (id) => {
				setBusy(true);
				try {
					await api.bookRemove(id);
					onSwitch();
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.bookshelf,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.bookshelfLabel,
						children: "书架"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.bookshelfList,
						children: [shelf.books.map((book) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: `${panel_module_css_default.bookChip} ${book.id === shelf.activeBookId ? panel_module_css_default.bookChipActive : ""}`,
							onClick: () => {
								handleActivate(book.id);
							},
							title: book.outputDir,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.bookChipName,
									children: book.bookName
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.bookChipMeta,
									children: book.hasProject ? `${book.done}/${book.total} 章` : "未开书"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.bookChipRemove,
									title: "从书架移除",
									onClick: (e) => {
										e.stopPropagation();
										handleRemove(book.id);
									},
									children: "×"
								})
							]
						}, book.id)), !creating ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.bookAdd,
							onClick: () => {
								setCreating(true);
							},
							children: "＋ 新书"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.bookCreateForm,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.input,
									style: { width: 140 },
									placeholder: "书名",
									value: name,
									onChange: (e) => {
										setName(e.target.value);
									},
									onKeyDown: (e) => {
										if (e.key === "Enter") handleCreate();
									},
									autoFocus: true
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
									disabled: busy || name.trim() === "",
									onClick: () => {
										handleCreate();
									},
									children: "创建"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
									onClick: () => {
										setCreating(false);
									},
									children: "取消"
								})
							]
						})]
					}),
					error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: "var(--nf-error)",
							fontSize: 12
						},
						children: error
					})
				]
			});
		}
		//#endregion
		//#region node_modules/.pnpm/fflate@0.8.3/node_modules/fflate/esm/browser.js
		var u8 = Uint8Array;
		var u16 = Uint16Array;
		var i32 = Int32Array;
		var fleb = new u8([
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			0,
			1,
			1,
			1,
			1,
			2,
			2,
			2,
			2,
			3,
			3,
			3,
			3,
			4,
			4,
			4,
			4,
			5,
			5,
			5,
			5,
			0,
			0,
			0,
			0
		]);
		var fdeb = new u8([
			0,
			0,
			0,
			0,
			1,
			1,
			2,
			2,
			3,
			3,
			4,
			4,
			5,
			5,
			6,
			6,
			7,
			7,
			8,
			8,
			9,
			9,
			10,
			10,
			11,
			11,
			12,
			12,
			13,
			13,
			0,
			0
		]);
		var clim = new u8([
			16,
			17,
			18,
			0,
			8,
			7,
			9,
			6,
			10,
			5,
			11,
			4,
			12,
			3,
			13,
			2,
			14,
			1,
			15
		]);
		var freb = function(eb, start) {
			var b = new u16(31);
			for (var i = 0; i < 31; ++i) b[i] = start += 1 << eb[i - 1];
			var r = new i32(b[30]);
			for (var i = 1; i < 30; ++i) for (var j = b[i]; j < b[i + 1]; ++j) r[j] = j - b[i] << 5 | i;
			return {
				b,
				r
			};
		};
		var _a = freb(fleb, 2);
		var fl = _a.b;
		var revfl = _a.r;
		fl[28] = 258, revfl[258] = 28;
		var _b = freb(fdeb, 0);
		var fd = _b.b;
		_b.r;
		var rev = new u16(32768);
		for (var i = 0; i < 32768; ++i) {
			var x = (i & 43690) >> 1 | (i & 21845) << 1;
			x = (x & 52428) >> 2 | (x & 13107) << 2;
			x = (x & 61680) >> 4 | (x & 3855) << 4;
			rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
		}
		var hMap = (function(cd, mb, r) {
			var s = cd.length;
			var i = 0;
			var l = new u16(mb);
			for (; i < s; ++i) if (cd[i]) ++l[cd[i] - 1];
			var le = new u16(mb);
			for (i = 1; i < mb; ++i) le[i] = le[i - 1] + l[i - 1] << 1;
			var co;
			if (r) {
				co = new u16(1 << mb);
				var rvb = 15 - mb;
				for (i = 0; i < s; ++i) if (cd[i]) {
					var sv = i << 4 | cd[i];
					var r_1 = mb - cd[i];
					var v = le[cd[i] - 1]++ << r_1;
					for (var m = v | (1 << r_1) - 1; v <= m; ++v) co[rev[v] >> rvb] = sv;
				}
			} else {
				co = new u16(s);
				for (i = 0; i < s; ++i) if (cd[i]) co[i] = rev[le[cd[i] - 1]++] >> 15 - cd[i];
			}
			return co;
		});
		var flt = new u8(288);
		for (var i = 0; i < 144; ++i) flt[i] = 8;
		for (var i = 144; i < 256; ++i) flt[i] = 9;
		for (var i = 256; i < 280; ++i) flt[i] = 7;
		for (var i = 280; i < 288; ++i) flt[i] = 8;
		var fdt = new u8(32);
		for (var i = 0; i < 32; ++i) fdt[i] = 5;
		var flrm = /*#__PURE__*/ hMap(flt, 9, 1);
		var fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
		var max = function(a) {
			var m = a[0];
			for (var i = 1; i < a.length; ++i) if (a[i] > m) m = a[i];
			return m;
		};
		var bits = function(d, p, m) {
			var o = p / 8 | 0;
			return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
		};
		var bits16 = function(d, p) {
			var o = p / 8 | 0;
			return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
		};
		var shft = function(p) {
			return (p + 7) / 8 | 0;
		};
		var slc = function(v, s, e) {
			if (s == null || s < 0) s = 0;
			if (e == null || e > v.length) e = v.length;
			return new u8(v.subarray(s, e));
		};
		var ec = [
			"unexpected EOF",
			"invalid block type",
			"invalid length/literal",
			"invalid distance",
			"stream finished",
			"no stream handler",
			,
			"no callback",
			"invalid UTF-8 data",
			"extra field too long",
			"date not in range 1980-2099",
			"filename too long",
			"stream finishing",
			"invalid zip data"
		];
		var err = function(ind, msg, nt) {
			var e = new Error(msg || ec[ind]);
			e.code = ind;
			if (Error.captureStackTrace) Error.captureStackTrace(e, err);
			if (!nt) throw e;
			return e;
		};
		var inflt = function(dat, st, buf, dict) {
			var sl = dat.length, dl = dict ? dict.length : 0;
			if (!sl || st.f && !st.l) return buf || new u8(0);
			var noBuf = !buf;
			var resize = noBuf || st.i != 2;
			var noSt = st.i;
			if (noBuf) buf = new u8(sl * 3);
			var cbuf = function(l) {
				var bl = buf.length;
				if (l > bl) {
					var nbuf = new u8(Math.max(bl * 2, l));
					nbuf.set(buf);
					buf = nbuf;
				}
			};
			var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
			var tbts = sl * 8;
			do {
				if (!lm) {
					final = bits(dat, pos, 1);
					var type = bits(dat, pos + 1, 3);
					pos += 3;
					if (!type) {
						var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
						if (t > sl) {
							if (noSt) err(0);
							break;
						}
						if (resize) cbuf(bt + l);
						buf.set(dat.subarray(s, t), bt);
						st.b = bt += l, st.p = pos = t * 8, st.f = final;
						continue;
					} else if (type == 1) lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
					else if (type == 2) {
						var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
						var tl = hLit + bits(dat, pos + 5, 31) + 1;
						pos += 14;
						var ldt = new u8(tl);
						var clt = new u8(19);
						for (var i = 0; i < hcLen; ++i) clt[clim[i]] = bits(dat, pos + i * 3, 7);
						pos += hcLen * 3;
						var clb = max(clt), clbmsk = (1 << clb) - 1;
						var clm = hMap(clt, clb, 1);
						for (var i = 0; i < tl;) {
							var r = clm[bits(dat, pos, clbmsk)];
							pos += r & 15;
							var s = r >> 4;
							if (s < 16) ldt[i++] = s;
							else {
								var c = 0, n = 0;
								if (s == 16) n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
								else if (s == 17) n = 3 + bits(dat, pos, 7), pos += 3;
								else if (s == 18) n = 11 + bits(dat, pos, 127), pos += 7;
								while (n--) ldt[i++] = c;
							}
						}
						var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
						lbt = max(lt);
						dbt = max(dt);
						lm = hMap(lt, lbt, 1);
						dm = hMap(dt, dbt, 1);
					} else err(1);
					if (pos > tbts) {
						if (noSt) err(0);
						break;
					}
				}
				if (resize) cbuf(bt + 131072);
				var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
				var lpos = pos;
				for (;; lpos = pos) {
					var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
					pos += c & 15;
					if (pos > tbts) {
						if (noSt) err(0);
						break;
					}
					if (!c) err(2);
					if (sym < 256) buf[bt++] = sym;
					else if (sym == 256) {
						lpos = pos, lm = null;
						break;
					} else {
						var add = sym - 254;
						if (sym > 264) {
							var i = sym - 257, b = fleb[i];
							add = bits(dat, pos, (1 << b) - 1) + fl[i];
							pos += b;
						}
						var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
						if (!d) err(3);
						pos += d & 15;
						var dt = fd[dsym];
						if (dsym > 3) {
							var b = fdeb[dsym];
							dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
						}
						if (pos > tbts) {
							if (noSt) err(0);
							break;
						}
						if (resize) cbuf(bt + 131072);
						var end = bt + add;
						if (bt < dt) {
							var shift = dl - dt, dend = Math.min(dt, end);
							if (shift + bt < 0) err(3);
							for (; bt < dend; ++bt) buf[bt] = dict[shift + bt];
						}
						for (; bt < end; ++bt) buf[bt] = buf[bt - dt];
					}
				}
				st.l = lm, st.p = lpos, st.b = bt, st.f = final;
				if (lm) final = 1, st.m = lbt, st.d = dm, st.n = dbt;
			} while (!final);
			return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
		};
		var et = /*#__PURE__*/ new u8(0);
		var b2 = function(d, b) {
			return d[b] | d[b + 1] << 8;
		};
		var b4 = function(d, b) {
			return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
		};
		var b8 = function(d, b) {
			return b4(d, b) + b4(d, b + 4) * 4294967296;
		};
		function inflateSync(data, opts) {
			return inflt(data, { i: 2 }, opts && opts.out, opts && opts.dictionary);
		}
		var td = typeof TextDecoder != "undefined" && /*#__PURE__*/ new TextDecoder();
		try {
			td.decode(et, { stream: true });
		} catch (e) {}
		var dutf8 = function(d) {
			for (var r = "", i = 0;;) {
				var c = d[i++];
				var eb = (c > 127) + (c > 223) + (c > 239);
				if (i + eb > d.length) return {
					s: r,
					r: slc(d, i - 1)
				};
				if (!eb) r += String.fromCharCode(c);
				else if (eb == 3) c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
				else if (eb & 1) r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
				else r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
			}
		};
		/**
		* Converts a Uint8Array to a string
		* @param dat The data to decode to string
		* @param latin1 Whether or not to interpret the data as Latin-1. This should
		*               not need to be true unless encoding to binary string.
		* @returns The original UTF-8/Latin-1 string
		*/
		function strFromU8(dat, latin1) {
			if (latin1) {
				var r = "";
				for (var i = 0; i < dat.length; i += 16384) r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
				return r;
			} else if (td) return td.decode(dat);
			else {
				var _a = dutf8(dat), s = _a.s, r = _a.r;
				if (r.length) err(8);
				return s;
			}
		}
		var slzh = function(d, b) {
			return b + 30 + b2(d, b + 26) + b2(d, b + 28);
		};
		var zh = function(d, b, z) {
			var fnl = b2(d, b + 28), efl = b2(d, b + 30), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl;
			var _a = z64hs(d, es, efl, z, b4(d, b + 20), b4(d, b + 24), b4(d, b + 42)), sc = _a[0], su = _a[1], off = _a[2];
			return [
				b2(d, b + 10),
				sc,
				su,
				fn,
				es + efl + b2(d, b + 32),
				off
			];
		};
		var z64hs = function(d, b, l, z, sc, su, off) {
			var nsc = sc == 4294967295, nsu = su == 4294967295, noff = off == 4294967295, e = b + l;
			var nf = nsc + nsu + noff;
			if (z && nf) {
				for (; b + 4 < e; b += 4 + b2(d, b + 2)) if (b2(d, b) == 1) return [
					nsc ? b8(d, b + 4 + 8 * nsu) : sc,
					nsu ? b8(d, b + 4) : su,
					noff ? b8(d, b + 4 + 8 * (nsu + nsc)) : off,
					1
				];
				if (z < 2) err(13);
			}
			return [
				sc,
				su,
				off,
				0
			];
		};
		/**
		* Synchronously decompresses a ZIP archive. Prefer using `unzip` for better
		* performance with more than one file.
		* @param data The raw compressed ZIP file
		* @param opts The ZIP extraction options
		* @returns The decompressed files
		*/
		function unzipSync(data, opts) {
			var files = {};
			var e = data.length - 22;
			for (; b4(data, e) != 101010256; --e) if (!e || data.length - e > 65558) err(13);
			var c = b2(data, e + 8);
			if (!c) return {};
			var o = b4(data, e + 16);
			var z = b4(data, e - 20) == 117853008;
			if (z) {
				var ze = b4(data, e - 12);
				z = b4(data, ze) == 101075792;
				if (z) {
					c = b4(data, ze + 32);
					o = b4(data, ze + 48);
				}
			}
			var fltr = opts && opts.filter;
			for (var i = 0; i < c; ++i) {
				var _a = zh(data, o, z), c_2 = _a[0], sc = _a[1], su = _a[2], fn = _a[3], no = _a[4], off = _a[5], b = slzh(data, off);
				o = no;
				if (!fltr || fltr({
					name: fn,
					size: sc,
					originalSize: su,
					compression: c_2
				})) if (!c_2) files[fn] = slc(data, b, b + sc);
				else if (c_2 == 8) files[fn] = inflateSync(data.subarray(b, b + sc), { out: new u8(su) });
				else err(14, "unknown compression type " + c_2);
			}
			return files;
		}
		//#endregion
		//#region src/client/docx.ts
		/**
		* Browser-side docx outline extraction: a .docx is a zip whose
		* word/document.xml holds the body text in <w:t> runs inside <w:p> paragraphs.
		* Uses fflate (inlined into the client bundle) so the user can pick or drag a
		* docx without any server upload.
		*
		* Import from 'fflate/browser' (not 'fflate'): the default entry resolves to
		* the Node build (esm/index.mjs), which calls module.createRequire() for the
		* optional worker_threads path — inlining that into the browser bundle leaves
		* a bare require("module") the client-modules table cannot answer.
		*/
		/** Decode the handful of XML entities docx bodies actually use. */
		function decodeEntities(text) {
			return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
		}
		/** Extract plain text from a docx buffer: one line per <w:p> paragraph. */
		function extractDocxTextFromBuffer(buffer) {
			const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
			let files;
			try {
				files = unzipSync(bytes);
			} catch (error) {
				throw new Error(`不是有效的 docx（zip 解压失败）：${error.message}`);
			}
			const document = files["word/document.xml"];
			if (document === void 0) throw new Error("不是有效的 docx（缺少 word/document.xml）");
			const xml = strFromU8(document);
			const paragraphs = [];
			const parts = xml.split(/<w:p\b[^>]*>/);
			for (let i = 1; i < parts.length; i++) {
				const segment = parts[i];
				const runs = [];
				for (const match of segment.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g)) if (match[0].startsWith("<w:tab")) runs.push("	");
				else if (match[0].startsWith("<w:br")) runs.push("\n");
				else runs.push(decodeEntities(match[1] ?? ""));
				paragraphs.push(runs.join("").replace(/\u00a0/g, " ").trimEnd());
			}
			const text = paragraphs.join("\n").replace(/\n{3,}/g, "\n\n").trim();
			if (text.length === 0) throw new Error("docx 中没有可提取的文本");
			return text;
		}
		//#endregion
		//#region src/client/panel/NovelPanel.tsx
		/**
		* The novel-forge workbench panel: tabs — 工作流 (guided pipeline), 大纲
		* (outline), 章节 (chapter plan + per-chapter write/review/rewrite/polish),
		* 设定库 (story bible), 伏笔 (foreshadows), 设置 (config). Generation and
		* review streams land in the progress console.
		*/
		/** The tab bar definition. */
		const TABS = [
			{
				id: "workflow",
				label: tt("tab.workflow")
			},
			{
				id: "overview",
				label: tt("tab.overview")
			},
			{
				id: "plan",
				label: tt("tab.plan")
			},
			{
				id: "bible",
				label: tt("tab.bible")
			},
			{
				id: "assets",
				label: "写作资产"
			},
			{
				id: "foreshadow",
				label: tt("tab.foreshadow")
			},
			{
				id: "assistant",
				label: tt("tab.assistant")
			},
			{
				id: "settings",
				label: tt("tab.settings")
			}
		];
		/** Whether any chapter is being generated right now. */
		function anyGenerating(chapters) {
			return (chapters ?? []).some((c) => c.status === "generating" || c.status === "reviewing");
		}
		/** Status badge class + label. */
		function statusBadge(chapter) {
			switch (chapter.status) {
				case "pending": return {
					cls: panel_module_css_default.badgePending,
					label: tt("plan.pending")
				};
				case "generating": return {
					cls: panel_module_css_default.badgeGenerating,
					label: tt("plan.generating")
				};
				case "written": return {
					cls: panel_module_css_default.badgeWritten,
					label: tt("plan.written")
				};
				case "reviewing": return {
					cls: panel_module_css_default.badgeGenerating,
					label: tt("plan.reviewing")
				};
				case "approved": return {
					cls: panel_module_css_default.badgeDone,
					label: tt("plan.approved")
				};
				case "rejected": return {
					cls: panel_module_css_default.badgeRejected,
					label: tt("plan.rejected")
				};
				case "error": return {
					cls: panel_module_css_default.badgeError,
					label: tt("plan.error")
				};
			}
		}
		/** One review issue line (severity-colored, theme-aware). */
		function severityColor(severity) {
			return severity === "high" ? "var(--nf-error)" : severity === "medium" ? "var(--nf-warn)" : "var(--nf-info)";
		}
		/** The novel-forge panel. */
		function NovelPanel({ controller, api }) {
			const [activeTab, setActiveTab] = (0, react.useState)("workflow");
			const [config, setConfig] = (0, react.useState)(null);
			const [project, setProject] = (0, react.useState)(null);
			const [generatedFiles, setGeneratedFiles] = (0, react.useState)([]);
			const [outlineText, setOutlineText] = (0, react.useState)("");
			const [customDocxPath, setCustomDocxPath] = (0, react.useState)("");
			const [shelf, setShelf] = (0, react.useState)(null);
			const [dragActive, setDragActive] = (0, react.useState)(false);
			const fileInputRef = (0, react.useRef)(null);
			const [planCount, setPlanCount] = (0, react.useState)(30);
			const [busy, setBusy] = (0, react.useState)(false);
			const [busyLabel, setBusyLabel] = (0, react.useState)("");
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [progress, setProgress] = (0, react.useState)([]);
			const [configDraft, setConfigDraft] = (0, react.useState)(null);
			const [expandedChapter, setExpandedChapter] = (0, react.useState)(null);
			const [chapterText, setChapterText] = (0, react.useState)("");
			const [rewriteInstruction, setRewriteInstruction] = (0, react.useState)("");
			const [localTarget, setLocalTarget] = (0, react.useState)("");
			const progressId = (0, react.useRef)(0);
			/** Refresh bookshelf. */
			const refreshShelf = (0, react.useCallback)(async () => {
				try {
					const snapshot = await api.bookshelf();
					setShelf(snapshot);
				} catch {}
			}, [api]);
			/** Append a progress console line. */
			const pushProgress = (0, react.useCallback)((text, kind = "info") => {
				setProgress((prev) => [...prev.slice(-300), {
					id: progressId.current++,
					text,
					kind
				}]);
			}, []);
			/** Refresh status (config + project + files). */
			const refresh = (0, react.useCallback)(async (showError = true) => {
				try {
					const status = await api.status();
					setConfig(status.config);
					setConfigDraft(status.config);
					setProject(status.project ?? null);
					setGeneratedFiles(status.generatedFiles);
					const nextOutline = status.project?.outline;
					if (nextOutline !== void 0 && outlineText === "") setOutlineText(nextOutline);
				} catch (err) {
					if (showError) setError(err.message);
				}
			}, [api, outlineText]);
			/** Handle a docx file (pick or drag): parse locally, save outline. */
			const handleDocxFile = (0, react.useCallback)(async (file) => {
				setBusy(true);
				setBusyLabel(tt("overview.loadingOutline"));
				setError("");
				try {
					const outline = extractDocxTextFromBuffer(await file.arrayBuffer());
					if (outline.length < 50) throw new Error("大纲内容过短（<50 字符），请检查文件");
					setOutlineText(outline);
					await api.saveOutline(outline);
					await refresh(false);
					pushProgress(`已从「${file.name}」读取大纲（${outline.length} 字）`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`读取大纲失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			}, [
				api,
				pushProgress,
				refresh
			]);
			(0, react.useEffect)(() => {
				refresh();
				refreshShelf();
			}, []);
			/** Load the outline from docx (default path or custom). */
			const handleLoadDocx = async (useCustom) => {
				setBusy(true);
				setBusyLabel(tt("overview.loadingOutline"));
				setError("");
				try {
					const result = await api.loadOutline(useCustom ? customDocxPath || void 0 : void 0);
					setOutlineText(result.outline);
					await api.saveOutline(result.outline);
					await refresh(false);
					pushProgress(`大纲已读取（${result.chars} 字）：${result.bookName}${result.path !== void 0 ? ` ← ${result.path}` : ""}`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`读取大纲失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** Save the edited outline. */
			const handleSaveOutline = async () => {
				setBusy(true);
				setError("");
				try {
					await api.saveOutline(outlineText);
					setNotice(tt("overview.saved"));
					pushProgress(tt("overview.saved"), "done");
					await refresh(false);
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** Extract the story bible. */
			const handleBible = async () => {
				setBusy(true);
				setBusyLabel(tt("bible.gen"));
				setError("");
				try {
					const result = await api.bible(outlineText || void 0);
					setProject((prev) => prev === null ? prev : {
						...prev,
						bible: result.bible,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					const bible = result.bible;
					pushProgress(tt("workflow.bibleDone", {
						n: bible.worldRules.length,
						c: bible.characters.length,
						r: bible.redLines.length
					}), "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`提炼设定圣经失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** Plan volumes. */
			const handleVolumes = async () => {
				setBusy(true);
				setBusyLabel(tt("workflow.genVolumes"));
				setError("");
				try {
					const result = await api.volumes(outlineText || void 0);
					setProject((prev) => prev === null ? prev : {
						...prev,
						volumes: result.volumes,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					pushProgress(tt("workflow.volumesDone", { n: result.volumes.length }), "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`生成卷计划失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** Generate the chapter plan via LLM. */
			const handlePlan = async () => {
				setBusy(true);
				setBusyLabel(tt("plan.generate"));
				setError("");
				try {
					const result = await api.plan(outlineText || void 0, planCount);
					setProject((prev) => {
						const base = prev ?? {
							bookName: "",
							outline: outlineText,
							chapters: [],
							foreshadows: [],
							createdAt: (/* @__PURE__ */ new Date()).toISOString(),
							updatedAt: (/* @__PURE__ */ new Date()).toISOString()
						};
						return {
							...base,
							chapters: [...base.chapters, ...result.chapters],
							updatedAt: (/* @__PURE__ */ new Date()).toISOString()
						};
					});
					pushProgress(tt("workflow.planDone", { n: result.chapters.length }), "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`生成章节计划失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** Shared frame handler for generate/rewrite/polish streams. */
			const applyJobFrame = (0, react.useCallback)((frame, label) => {
				if (frame.type === "start") {
					setProject((prev) => prev === null ? prev : {
						...prev,
						chapters: prev.chapters.map((c) => c.no === frame.no ? {
							...c,
							status: "generating",
							error: void 0
						} : c)
					});
					pushProgress(label(frame.no));
				} else if (frame.type === "delta") {
					if (frame.text.length % 3e3 < 600) pushProgress(`…已生成 ${frame.text.length} 字`);
				} else if (frame.type === "done" || frame.type === "rewritten") {
					setProject((prev) => prev === null ? prev : {
						...prev,
						chapters: prev.chapters.map((c) => c.no === frame.no ? {
							...c,
							status: "written",
							chars: frame.chars,
							file: frame.file,
							review: void 0
						} : c)
					});
					pushProgress(tt("progress.done", {
						no: frame.no,
						chars: frame.chars,
						file: frame.file
					}), "done");
					setGeneratedFiles((prev) => prev.includes(frame.file) ? prev : [...prev, frame.file]);
				} else if (frame.type === "review") {
					setProject((prev) => prev === null ? prev : {
						...prev,
						chapters: prev.chapters.map((c) => c.no === frame.no ? {
							...c,
							status: frame.report.passed ? "approved" : "rejected",
							review: frame.report
						} : c)
					});
					pushProgress(tt("progress.reviewed", {
						no: frame.no,
						score: frame.report.score,
						verdict: frame.report.verdict
					}), frame.report.passed ? "done" : "error");
				} else if (frame.type === "error") {
					setProject((prev) => prev === null ? prev : {
						...prev,
						chapters: prev.chapters.map((c) => c.no === frame.no ? {
							...c,
							status: "error",
							error: frame.message
						} : c)
					});
					pushProgress(tt("progress.error", {
						no: frame.no,
						message: frame.message
					}), "error");
				}
			}, [pushProgress]);
			/** Generate one chapter, streaming frames into the console. */
			const handleWriteChapter = async (no, skipReview) => {
				setBusy(true);
				setBusyLabel(`${tt("plan.write")} 第${no}章`);
				setError("");
				try {
					await api.generate(no, skipReview, (frame) => {
						applyJobFrame(frame, (n) => tt("progress.generating", {
							no: n,
							title: project?.chapters.find((c) => c.no === n)?.title ?? ""
						}));
					});
				} catch (err) {
					setError(err.message);
					pushProgress(`第 ${no} 章失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
					await refresh(false);
				}
			};
			/** Batch-write all remaining chapters in sequence. */
			const handleWriteAll = async () => {
				const remaining = chapters.filter((c) => c.status === "pending" || c.status === "error");
				if (remaining.length === 0) return;
				setBusy(true);
				setBusyLabel(`${tt("plan.writeAllPending")}（共 ${remaining.length} 章）`);
				setError("");
				let failed = 0;
				for (const chapter of remaining) {
					pushProgress(`▶ 开始生成第 ${chapter.no} 章《${chapter.title}》`);
					try {
						await api.generate(chapter.no, true, (frame) => {
							applyJobFrame(frame, (n) => tt("progress.generating", {
								no: n,
								title: project?.chapters.find((c) => c.no === n)?.title ?? ""
							}));
						});
					} catch (err) {
						failed++;
						pushProgress(`第 ${chapter.no} 章失败：${err.message}`, "error");
					}
				}
				setBusy(false);
				setBusyLabel("");
				await refresh(false);
				pushProgress(failed === 0 ? `批量生成完成：${remaining.length} 章全部完成` : `批量生成结束：${remaining.length - failed} 章完成，${failed} 章失败`, failed === 0 ? "done" : "error");
			};
			/** Review one chapter. */
			const handleReview = async (no) => {
				setBusy(true);
				setBusyLabel(`${tt("plan.review")} 第${no}章`);
				setError("");
				try {
					const report = (await api.review(no)).report;
					setProject((prev) => prev === null ? prev : {
						...prev,
						chapters: prev.chapters.map((c) => c.no === no ? {
							...c,
							status: report.passed ? "approved" : "rejected",
							review: report
						} : c)
					});
					pushProgress(tt("progress.reviewed", {
						no,
						score: report.score,
						verdict: report.verdict
					}), report.passed ? "done" : "error");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** Rewrite one chapter (whole-chapter or local target). */
			const handleRewrite = async (no) => {
				setBusy(true);
				setBusyLabel(`${tt("plan.rewrite")} 第${no}章`);
				setError("");
				try {
					await api.rewrite(no, rewriteInstruction, localTarget, (frame) => {
						applyJobFrame(frame, (n) => tt("progress.rewriting", { no: n }));
					});
					setRewriteInstruction("");
					setLocalTarget("");
				} catch (err) {
					setError(err.message);
					pushProgress(`第 ${no} 章修订失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
					await refresh(false);
				}
			};
			/** Polish one chapter. */
			const handlePolish = async (no) => {
				setBusy(true);
				setBusyLabel(`${tt("plan.polish")} 第${no}章`);
				setError("");
				try {
					await api.polish(no, (frame) => {
						applyJobFrame(frame, (n) => tt("progress.polishing", { no: n }));
					});
				} catch (err) {
					setError(err.message);
					pushProgress(`第 ${no} 章润色失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
					await refresh(false);
				}
			};
			/** Approve a chapter manually. */
			const handleApprove = (no) => {
				setProject((prev) => prev === null ? prev : {
					...prev,
					chapters: prev.chapters.map((c) => c.no === no ? {
						...c,
						status: "approved"
					} : c),
					updatedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
			};
			/** Toggle chapter preview. */
			const handleToggleChapter = async (no) => {
				if (expandedChapter === no) {
					setExpandedChapter(null);
					setChapterText("");
					return;
				}
				setExpandedChapter(no);
				setChapterText("");
				try {
					const result = await api.chapter(no);
					setChapterText(result.markdown);
				} catch (err) {
					setChapterText(`（${err.message}）`);
				}
			};
			/** Suggest foreshadows via LLM. */
			const handleSuggestForeshadows = async () => {
				setBusy(true);
				setBusyLabel(tt("foreshadow.suggest"));
				setError("");
				try {
					const result = await api.foreshadow({ suggest: true });
					setProject((prev) => prev === null ? prev : {
						...prev,
						foreshadows: [...prev?.foreshadows ?? [], ...result.foreshadows],
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					pushProgress(`AI 已建议 ${result.foreshadows.length} 条伏笔`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`伏笔建议失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** Save the settings draft. */
			const handleSaveConfig = async () => {
				if (configDraft === null) return;
				setBusy(true);
				setError("");
				try {
					const result = await api.patchConfig({
						outlinePath: configDraft.outlinePath,
						outputDir: configDraft.outputDir,
						provider: configDraft.provider,
						model: configDraft.model,
						chapterChars: configDraft.chapterChars,
						maxTokens: configDraft.maxTokens,
						reviewPassScore: configDraft.reviewPassScore,
						autoReview: configDraft.autoReview
					});
					setConfig(result.config);
					setConfigDraft(result.config);
					setNotice(tt("settings.saved"));
					pushProgress(tt("settings.saved"), "done");
					await refresh(false);
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** Export the book. */
			const handleExport = async (format) => {
				setBusy(true);
				setError("");
				try {
					const result = await api.exportBook(format);
					setNotice(tt("settings.exported", {
						file: result.file,
						chars: result.chars,
						chapters: result.chapters
					}));
					pushProgress(tt("settings.exported", {
						file: result.file,
						chars: result.chars,
						chapters: result.chapters
					}), "done");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			const busyAny = anyGenerating(project?.chapters);
			const chapters = project?.chapters ?? [];
			const doneCount = chapters.filter((c) => c.status === "approved" || c.status === "written" || c.status === "rejected").length;
			const pendingCount = chapters.filter((c) => c.status === "pending" || c.status === "error").length;
			const bible = project?.bible;
			const volumes = project?.volumes;
			const foreshadows = project?.foreshadows ?? [];
			/** Workflow timeline row: step dot + connector + label + optional action. */
			const workflowRow = (stepNo, done, label, hint, buttonLabel, onClick, disabled) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.workflowRow,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: `${panel_module_css_default.workflowDot} ${done ? panel_module_css_default.workflowDotDone : panel_module_css_default.workflowDotActive}`,
						children: done ? "✓" : stepNo
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.workflowBody,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.workflowLabel,
							children: label
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.workflowHint,
							children: hint
						})]
					}),
					!done && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
						disabled: disabled || busy,
						onClick,
						children: buttonLabel
					})
				]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.panelHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
							className: panel_module_css_default.panelTitle,
							children: [tt("panel.title"), project?.bookName !== "" && project?.bookName !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badge,
								style: {
									borderColor: "var(--nf-accent)",
									color: "var(--nf-accent)",
									fontSize: 11
								},
								children: project.bookName
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.iconButton,
							title: tt("common.close"),
							"aria-label": tt("common.close"),
							onClick: () => {
								controller.close();
							},
							children: "×"
						})]
					}),
					shelf !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BookshelfBar, {
						api,
						shelf,
						onSwitch: () => {
							refreshShelf();
							setOutlineText("");
							setProject(null);
							setGeneratedFiles([]);
							setChapterText("");
							setExpandedChapter(null);
							setProgress([]);
							refresh(false);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.tabBar,
						role: "tablist",
						children: TABS.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": activeTab === tab.id,
							"data-active": activeTab === tab.id ? "" : void 0,
							className: panel_module_css_default.tab,
							onClick: () => {
								setActiveTab(tab.id);
							},
							children: tab.label
						}, tab.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.panelContent,
						children: [
							error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.card,
								style: { borderColor: "var(--nf-error)" },
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: { color: "var(--nf-error)" },
									children: [
										tt("common.error"),
										": ",
										error
									]
								})
							}),
							notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.card,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: { color: "var(--nf-success)" },
									children: notice
								})
							}),
							busy && busyLabel !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.card,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: { color: "var(--nf-accent)" },
									children: [busyLabel, "…"]
								})
							}),
							activeTab === "workflow" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.card,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.cardTitle,
										children: tt("workflow.title")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.meta,
										children: tt("workflow.progress", {
											bible: bible !== void 0 ? "✓" : "—",
											volumes: volumes !== void 0 ? "✓" : "—",
											plan: chapters.length > 0 ? "✓" : "—",
											done: doneCount,
											total: chapters.length
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.workflowList,
										children: [
											workflowRow(1, project !== null, tt("workflow.step1"), "从 docx 或粘贴文本导入全书大纲", tt("workflow.loadOutline"), () => {
												handleLoadDocx(false);
											}, false),
											workflowRow(2, bible !== void 0, tt("workflow.step2"), "提炼人设 / 世界观 / 金手指规则 / 写作红线", tt("workflow.genBible"), () => {
												handleBible();
											}, project === null),
											workflowRow(3, volumes !== void 0, tt("workflow.step3"), "按剧情弧线划分全书卷结构", tt("workflow.genVolumes"), () => {
												handleVolumes();
											}, project === null),
											workflowRow(4, chapters.length > 0, tt("workflow.step4"), "每章标题 + 剧情要点 + 字数目标", tt("workflow.genPlan"), () => {
												handlePlan();
											}, project === null),
											workflowRow(5, doneCount > 0, tt("workflow.step5"), "逐章生成，自动摘要 + AI 审稿", tt("plan.write"), () => {
												setActiveTab("plan");
											}, false),
											workflowRow(6, doneCount > 0, tt("workflow.step6"), "去 AI 味润色 / 导出全本", tt("settings.exportTxt"), () => {
												handleExport("txt");
											}, false)
										]
									})
								]
							}),
							activeTab === "overview" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.card,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.row,
										style: { justifyContent: "space-between" },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.cardTitle,
											children: tt("tab.overview")
										}), project !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.meta,
											children: [
												tt("overview.bookName"),
												": ",
												project.bookName
											]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: `${panel_module_css_default.dropzone} ${dragActive ? panel_module_css_default.dropzoneActive : ""}`,
										onClick: () => {
											fileInputRef.current?.click();
										},
										onDragOver: (e) => {
											e.preventDefault();
											setDragActive(true);
										},
										onDragLeave: () => {
											setDragActive(false);
										},
										onDrop: (e) => {
											e.preventDefault();
											setDragActive(false);
											const file = e.dataTransfer.files?.[0];
											if (file !== void 0) handleDocxFile(file);
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.dropzoneIcon,
												children: "📄"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "点击选择本机 docx 大纲，或将文件拖到这里" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: "也支持粘贴文本到下方编辑区"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												ref: fileInputRef,
												type: "file",
												accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
												style: { display: "none" },
												onChange: (e) => {
													const file = e.target.files?.[0];
													if (file !== void 0) handleDocxFile(file);
													e.target.value = "";
												}
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.row,
										style: { justifyContent: "space-between" },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.meta,
											children: [
												tt("overview.outlineChars"),
												": ",
												outlineText.length
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.button,
											disabled: busy || outlineText.length < 50,
											onClick: () => {
												handleSaveOutline();
											},
											children: tt("overview.saveOutline")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: panel_module_css_default.textarea,
										value: outlineText,
										placeholder: tt("overview.outlineHint"),
										onChange: (e) => {
											setOutlineText(e.target.value);
										},
										spellCheck: false
									})
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.card,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.cardTitle,
									children: [
										tt("status.files"),
										"（",
										generatedFiles.length,
										"）"
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.fileList,
									children: [generatedFiles.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("status.projectNone") }), generatedFiles.map((file) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: file }, file))]
								})]
							})] }),
							activeTab === "plan" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.card,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.row,
										style: { justifyContent: "space-between" },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.cardTitle,
											children: tt("tab.plan")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.row,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.meta,
													children: tt("plan.generateHint")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: panel_module_css_default.input,
													style: { width: 72 },
													type: "number",
													min: 1,
													max: 200,
													value: planCount,
													onChange: (e) => {
														const v = Number(e.target.value);
														if (Number.isInteger(v)) setPlanCount(v);
													}
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.meta,
													children: tt("plan.count")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
													disabled: busy || outlineText.length < 50,
													onClick: () => {
														handlePlan();
													},
													children: tt("plan.generate")
												})
											]
										})]
									}), volumes !== void 0 && volumes.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.row,
										children: volumes.map((v) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.badge,
											style: {
												borderColor: "var(--nf-accent)",
												color: "var(--nf-accent)"
											},
											children: [
												v.no,
												". ",
												v.title,
												"（",
												v.chapterStart,
												"-",
												v.chapterEnd,
												"）"
											]
										}, v.no))
									})]
								}),
								chapters.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.card,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.row,
										style: { justifyContent: "space-between" },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: panel_module_css_default.meta,
											children: [
												"共 ",
												chapters.length,
												" 章 · 已完成 ",
												doneCount,
												" · 待生成 ",
												pendingCount
											]
										}), pendingCount > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
											disabled: busy,
											onClick: () => {
												handleWriteAll();
											},
											children: [
												tt("plan.writeAllPending"),
												"（",
												pendingCount,
												"）"
											]
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.chapterList,
										children: chapters.map((chapter) => {
											const badge = statusBadge(chapter);
											const expanded = expandedChapter === chapter.no;
											const review = chapter.review;
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.chapter,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.chapterNum,
														children: chapter.no
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.chapterMain,
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: panel_module_css_default.chapterTitle,
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																		type: "button",
																		className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																		style: { padding: "1px 6px" },
																		onClick: () => {
																			handleToggleChapter(chapter.no);
																		},
																		children: expanded ? "−" : "+"
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: chapter.title }),
																	chapter.status === "approved" && chapter.chars !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		className: panel_module_css_default.meta,
																		children: [chapter.chars, tt("common.chars")]
																	}),
																	chapter.volume > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		className: panel_module_css_default.meta,
																		children: [tt("plan.volumes"), chapter.volume]
																	})
																]
															}),
															!expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: panel_module_css_default.chapterBeats,
																title: chapter.beats,
																children: chapter.beats
															}),
															expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: {
																	display: "flex",
																	flexDirection: "column",
																	gap: 6
																},
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: panel_module_css_default.meta,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [tt("plan.beats"), ":"] }),
																			" ",
																			chapter.beats
																		]
																	}),
																	chapter.summary !== void 0 && chapter.summary !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: panel_module_css_default.meta,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [tt("plan.summary"), ":"] }),
																			" ",
																			chapter.summary
																		]
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
																		className: panel_module_css_default.chapterPreview,
																		children: chapterText || `（${tt("common.loading")}）`
																	}),
																	review !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		className: panel_module_css_default.reviewBox,
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																				className: panel_module_css_default.row,
																				style: { justifyContent: "space-between" },
																				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: tt("plan.reviewReport") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																					style: { color: review.passed ? "var(--nf-success)" : "var(--nf-error)" },
																					children: [
																						tt("plan.reviewScore"),
																						": ",
																						review.score,
																						" — ",
																						review.passed ? tt("plan.reviewPass") : tt("plan.reviewFail")
																					]
																				})]
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																				className: panel_module_css_default.meta,
																				children: [
																					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [tt("plan.reviewVerdict"), ":"] }),
																					" ",
																					review.verdict
																				]
																			}),
																			review.issues.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
																				style: {
																					margin: 0,
																					paddingLeft: 18,
																					fontSize: 12
																				},
																				children: review.issues.map((issue, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
																					style: { color: severityColor(issue.severity) },
																					children: [
																						"[",
																						issue.severity,
																						"] ",
																						issue.item,
																						" → ",
																						issue.suggestion
																					]
																				}, i))
																			})
																		]
																	}),
																	(chapter.status === "rejected" || chapter.status === "written" || chapter.status === "approved") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																		style: {
																			display: "flex",
																			flexDirection: "column",
																			gap: 6
																		},
																		children: [
																			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																				className: panel_module_css_default.meta,
																				style: { fontWeight: 600 },
																				children: "修订（可整章或局部）"
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																				className: panel_module_css_default.field,
																				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																					className: panel_module_css_default.fieldLabel,
																					children: "要修改的原文片段（从上面正文复制一段；留空 = 整章修订）"
																				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
																					className: panel_module_css_default.textarea,
																					style: { minHeight: 56 },
																					placeholder: "例如：林越咬紧牙关：…（复制正文中的原句）",
																					value: localTarget,
																					onChange: (e) => {
																						setLocalTarget(e.target.value);
																					}
																				})]
																			}),
																			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																				className: panel_module_css_default.row,
																				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																					className: panel_module_css_default.input,
																					style: { flex: 1 },
																					placeholder: "修订指令（如：这段对话太生硬，改得更口语化）",
																					value: rewriteInstruction,
																					onChange: (e) => {
																						setRewriteInstruction(e.target.value);
																					}
																				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																					type: "button",
																					className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
																					disabled: busy || busyAny,
																					onClick: () => {
																						handleRewrite(chapter.no);
																					},
																					children: tt("plan.rewrite")
																				})]
																			})
																		]
																	})
																]
															})
														]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: `${panel_module_css_default.badge} ${badge.cls}`,
														children: badge.label
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.chapterActions,
														children: [
															(chapter.status === "pending" || chapter.status === "error") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
																disabled: busy || busyAny,
																onClick: () => {
																	handleWriteChapter(chapter.no, true);
																},
																children: tt("plan.write")
															}),
															(chapter.status === "written" || chapter.status === "rejected") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																disabled: busy || busyAny,
																onClick: () => {
																	handleReview(chapter.no);
																},
																children: tt("plan.review")
															}),
															chapter.status === "written" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																disabled: busy || busyAny,
																onClick: () => {
																	handleApprove(chapter.no);
																},
																children: tt("plan.approve")
															}),
															(chapter.status === "written" || chapter.status === "rejected" || chapter.status === "approved") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																disabled: busy || busyAny,
																onClick: () => {
																	handlePolish(chapter.no);
																},
																children: tt("plan.polish")
															}),
															chapter.status === "rejected" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																disabled: busy || busyAny,
																onClick: () => {
																	handleWriteChapter(chapter.no, true);
																},
																children: tt("plan.rewrite")
															})
														]
													})
												]
											}, chapter.no);
										})
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.card,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.cardTitle,
										children: tt("plan.progress")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.progress,
										children: [progress.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.meta,
											children: tt("progress.empty")
										}), progress.map((line) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: line.kind === "done" ? panel_module_css_default.progressLineDone : line.kind === "error" ? panel_module_css_default.progressLineError : panel_module_css_default.progressLine,
											children: line.text
										}, line.id))]
									})]
								})
							] }),
							activeTab === "bible" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.card,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.row,
									style: { justifyContent: "space-between" },
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.cardTitle,
										children: tt("bible.title")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
										disabled: busy,
										onClick: () => {
											handleBible();
										},
										children: tt("bible.gen")
									})]
								}), bible === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.meta,
									children: tt("bible.none")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										flexDirection: "column",
										gap: 10
									},
									children: [
										bible.genre !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [tt("bible.genre"), ":"] }),
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: bible.genre
											})
										] }),
										bible.worldRules.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
											tt("bible.worldRules"),
											"（",
											bible.worldRules.length,
											"）"
										] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
											style: {
												margin: 0,
												paddingLeft: 18,
												fontSize: 12
											},
											children: bible.worldRules.map((r, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: r }, i))
										})] }),
										bible.characters.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
											tt("bible.characters"),
											"（",
											bible.characters.length,
											"）"
										] }), bible.characters.map((card) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												marginTop: 4,
												fontSize: 12
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: card.name }),
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: panel_module_css_default.meta,
													children: [
														"[",
														card.role,
														"] ",
														card.traits.join("、")
													]
												}),
												card.goals !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.meta,
													children: ["目标：", card.goals]
												}),
												card.relations !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.meta,
													children: ["关系：", card.relations]
												})
											]
										}, card.name))] }),
										bible.redLines.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
											tt("bible.redLines"),
											"（",
											bible.redLines.length,
											"）"
										] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
											style: {
												margin: 0,
												paddingLeft: 18,
												fontSize: 12,
												color: "var(--nf-error)"
											},
											children: bible.redLines.map((r, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: r }, i))
										})] }),
										bible.style.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
											tt("bible.style"),
											"（",
											bible.style.length,
											"）"
										] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
											style: {
												margin: 0,
												paddingLeft: 18,
												fontSize: 12
											},
											children: bible.style.map((r, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: r }, i))
										})] })
									]
								})]
							}),
							activeTab === "assets" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssetsTab, { api }),
							activeTab === "foreshadow" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.card,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.row,
									style: { justifyContent: "space-between" },
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.cardTitle,
										children: [
											tt("foreshadow.title"),
											"（",
											foreshadows.length,
											"）"
										]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
										disabled: busy,
										onClick: () => {
											handleSuggestForeshadows();
										},
										children: tt("foreshadow.suggest")
									})]
								}), foreshadows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.meta,
									children: tt("foreshadow.none")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.chapterList,
									children: foreshadows.map((f) => {
										const statusLabel = {
											planned: tt("foreshadow.planned"),
											planted: tt("foreshadow.planted"),
											progressing: tt("foreshadow.progressing"),
											resolved: tt("foreshadow.resolved"),
											abandoned: tt("foreshadow.abandoned")
										}[f.status];
										const statusColor = f.status === "resolved" ? "var(--nf-success)" : f.status === "planted" || f.status === "progressing" ? "var(--nf-accent)" : f.status === "abandoned" ? "var(--nf-text-3)" : "var(--nf-info)";
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.chapter,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.chapterMain,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: panel_module_css_default.chapterTitle,
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: f.description })
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.meta,
														children: [
															f.plantedChapter !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
																tt("foreshadow.plantedAt"),
																" 第",
																f.plantedChapter,
																"章 · "
															] }),
															f.targetChapter !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
																tt("foreshadow.target"),
																" 第",
																f.targetChapter,
																"章 · "
															] }),
															f.resolvedNote !== void 0 && f.resolvedNote !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
																"回收：",
																f.resolvedNote,
																" · "
															] })
														]
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.badge,
													style: {
														borderColor: statusColor,
														color: statusColor
													},
													children: statusLabel
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.row,
													style: { gap: 4 },
													children: [f.status === "planned" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
														disabled: busy,
														onClick: () => {
															api.foreshadow({
																id: f.id,
																status: "planted",
																plantedChapter: doneCount + 1
															}).then((r) => setProject((prev) => prev === null ? prev : {
																...prev,
																foreshadows: r.foreshadows
															}));
														},
														children: tt("foreshadow.setPlanted")
													}), (f.status === "planted" || f.status === "progressing") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
														disabled: busy,
														onClick: () => {
															api.foreshadow({
																id: f.id,
																status: "resolved",
																resolvedNote: `第${doneCount}章回收`
															}).then((r) => setProject((prev) => prev === null ? prev : {
																...prev,
																foreshadows: r.foreshadows
															}));
														},
														children: tt("foreshadow.setResolved")
													})]
												})
											]
										}, f.id);
									})
								})]
							}),
							activeTab === "assistant" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistantTab, { api }),
							activeTab === "settings" && configDraft !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.card,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.cardTitle,
										children: tt("settings.title")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: panel_module_css_default.fieldLabel,
											children: tt("settings.outlinePath")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: panel_module_css_default.input,
											value: configDraft.outlinePath,
											onChange: (e) => {
												setConfigDraft({
													...configDraft,
													outlinePath: e.target.value
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.field,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
											className: panel_module_css_default.fieldLabel,
											children: tt("settings.outputDir")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: panel_module_css_default.input,
											value: configDraft.outputDir,
											onChange: (e) => {
												setConfigDraft({
													...configDraft,
													outputDir: e.target.value
												});
											}
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.row,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.field,
											style: { flex: 1 },
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: panel_module_css_default.fieldLabel,
												children: tt("settings.provider")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												value: configDraft.provider,
												onChange: (e) => {
													setConfigDraft({
														...configDraft,
														provider: e.target.value
													});
												}
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.field,
											style: { flex: 1 },
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: panel_module_css_default.fieldLabel,
												children: tt("settings.model")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												value: configDraft.model,
												onChange: (e) => {
													setConfigDraft({
														...configDraft,
														model: e.target.value
													});
												}
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.row,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.field,
											style: { flex: 1 },
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: panel_module_css_default.fieldLabel,
												children: tt("settings.chapterChars")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												type: "number",
												min: 1e3,
												max: 2e4,
												value: configDraft.chapterChars,
												onChange: (e) => {
													setConfigDraft({
														...configDraft,
														chapterChars: Number(e.target.value)
													});
												}
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.field,
											style: { flex: 1 },
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: panel_module_css_default.fieldLabel,
												children: tt("settings.maxTokens")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												type: "number",
												min: 2e3,
												max: 64e3,
												value: configDraft.maxTokens,
												onChange: (e) => {
													setConfigDraft({
														...configDraft,
														maxTokens: Number(e.target.value)
													});
												}
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.row,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.field,
											style: { flex: 1 },
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: panel_module_css_default.fieldLabel,
												children: tt("settings.reviewPassScore")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												type: "number",
												min: 0,
												max: 100,
												value: configDraft.reviewPassScore,
												onChange: (e) => {
													setConfigDraft({
														...configDraft,
														reviewPassScore: Number(e.target.value)
													});
												}
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.field,
											style: { flex: 1 },
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
												className: panel_module_css_default.fieldLabel,
												children: tt("settings.autoReview")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												className: panel_module_css_default.input,
												value: configDraft.autoReview ? "1" : "0",
												onChange: (e) => {
													setConfigDraft({
														...configDraft,
														autoReview: e.target.value === "1"
													});
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "1",
													children: "✓ 是"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "0",
													children: "✗ 否"
												})]
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.row,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
												disabled: busy,
												onClick: () => {
													handleSaveConfig();
												},
												children: tt("settings.save")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.button,
												onClick: () => {
													api.openFolder();
												},
												children: tt("settings.openFolder")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: panel_module_css_default.meta,
												children: [
													"当前：",
													config?.provider,
													" / ",
													config?.model,
													" · ",
													config?.outputDir
												]
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.row,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.cardTitle,
												children: tt("settings.export")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.button,
												disabled: busy || chapters.length === 0,
												onClick: () => {
													handleExport("txt");
												},
												children: tt("settings.exportTxt")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: panel_module_css_default.button,
												disabled: busy || chapters.length === 0,
												onClick: () => {
													handleExport("md");
												},
												children: tt("settings.exportMd")
											})
										]
									})
								]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/mount.tsx
		/**
		* Panel view mounting — mirrors the family plugins: a container appended
		* inside the conversation grid item, hidden while inactive; toggling is a
		* data attribute on <html>, with cross-plugin activation events.
		*/
		const CONVERSATION_COLUMN_SELECTOR = "[data-pane=\"conversation\"]";
		const ACTIVE_ATTR = "data-dsh-novelforge-active";
		/** Sibling panels' activation attributes (evicted when this panel opens). */
		const OTHER_ACTIVE_ATTRS = ["data-dsh-taskboard-active", "data-dsh-ssh-active"];
		/** Cross-plugin activation event; detail is the activating panel name. */
		const ACTIVATE_EVENT = "dsh-panel-activate";
		const PANEL_NAME = "novelforge";
		/** Find the center column, or undefined while the frame is not mounted. */
		function conversationColumn() {
			return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? void 0;
		}
		/**
		* Mount the panel React tree into the center column and bind visibility to
		* the controller.
		*/
		function mountPanel(controller, api) {
			let root;
			let container;
			const ensure = () => {
				if (container !== void 0) {
					if (container.isConnected) return;
					root?.unmount();
					root = void 0;
					container.remove();
					container = void 0;
				}
				const column = conversationColumn();
				if (column === void 0) return;
				container = document.createElement("div");
				container.dataset.dshNovelforgeView = "true";
				container.className = panel_module_css_default.view;
				column.appendChild(container);
				root = (0, react_dom_client.createRoot)(container);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NovelPanel, {
					controller,
					api
				}));
			};
			const waitObserver = new MutationObserver(() => {
				ensure();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const applyActive = () => {
				if (controller.getSnapshot().panelOpen) {
					for (const attr of OTHER_ACTIVE_ATTRS) document.documentElement.removeAttribute(attr);
					document.documentElement.setAttribute(ACTIVE_ATTR, "");
					document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
				} else document.documentElement.removeAttribute(ACTIVE_ATTR);
			};
			const onOtherActivate = (event) => {
				const detail = event.detail;
				if ((detail === "taskboard" || detail === "ssh") && controller.getSnapshot().panelOpen) controller.close();
			};
			const SIDEBAR_ROW_SELECTOR = "[class*=\"sessionRow\"], [class*=\"projectRow\"], [class*=\"searchResultRow\"], [class*=\"searchResultWorkspace\"], [class*=\"newSession\"]";
			const onClickSidebarRow = (event) => {
				if (!controller.getSnapshot().panelOpen) return;
				const target = event.target;
				if (target === null) return;
				if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close();
			};
			document.addEventListener("click", onClickSidebarRow, true);
			document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
			const unsubscribe = controller.subscribe(applyActive);
			applyActive();
			ensure();
			return () => {
				document.removeEventListener("click", onClickSidebarRow, true);
				document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
				waitObserver.disconnect();
				unsubscribe();
				document.documentElement.removeAttribute(ACTIVE_ATTR);
				root?.unmount();
				root = void 0;
				container?.remove();
				container = void 0;
			};
		}
		//#endregion
		//#region src/client/panel/controller.ts
		/** The panel state owner the sidebar entry toggles and the view renders from. */
		var PanelController = class {
			panelOpen = false;
			listeners = /* @__PURE__ */ new Set();
			getSnapshot() {
				return { panelOpen: this.panelOpen };
			}
			subscribe(fn) {
				this.listeners.add(fn);
				return () => {
					this.listeners.delete(fn);
				};
			}
			open() {
				if (this.panelOpen) return;
				this.panelOpen = true;
				this.notify();
			}
			close() {
				if (!this.panelOpen) return;
				this.panelOpen = false;
				this.notify();
			}
			toggle() {
				if (this.panelOpen) this.close();
				else this.open();
			}
			notify() {
				for (const fn of [...this.listeners]) fn();
			}
		};
		//#endregion
		//#region src/client/sidebar-entry.ts
		/** Find the sidebar shell root element. */
		function sidebarRoot() {
			const column = document.querySelector("[data-pane=\"sidebar\"], [class*=\"sidebarCol\"]");
			if (column === null) return void 0;
			return column.querySelector("[class*=\"logoRow\"]")?.parentElement ?? column.firstElementChild;
		}
		/** The New Session button (nested in the logo row on current shells). */
		function newSessionButton(root) {
			const nested = root.querySelector("button[class*=\"newSession\"]");
			if (nested !== null) return nested;
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
		}
		/** Build the entry row (a detached button; insert once the shell is up). */
		function createEntry(controller) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshNovelforgeEntry = "true";
			entry.className = panel_module_css_default.entry;
			entry.setAttribute("aria-label", tt("entry.label"));
			entry.setAttribute("title", tt("entry.tooltip"));
			entry.innerHTML = "<span class=\"" + panel_module_css_default.entryIcon + "\"><svg viewBox=\"0 0 16 16\" width=\"14\" height=\"14\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M2.5 3.5h4a2 2 0 0 1 2 2v7a2 2 0 0 0-2-2h-4z\"/><path d=\"M13.5 3.5h-4a2 2 0 0 0-2 2v7a2 2 0 0 1 2-2h4z\"/><path d=\"M8 5.5v7\"/></svg></span><span class=\"" + panel_module_css_default.entryLabel + "\">" + tt("entry.label") + "</span>";
			entry.addEventListener("click", () => {
				controller.toggle();
			});
			return entry;
		}
		/** Re-insert the entry after the sibling plugin entry block. */
		function placeEntry(root, entry) {
			const button = newSessionButton(root);
			if (button === void 0) return false;
			if (entry.parentElement !== root) {
				const row = button.closest("[class*=\"logoRow\"]");
				const base = row !== null && row.parentElement === root ? row : button;
				const family = Array.from(root.children).filter((el) => el instanceof HTMLElement && el.matches("[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-novelforge-entry]"));
				const last = family.length > 0 ? family[family.length - 1] : void 0;
				const anchor = last !== void 0 ? last.nextElementSibling : base.nextElementSibling;
				root.insertBefore(entry, anchor);
			}
			return true;
		}
		/**
		* Mount the sidebar entry, waiting for the shell and self-healing on
		* re-renders.
		*/
		function mountSidebarEntry(controller) {
			const entry = createEntry(controller);
			let root;
			let placed = false;
			const tryPlace = () => {
				if (root !== void 0 && !root.isConnected) {
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				if (placed) {
					if (document.body.contains(entry)) return;
					rootObserver.disconnect();
					root = void 0;
					placed = false;
				}
				root ??= sidebarRoot();
				if (root === void 0) return;
				placed = placeEntry(root, entry);
				if (placed) rootObserver.observe(root, {
					childList: true,
					subtree: true
				});
			};
			const waitObserver = new MutationObserver(() => {
				tryPlace();
			});
			waitObserver.observe(document.body, {
				childList: true,
				subtree: true
			});
			const rootObserver = new MutationObserver(() => {
				if (root === void 0 || !root.isConnected) {
					placed = false;
					tryPlace();
					return;
				}
				if (!root.contains(entry)) placed = placeEntry(root, entry);
			});
			const syncActive = () => {
				if (controller.getSnapshot().panelOpen) entry.dataset.active = "true";
				else delete entry.dataset.active;
			};
			const unsubscribe = controller.subscribe(syncActive);
			syncActive();
			tryPlace();
			return () => {
				waitObserver.disconnect();
				rootObserver.disconnect();
				unsubscribe();
				entry.remove();
			};
		}
		//#endregion
		//#region src/client/index.ts
		/** Required services (fiber inject waiting). */
		const inject = ["slots", "locale"];
		/**
		* Mount the novel-forge workbench.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			const controller = new PanelController();
			const api = new NovelApi();
			const disposers = [];
			try {
				disposers.push(mountSidebarEntry(controller));
				disposers.push(mountPanel(controller, api));
			} catch (error) {
				console.warn("[dsh-novel-forge] mount failed:", error);
			}
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
			}, "dsh-novel-forge: ui mounts");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map