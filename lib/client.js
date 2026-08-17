window.__ModuleLoader__.load({
	id: "@waterwx/dsh-novel-forge",
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
			/** 采纳待确认草稿（润色/重写产物）覆盖正文文件。 */
			draftApply: "/api/dsh-novel-forge/draft/apply",
			/** 放弃待确认草稿，保留原稿。 */
			draftDiscard: "/api/dsh-novel-forge/draft/discard",
			summary: "/api/dsh-novel-forge/summary",
			foreshadow: "/api/dsh-novel-forge/foreshadow",
			exportBook: "/api/dsh-novel-forge/export",
			chapter: "/api/dsh-novel-forge/chapter",
			/** 审查任意正文文本（作者手动编辑后，不落盘）。 */
			chapterCheck: "/api/dsh-novel-forge/chapter/check",
			/** 保存手动编辑的正文（自动备份 .bak）。 */
			chapterSave: "/api/dsh-novel-forge/chapter/save",
			assistant: "/api/dsh-novel-forge/assistant",
			assistantHistory: "/api/dsh-novel-forge/assistant-history",
			/** 清空助手对话记录。 */
			assistantClear: "/api/dsh-novel-forge/assistant/clear",
			bookshelf: "/api/dsh-novel-forge/bookshelf",
			/** 重置项目（可选携带新大纲）：清空设定/卷/章节/伏笔/资产/事实库。 */
			reset: "/api/dsh-novel-forge/reset",
			/** 全书一致性质检：LLM 扫描已生成章节，输出矛盾问题清单。 */
			audit: "/api/dsh-novel-forge/audit",
			/** 角色卡刷新：基于事实库与各章摘要聚合角色当前状态。 */
			charactersRefresh: "/api/dsh-novel-forge/characters/refresh",
			/** 事实库回填：对历史已生成章节批量抽取事实（旧章节无事实记录时用）。 */
			factsBackfill: "/api/dsh-novel-forge/facts/backfill",
			/** 设定圣经局部修补（如世界观规则编辑）。 */
			biblePatch: "/api/dsh-novel-forge/bible/patch",
			/** 小说简介：生成（AI）/补全（AI）/保存。 */
			blurb: "/api/dsh-novel-forge/blurb",
			/** 重命名当前书（同步项目与书架条目）。 */
			rename: "/api/dsh-novel-forge/rename",
			/** 大世界：AI 提炼 / 保存结构化数据（境界/区域/势力）。 */
			world: "/api/dsh-novel-forge/world",
			/** 封面：GET 读取（dataUrl）/ POST 上传或移除。 */
			cover: "/api/dsh-novel-forge/blurb/cover",
			/** 剧情线管理：增删改 + 关联章节。 */
			plotlines: "/api/dsh-novel-forge/plotlines",
			/** 角色库：AI 提炼 / 采纳 / 更新 / 删除。 */
			roles: "/api/dsh-novel-forge/roles",
			/** 作者复盘补跑：对已写章节补齐 authorReview（全书流式 / 单章 JSON）。 */
			reviewBackfill: "/api/dsh-novel-forge/review/backfill",
			/** 章节复位：generating 卡死 → pending（可重新生成）。 */
			chapterReset: "/api/dsh-novel-forge/chapter/reset",
			/** 章节直接通过：作者对 rejected/written 章节行使最终决定权。 */
			chapterApprove: "/api/dsh-novel-forge/chapter/approve",
			/** 敏感词检查：全书已写章节或指定文本。 */
			sensitiveCheck: "/api/dsh-novel-forge/sensitive-check",
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
			/** 审查手动编辑的正文（不落盘）。 */
			async chapterCheck(no, text) {
				return postJson(NOVEL_API.chapterCheck, {
					chapterNo: no,
					text
				});
			}
			/** 保存手动编辑的正文（自动备份 .bak；带报告则沿用落盘，否则保存后自动审稿）。 */
			async chapterSave(no, text, report) {
				return postJson(NOVEL_API.chapterSave, {
					chapterNo: no,
					text,
					report
				});
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
			/** 新建书并激活（开书向导：可携带大纲文本，创建即建项目）。 */
			async bookCreate(bookName, outputDir, outline) {
				return postJson(NOVEL_API.bookshelf, {
					bookName,
					outputDir,
					outline
				});
			}
			/** 重置项目（清空进度；可携带新大纲）。 */
			async reset(outline) {
				return postJson(NOVEL_API.reset, { outline });
			}
			/** 全书一致性质检。 */
			async audit() {
				return postJson(NOVEL_API.audit, {});
			}
			/** 角色卡刷新（基于事实库聚合）。 */
			async charactersRefresh() {
				return postJson(NOVEL_API.charactersRefresh, {});
			}
			/** 事实库回填：对历史已生成章节批量抽取事实。 */
			async factsBackfill() {
				return postJson(NOVEL_API.factsBackfill, {});
			}
			/** 设定圣经局部修补。 */
			async biblePatch(patch) {
				return postJson(NOVEL_API.biblePatch, patch);
			}
			/** 剧情线管理：增删改 + 关联章节。 */
			async plotlines(req) {
				return postJson(NOVEL_API.plotlines, req);
			}
			/** 敏感词检查：指定章节 / 任意文本 / 全书。 */
			async sensitiveCheck(req) {
				return postJson(NOVEL_API.sensitiveCheck, req);
			}
			/** 作者复盘补跑：单章（JSON）。 */
			async reviewBackfillChapter(no) {
				return postJson(NOVEL_API.reviewBackfill, { chapterNo: no });
			}
			/** 作者复盘补跑：全书缺失章节（NDJSON 流）。 */
			async reviewBackfillAll(onFrame) {
				await this.streamJob(NOVEL_API.reviewBackfill, {}, onFrame);
			}
			/** 章节复位：generating 卡死 → pending。 */
			async chapterReset(no) {
				return postJson(NOVEL_API.chapterReset, { chapterNo: no });
			}
			/** 章节直接通过（作者行使最终决定权）。 */
			async chapterApprove(no) {
				return postJson(NOVEL_API.chapterApprove, { chapterNo: no });
			}
			/** 角色库：AI 提炼 / 采纳 / 更新 / 删除。 */
			async roles(req) {
				return postJson(NOVEL_API.roles, req);
			}
			/** 小说简介：AI 生成/补全（partial 留空 = 全量），或手动保存。 */
			async blurb(action, text, partial) {
				return postJson(NOVEL_API.blurb, {
					action,
					text,
					partial
				});
			}
			/** 封面：读取（dataUrl；dir 指定某本书的输出目录，省略为当前书）。 */
			async coverGet(dir) {
				const query = dir !== void 0 ? `?dir=${encodeURIComponent(dir)}` : "";
				return readJson(await fetch(NOVEL_API.cover + query));
			}
			/** 封面：上传（base64 data URL）或移除。 */
			async coverPost(action, dataUrl) {
				return postJson(NOVEL_API.cover, {
					action,
					dataUrl
				});
			}
			/** 重命名当前书（同步项目与书架条目）。 */
			async rename(bookName) {
				return postJson(NOVEL_API.rename, { bookName });
			}
			/** 大世界：AI 提炼（generate）或手动保存（save）。 */
			async world(action, world) {
				return postJson(NOVEL_API.world, {
					action,
					world
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
			/** 采纳待确认草稿（润色/重写产物），覆盖正文文件。 */
			async draftApply(chapterNo) {
				return postJson(NOVEL_API.draftApply, { chapterNo });
			}
			/** 放弃待确认草稿，保留原稿。 */
			async draftDiscard(chapterNo) {
				return postJson(NOVEL_API.draftDiscard, { chapterNo });
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
			/** 清空助手对话记录。 */
			async assistantClear() {
				return postJson(NOVEL_API.assistantClear, {});
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
			"entry.tooltip": "AI 编译小说工作台：总纲 → 道藏 → 卷计划 → 章节计划 → 逐章生成+审稿",
			"panel.title": "小说工坊",
			"common.close": "关闭",
			"common.loading": "加载中…",
			"common.save": "保存",
			"common.error": "错误",
			"common.success": "成功",
			"common.generating": "生成中…",
			"common.chars": "字",
			"tab.workflow": "工作台",
			"tab.overview": "总纲",
			"tab.plan": "章节",
			"tab.bible": "道藏",
			"tab.foreshadow": "暗线",
			"tab.assistant": "AI 助手",
			"tab.settings": "设置",
			"workflow.title": "创作工作台",
			"workflow.step1": "① 加载总纲",
			"workflow.step2": "② 提炼道藏",
			"workflow.step3": "③ 规划卷",
			"workflow.step4": "④ 生成章节计划",
			"workflow.step5": "⑤ 逐章写作 + AI 审稿",
			"workflow.step6": "⑥ 润色 / 导出",
			"workflow.loadOutline": "读取总纲",
			"workflow.genBible": "提炼道藏",
			"workflow.genVolumes": "生成卷计划",
			"workflow.genPlan": "生成章节计划",
			"workflow.done": "已完成",
			"workflow.todo": "待办",
			"workflow.bibleDone": "道藏已生成（{n} 条规则 / {c} 个人物 / {r} 条红线）",
			"workflow.volumesDone": "卷计划已生成（{n} 卷）",
			"workflow.planDone": "章节计划已生成（{n} 章）",
			"workflow.progress": "进度：总纲 ✓ · 道藏 {bible} · 卷 {volumes} · 计划 {plan} · 已完成 {done}/{total} 章",
			"overview.loadDocx": "从 docx 读取总纲",
			"overview.loadDocxDefault": "读取默认总纲",
			"overview.loadingOutline": "正在解析 docx…",
			"overview.outlineHint": "总纲文本（可编辑）",
			"overview.outlineChars": "总纲字数",
			"overview.saveOutline": "保存总纲",
			"overview.saved": "总纲已保存",
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
			"bible.title": "道藏",
			"bible.gen": "AI 提炼道藏",
			"bible.genre": "题材基调",
			"bible.worldRules": "世界规则",
			"bible.characters": "人物志",
			"bible.redLines": "写作红线",
			"bible.style": "风格要求",
			"bible.none": "尚未生成道藏。生成后写作会严格遵守人设与金手指规则，审稿也会按红线检查。",
			"foreshadow.title": "暗线管理",
			"foreshadow.suggest": "AI 建议暗线",
			"foreshadow.none": "暂无暗线",
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
			"tab.facts": "编年录",
			"tab.plotlines": "剧情线",
			"plotlines.hint": "主线/支线/人物线/悬念线的推进管理：章节生成时会注入未完结的线，要求每章至少推进一条；关联章节记录推进节点。",
			"plotlines.empty": "还没有剧情线——长篇小说建议先建主线与几条支线。",
			"plotlines.new": "＋ 新建剧情线",
			"plotlines.name": "线名",
			"plotlines.kind": "类型",
			"plotlines.kindMain": "主线",
			"plotlines.kindBranch": "支线",
			"plotlines.kindCharacter": "人物线",
			"plotlines.kindMystery": "悬念线",
			"plotlines.goal": "目标/终点",
			"plotlines.progress": "当前进度",
			"plotlines.status": "状态",
			"plotlines.statusActive": "推进中",
			"plotlines.statusPaused": "暂停",
			"plotlines.statusResolved": "已完结",
			"plotlines.statusAbandoned": "已废弃",
			"plotlines.save": "保存",
			"plotlines.cancel": "取消",
			"plotlines.edit": "编辑",
			"plotlines.remove": "删除",
			"plotlines.linkChapter": "关联本章",
			"plotlines.chapters": "已关联",
			"plotlines.workflowTitle": "剧情线进度",
			"plotlines.workflowEmpty": "未建剧情线（去「剧情线」页创建）",
			"sensitive.title": "敏感词检查",
			"sensitive.scanAll": "🔞 全书敏感词检查",
			"sensitive.hint": "内置违禁词库硬匹配（政治/擦边/暴力/辱骂/广告/其他），发布前建议检查；只做提示，是否修改由你判断。",
			"sensitive.clean": "✅ 未命中任何违禁词（扫描 {n} 章）",
			"sensitive.hits": "命中 {n} 处（{chapters} 章受影响）",
			"sensitive.goFix": "去修订",
			"sensitive.fixPrefill": "请删除或替换正文中的违禁表达「{word}」（类别：{category}），用含蓄/间接的写法替代。",
			"facts.title": "编年录 / 时间线（{n} 条）",
			"facts.hint": "每章生成后自动抽取「已确立事实」（人物状态/境界资源/关系变化/伏笔落地），最近 20 条注入后续章节生成，保证长期一致。",
			"facts.backfill": "回填历史章节事实",
			"facts.backfilled": "已从历史章节回填 {n} 条事实",
			"settings.title": "设置",
			"settings.outlinePath": "默认大纲路径",
			"settings.outputDir": "输出目录",
			"settings.provider": "模型提供商",
			"settings.model": "模型",
			"settings.theme": "主题",
			"settings.themeLiquid": "iOS 液态玻璃（绿）",
			"settings.themeClassic": "经典毛玻璃（蓝）",
			"settings.themeNeumorph": "新拟物（双阴影）",
			"settings.themeHint": "存于浏览器本地，即时生效",
			"settings.chapterChars": "每章目标字数",
			"settings.maxTokens": "单章最大输出 tokens",
			"settings.reviewPassScore": "审稿通过分数（0-100）",
			"settings.editorFontSize": "编辑器字号（仅编辑页显示）",
			"settings.editorFontSizeHint": "存于浏览器本地，不影响其他设备",
			"settings.autoReview": "生成后自动审稿",
			"settings.autoAuthorReview": "生成后自动作者复盘",
			"settings.autoAuthorReviewHint": "复盘钩子兑现/结尾钩子/剧情线推进/连续性/节奏趋势，每章约 2000 token",
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
			"assistant.hint": "和 AI 编辑讨论剧情、人设、暗线；达成一致后可让它直接修改总纲、道藏、章节内容。",
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
			"tab.workflow": "Workbench",
			"tab.overview": "Outline",
			"tab.plan": "Chapters",
			"tab.bible": "Bible",
			"tab.foreshadow": "Foreshadow",
			"tab.settings": "Settings",
			"workflow.title": "Writing workbench",
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
			"settings.theme": "Theme",
			"settings.themeLiquid": "iOS Liquid Glass (green)",
			"settings.themeClassic": "Classic frosted (blue)",
			"settings.themeNeumorph": "Neumorphism (dual-shadow)",
			"settings.themeHint": "Stored in browser localStorage; applies instantly",
			"settings.chapterChars": "Chars per chapter",
			"settings.maxTokens": "Max output tokens",
			"settings.reviewPassScore": "Review pass score (0-100)",
			"settings.editorFontSize": "Editor font size (workspace only)",
			"settings.editorFontSizeHint": "Stored in browser localStorage; display-only",
			"settings.autoReview": "Auto-review after writing",
			"settings.autoAuthorReview": "Auto author review after writing",
			"settings.autoAuthorReviewHint": "Reviews hook payoff / ending hook / plotline progress / continuity / pacing trend (~2000 tokens per chapter)",
			"settings.save": "Save settings",
			"settings.saved": "Settings saved",
			"settings.openFolder": "Open output folder",
			"settings.export": "Export",
			"settings.exportTxt": "Export TXT",
			"settings.exportMd": "Export Markdown",
			"settings.exported": "Exported: {file} ({chars} chars, {chapters} chapters)",
			"tab.facts": "Chronicle",
			"tab.plotlines": "Plotlines",
			"plotlines.hint": "Track main/branch/character/mystery arcs: unfinished arcs are injected into chapter writing so each chapter advances at least one; linked chapters record progress nodes.",
			"plotlines.empty": "No plotlines yet — consider creating the main arc and a few branches.",
			"plotlines.new": "+ New plotline",
			"plotlines.name": "Name",
			"plotlines.kind": "Type",
			"plotlines.kindMain": "Main",
			"plotlines.kindBranch": "Branch",
			"plotlines.kindCharacter": "Character",
			"plotlines.kindMystery": "Mystery",
			"plotlines.goal": "Goal",
			"plotlines.progress": "Current progress",
			"plotlines.status": "Status",
			"plotlines.statusActive": "Active",
			"plotlines.statusPaused": "Paused",
			"plotlines.statusResolved": "Resolved",
			"plotlines.statusAbandoned": "Abandoned",
			"plotlines.save": "Save",
			"plotlines.cancel": "Cancel",
			"plotlines.edit": "Edit",
			"plotlines.remove": "Remove",
			"plotlines.linkChapter": "Link chapter",
			"plotlines.chapters": "Linked",
			"plotlines.workflowTitle": "Plotline progress",
			"plotlines.workflowEmpty": "No plotlines yet (create them in the Plotlines tab)",
			"sensitive.title": "Sensitive-word check",
			"sensitive.scanAll": "🔞 Scan all chapters",
			"sensitive.hint": "Built-in banned-word library (politics/erotica/violence/abuse/ads/other). Run before publishing; suggestions only.",
			"sensitive.clean": "✅ No banned words found ({n} chapters scanned)",
			"sensitive.hits": "{n} hits across {chapters} chapters",
			"sensitive.goFix": "Fix",
			"sensitive.fixPrefill": "Remove or rephrase the banned expression \"{word}\" (category: {category}) with an indirect alternative.",
			"facts.title": "Chronicle / timeline ({n} facts)",
			"facts.hint": "Auto-extracted established facts per chapter (state/resources/relations/foreshadow landings); the latest 20 are injected into later chapters for consistency.",
			"facts.backfill": "Backfill facts from historical chapters",
			"facts.backfilled": "Backfilled {n} facts from historical chapters",
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
		/** 角色定位中文名（角色库/提炼候选共用，收敛自多份复制）。 */
		const ROLE_LABELS = {
			protagonist: "主角",
			female_lead: "女主",
			female_support: "女配",
			support: "配角",
			antagonist: "反派",
			extra: "路人"
		};
		/** 角色定位徽章颜色。 */
		function roleColor(label) {
			if (label === "protagonist") return "var(--nf-success)";
			if (label === "female_lead") return "var(--nf-accent)";
			if (label === "antagonist") return "var(--nf-error)";
			return "var(--nf-text-3)";
		}
		/** 剧情线类型中文名（与 locale 对齐）。 */
		function kindLabel(kind) {
			switch (kind) {
				case "main": return tt("plotlines.kindMain");
				case "branch": return tt("plotlines.kindBranch");
				case "character": return tt("plotlines.kindCharacter");
				case "mystery": return tt("plotlines.kindMystery");
				default: return kind;
			}
		}
		/** 剧情线状态中文名。 */
		function plotlineStatusLabel(status) {
			switch (status) {
				case "active": return tt("plotlines.statusActive");
				case "paused": return tt("plotlines.statusPaused");
				case "resolved": return tt("plotlines.statusResolved");
				case "abandoned": return tt("plotlines.statusAbandoned");
				default: return status;
			}
		}
		/** 剧情线状态颜色。 */
		function plotlineStatusColor(status) {
			if (status === "resolved") return "var(--nf-success)";
			if (status === "abandoned") return "var(--nf-text-3)";
			if (status === "paused") return "var(--nf-warn)";
			return "var(--nf-accent)";
		}
		//#endregion
		//#region \0dsh-css:<用户目录>\Desktop\111\novel-forge\src\client\panel\panel.module.css.mjs
		const css = ".CUIYUW_entry{width:100%;color:var(--dsw-alias-label-primary,#1f1f23);cursor:pointer;text-align:left;background:0 0;border:none;border-radius:6px;align-items:center;gap:8px;padding:8px 12px;font-size:13px;transition:background .15s;display:flex}body[data-ds-dark-theme] .CUIYUW_entry{color:var(--dsw-alias-label-primary,#ececf1)}.CUIYUW_entry:hover{background:var(--dsw-alias-interactive-bg-hover,#7f7f7f1f)}.CUIYUW_entry[data-active]{background:var(--dsw-alias-interactive-bg-active,#7f7f7f33)}.CUIYUW_entryIcon{flex-shrink:0;justify-content:center;align-items:center;display:inline-flex}.CUIYUW_entryLabel{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}[data-pane=conversation]{position:relative}.CUIYUW_view{z-index:60;color-scheme:light;--nf-font:-apple-system, BlinkMacSystemFont, \"SF Pro Display\", \"SF Pro Text\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", \"Segoe UI\", Roboto, \"Helvetica Neue\", sans-serif;--nf-font-mono:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;--nf-bg:#f2f2f7db;--nf-bg-raise:#ffffffb8;--nf-bg-inset:#7676801f;--nf-border:#3c3c4329;--nf-border-strong:#3c3c4352;--nf-text:#1c1c1e;--nf-text-2:#3c3c43;--nf-text-2-alpha:#3c3c43ad;--nf-text-3:#8e8e93;--nf-accent:#00b85c;--nf-accent-hover:#00a04e;--nf-accent-soft:#00b85c1f;--nf-accent-fg:#fff;--nf-hover:#0000000d;--nf-success:#34c759;--nf-error:#ff3b30;--nf-warn:#ff9500;--nf-info:#00b85c;--nf-shadow:0 1px 3px #0000000f, 0 12px 32px #00000014;--nf-shadow-lg:0 4px 12px #00000012, 0 20px 48px #0000001f;--nf-card-shadow:0 2px 6px #0000000f, 0 14px 38px #00000024;--nf-card-shadow-hover:0 4px 10px #00000014, 0 22px 52px #0003;--nf-glass-face:linear-gradient(180deg, #f6f7f9 0%, #f0f2f5 26%, #e9ebef 52%, #e0e3e8 78%, #d6d9df 100%);--nf-glass-core:radial-gradient(30% 24% at 36% 28%, #ffffff80 0%, #ffffff38 45%, #fff0 78%);--nf-glass-sheen:#ffffff8c;--nf-glass-border:#ffffffa6;--nf-glass-inset:#ffffff8c;--nf-glass-orb-a:#00b85c24;--nf-glass-orb-b:#78a0ff1a;--nf-glass-noise:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\");background:var(--nf-bg);backdrop-filter:blur(32px)saturate(180%);color:var(--nf-text);font-family:-apple-system,BlinkMacSystemFont,SF Pro Display,SF Pro Text,PingFang SC,Hiragino Sans GB,Microsoft YaHei,Segoe UI,Roboto,Helvetica Neue,sans-serif;display:none;position:absolute;inset:0;overflow:auto}body[data-ds-dark-theme] .CUIYUW_view{color-scheme:dark;--nf-bg:#0a0b0ddb;--nf-bg-raise:#1c1c1ec7;--nf-bg-inset:#7676802e;--nf-border:#ffffff1f;--nf-border-strong:#ffffff47;--nf-text:#f2f2f7;--nf-text-2:#d1d1d6;--nf-text-2-alpha:#d1d1d6b8;--nf-text-3:#8e8e93;--nf-accent:#35d07a;--nf-accent-hover:#5ce695;--nf-accent-soft:#35d07a33;--nf-accent-fg:#062b18;--nf-hover:#ffffff17;--nf-success:#30d158;--nf-error:#ff453a;--nf-warn:#ff9f0a;--nf-info:#35d07a;--nf-shadow:0 1px 2px #00000059, 0 10px 30px #0006;--nf-shadow-lg:0 4px 12px #0006, 0 20px 48px #0000008c;--nf-card-shadow:0 2px 6px #00000059, 0 14px 38px #00000073;--nf-card-shadow-hover:0 4px 10px #0006, 0 22px 52px #0000008c;--nf-glass-face:linear-gradient(180deg, #70747a6b 0%, #60646a6b 26%, #52555a6b 52%, #44474c6b 78%, #383a3f6b 100%);--nf-glass-core:radial-gradient(30% 24% at 36% 28%, #ffffff42 0%, #ffffff1a 45%, #fff0 78%);--nf-glass-sheen:#ffffff42;--nf-glass-border:#ffffff24;--nf-glass-inset:#ffffff12;--nf-glass-orb-a:#00ca5233;--nf-glass-orb-b:#bec8d712;--nf-glass-noise:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E\")}html[data-dsh-novelforge-active]:not([data-dsh-taskboard-active]):not([data-dsh-ssh-active]) .CUIYUW_view{display:block}.CUIYUW_panel[data-nf-theme=classic]{--nf-accent:#007aff;--nf-accent-hover:#0071e3;--nf-accent-soft:#007aff1f;--nf-accent-fg:#fff;--nf-info:#5856d6;--nf-glass-face:var(--nf-bg-raise);--nf-glass-core:transparent;--nf-glass-sheen:#fff0;--nf-glass-border:var(--nf-border);--nf-glass-inset:var(--nf-bg-inset);--nf-glass-orb-a:transparent;--nf-glass-orb-b:transparent;--nf-glass-noise:none}body[data-ds-dark-theme] .CUIYUW_panel[data-nf-theme=classic]{--nf-accent:#0a84ff;--nf-accent-hover:#3a9bff;--nf-accent-soft:#0a84ff33;--nf-accent-fg:#fff;--nf-info:#bf5af2;--nf-glass-face:var(--nf-bg-raise);--nf-glass-core:transparent;--nf-glass-sheen:#fff0;--nf-glass-border:var(--nf-border);--nf-glass-inset:var(--nf-bg-inset);--nf-glass-orb-a:transparent;--nf-glass-orb-b:transparent;--nf-glass-noise:none}body:not([data-ds-dark-theme]) .CUIYUW_panel[data-nf-theme=neumorph]{--nf-bg:#e4e9f2;--nf-bg-raise:#e4e9f2;--nf-bg-inset:#d9dfe8;--nf-border:#8c9baf59;--nf-border-strong:#78879e80;--nf-text:#3a4250;--nf-text-2:#5b6472;--nf-text-2-alpha:#465060b3;--nf-text-3:#8b94a3;--nf-hover:#5a697d14;--nf-shadow:4px 4px 10px #a3b1c68c, -4px -4px 10px #ffffffd9;--nf-shadow-lg:6px 6px 14px #a3b1c699, -6px -6px 14px #ffffffe6;--nf-card-shadow:9px 9px 18px #a3b1c68c, -9px -9px 18px #ffffffd9;--nf-card-shadow-hover:12px 12px 24px #a3b1c6a6, -12px -12px 24px #fffffff2;--nf-glass-face:#e4e9f2;--nf-glass-core:transparent;--nf-glass-sheen:#fff0;--nf-glass-border:#a3b1c666;--nf-glass-inset:#d9dfe8;--nf-glass-orb-a:transparent;--nf-glass-orb-b:transparent;--nf-glass-noise:none}body[data-ds-dark-theme] .CUIYUW_panel[data-nf-theme=neumorph]{--nf-bg:#2b2f36;--nf-bg-raise:#2b2f36;--nf-bg-inset:#25292f;--nf-border:#0a0c1080;--nf-border-strong:#080a0e99;--nf-text:#d6dae1;--nf-text-2:#a8aeb8;--nf-text-2-alpha:#a8aeb8b3;--nf-text-3:#757c88;--nf-hover:#ffffff0d;--nf-shadow:4px 4px 10px #00000080, -4px -4px 10px #6068763d;--nf-shadow-lg:6px 6px 14px #0000008c, -6px -6px 14px #60687642;--nf-card-shadow:9px 9px 18px #00000080, -9px -9px 18px #6068763d;--nf-card-shadow-hover:12px 12px 24px #0009, -12px -12px 24px #60687647;--nf-glass-face:#2b2f36;--nf-glass-core:transparent;--nf-glass-sheen:#fff0;--nf-glass-border:#0c0e1273;--nf-glass-inset:#25292f;--nf-glass-orb-a:transparent;--nf-glass-orb-b:transparent;--nf-glass-noise:none}body:not([data-ds-dark-theme]) .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_input,body:not([data-ds-dark-theme]) .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_textarea{background:var(--nf-bg-inset);border-color:#0000;box-shadow:inset 3px 3px 7px #a3b1c68c,inset -3px -3px 7px #ffffffe6}body:not([data-ds-dark-theme]) .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_input:focus,body:not([data-ds-dark-theme]) .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_textarea:focus{border-color:var(--nf-accent);box-shadow:inset 2px 2px 6px #a3b1c680, inset -2px -2px 6px #ffffffd9, 0 0 0 3px var(--nf-accent-soft)}body[data-ds-dark-theme] .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_input,body[data-ds-dark-theme] .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_textarea{background:var(--nf-bg-inset);border-color:#0000;box-shadow:inset 3px 3px 7px #0000008c,inset -3px -3px 7px #6068763d}body[data-ds-dark-theme] .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_input:focus,body[data-ds-dark-theme] .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_textarea:focus{border-color:var(--nf-accent);box-shadow:inset 2px 2px 6px #00000080, inset -2px -2px 6px #60687638, 0 0 0 3px var(--nf-accent-soft)}body:not([data-ds-dark-theme]) .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_button{background:var(--nf-bg-raise);border-color:#0000;box-shadow:5px 5px 10px #a3b1c68c,-5px -5px 10px #ffffffe6}body:not([data-ds-dark-theme]) .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_button:hover:not([disabled]){background:var(--nf-bg-raise);border-color:#0000;box-shadow:7px 7px 14px #a3b1c699,-7px -7px 14px #fffffff2}body:not([data-ds-dark-theme]) .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_button:active:not([disabled]){box-shadow:inset 3px 3px 7px #a3b1c68c,inset -3px -3px 7px #ffffffe6}body:not([data-ds-dark-theme]) .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_buttonPrimary{background:linear-gradient(#00c563,#00a952);box-shadow:5px 5px 10px #a3b1c699,-5px -5px 10px #ffffffd9}body[data-ds-dark-theme] .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_button{background:var(--nf-bg-raise);border-color:#0000;box-shadow:5px 5px 10px #00000080,-5px -5px 10px #6068763d}body[data-ds-dark-theme] .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_button:hover:not([disabled]){background:var(--nf-bg-raise);border-color:#0000;box-shadow:7px 7px 14px #0000008c,-7px -7px 14px #60687642}body[data-ds-dark-theme] .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_button:active:not([disabled]){box-shadow:inset 3px 3px 7px #0000008c,inset -3px -3px 7px #6068763d}body[data-ds-dark-theme] .CUIYUW_panel[data-nf-theme=neumorph] .CUIYUW_buttonPrimary{background:linear-gradient(#3ddc86,#27b96a);box-shadow:5px 5px 10px #00000080,-5px -5px 10px #6068763d}.CUIYUW_panel{flex-direction:column;min-width:0;height:100%;font-size:14px;line-height:1.6;display:flex;position:relative;overflow:hidden}.CUIYUW_panel:before{content:\"\";z-index:0;pointer-events:none;background:radial-gradient(46% 36% at 18% 12%, var(--nf-glass-orb-a), transparent 70%), radial-gradient(52% 42% at 88% 22%, var(--nf-glass-orb-b), transparent 72%), radial-gradient(120% 95% at 50% 42%, transparent 55%, #0202031a 100%);position:absolute;inset:0}.CUIYUW_panelHeader{border:1px solid var(--nf-glass-border);background:var(--nf-glass-face);box-shadow:var(--nf-shadow), inset 0 1px 0 var(--nf-glass-sheen);backdrop-filter:blur(28px)saturate(175%);z-index:5;border-radius:18px;flex-shrink:0;justify-content:space-between;align-items:center;margin:10px 12px 0;padding:10px 16px;display:flex;position:sticky;top:10px}.CUIYUW_panelTitle{letter-spacing:.2px;align-items:center;gap:8px;margin:0;font-size:16px;font-weight:700;display:flex}.CUIYUW_panelTitle:before{content:\"\";background:linear-gradient(180deg, var(--nf-accent), var(--nf-info));border-radius:2px;width:4px;height:16px}.CUIYUW_iconButton{cursor:pointer;color:var(--nf-text-2);background:0 0;border:none;border-radius:8px;padding:4px 9px;font-size:16px;transition:background .15s,color .15s}.CUIYUW_iconButton:hover{background:var(--nf-hover);color:var(--nf-text)}.CUIYUW_tabBar{border-bottom:1px solid var(--nf-border);background:var(--nf-bg-raise);z-index:4;flex-shrink:0;gap:2px;padding:8px 14px 0;display:flex;position:sticky;top:45px}.CUIYUW_tab{cursor:pointer;color:var(--nf-text-2);background:0 0;border:none;border-radius:8px 8px 0 0;padding:7px 13px;font-size:13.5px;font-weight:500;transition:color .15s,background .15s;position:relative}.CUIYUW_tab:hover{color:var(--nf-text);background:var(--nf-hover)}.CUIYUW_tab[data-active]{color:var(--nf-accent);font-weight:600}.CUIYUW_tab[data-active]:after{content:\"\";background:var(--nf-accent);border-radius:2px 2px 0 0;height:2.5px;position:absolute;bottom:-1px;left:10px;right:10px}.CUIYUW_panelContent{z-index:1;flex-direction:column;flex:1;gap:14px;padding:16px 18px 20px;display:flex;position:relative;overflow:auto}.CUIYUW_panelBody{z-index:1;flex:1;min-height:0;display:flex;position:relative}.CUIYUW_panelNav{border:1px solid var(--nf-glass-border);background:var(--nf-glass-face);width:142px;box-shadow:var(--nf-shadow), inset 0 1px 0 var(--nf-glass-sheen);backdrop-filter:blur(28px)saturate(175%);border-radius:16px;flex-direction:column;flex:none;align-self:flex-start;gap:4px;margin:10px 0 10px 12px;padding:10px 8px;transition:width .18s;display:flex;overflow-y:auto}.CUIYUW_panelNavCollapsed{width:52px;padding:10px 6px}.CUIYUW_navGroup{flex-direction:column;gap:4px;display:flex}.CUIYUW_navGroupLabel{letter-spacing:.6px;text-transform:uppercase;color:var(--nf-text-3);user-select:none;padding:8px 10px 3px;font-size:10.5px;font-weight:600}.CUIYUW_navGroupSep{background:var(--nf-border);height:1px;margin:6px 8px 4px}.CUIYUW_navSpacer{flex:1;min-height:8px}.CUIYUW_navAbout{border-top:1px solid var(--nf-border);flex-direction:column;flex:none;gap:4px;margin-top:4px;padding:8px 6px 4px;display:flex}.CUIYUW_navAboutRow{cursor:pointer;color:var(--nf-text-3);text-align:left;white-space:nowrap;background:0 0;border:none;border-radius:8px;justify-content:space-between;align-items:center;gap:4px;padding:4px 6px;font-size:11px;transition:color .15s,background .15s;display:flex}.CUIYUW_navAboutRow:hover{color:var(--nf-text);background:var(--nf-hover)}.CUIYUW_navAboutUpdate{background:var(--nf-accent-soft);color:var(--nf-accent);cursor:pointer;text-align:left;white-space:nowrap;border:none;border-radius:8px;padding:4px 6px;font-size:10.5px;font-weight:600}.CUIYUW_navAboutUpdate:hover{color:var(--nf-accent-hover)}.CUIYUW_panelNavCollapsed .CUIYUW_navAbout{align-items:center;padding:6px 2px 2px}.CUIYUW_panelNavCollapsed .CUIYUW_navAboutRow{justify-content:center;width:100%;padding:4px 0}.CUIYUW_navTabBadge{background:var(--nf-accent);color:#fff;text-align:center;border-radius:999px;flex:none;min-width:18px;height:18px;margin-left:auto;padding:0 5px;font-size:10.5px;font-weight:700;line-height:18px;display:inline-block}.CUIYUW_panelNavCollapsed .CUIYUW_navTabBadge{min-width:14px;height:14px;padding:0 3px;font-size:9px;line-height:14px;position:absolute;top:2px;right:2px}.CUIYUW_navTabBadgeDanger{background:var(--nf-error)}.CUIYUW_navTabBadgeWarn{background:var(--nf-warn)}.CUIYUW_navTabBadgeDone{background:var(--nf-success)}.CUIYUW_navTab{cursor:pointer;width:100%;color:var(--nf-text-2-alpha,var(--nf-text-2));text-align:left;white-space:nowrap;background:0 0;border:none;border-radius:12px;align-items:center;gap:8px;padding:8px 10px;font-size:13px;font-weight:500;transition:color .15s,background .15s;display:flex;position:relative}.CUIYUW_panelNavCollapsed .CUIYUW_navTab{justify-content:center;padding:8px 0}.CUIYUW_navTab:hover{color:var(--nf-text);background:var(--nf-hover)}.CUIYUW_navTab[data-active]{color:var(--nf-accent);background:var(--nf-accent-soft);font-weight:600}.CUIYUW_navTab[data-active]:before{content:\"\";background:var(--nf-accent);border-radius:999px;width:3px;position:absolute;top:20%;bottom:20%;left:-8px}.CUIYUW_panelNavCollapsed .CUIYUW_navTab[data-active]:before{left:-6px}.CUIYUW_navTabIcon{flex:none;font-size:15px;line-height:1}.CUIYUW_navTabLabel{text-overflow:ellipsis;overflow:hidden}.CUIYUW_panelSubtitle{color:var(--nf-text-2);white-space:nowrap;flex-wrap:wrap;align-items:center;gap:8px;min-width:0;padding:0 4px 2px;font-size:12px;display:flex}.CUIYUW_headerProgress{color:var(--nf-text-2);white-space:nowrap;align-items:center;gap:6px;margin-left:0;font-size:12px;font-weight:400;display:inline-flex}.CUIYUW_headerProgress b{color:var(--nf-accent);font-weight:700}.CUIYUW_headerProgressDot{background:var(--nf-border-strong,var(--nf-text-3));border-radius:50%;width:3px;height:3px;display:inline-block}.CUIYUW_card{border:1px solid var(--nf-glass-border);background:var(--nf-glass-face);box-shadow:var(--nf-card-shadow), inset 0 1.5px 0 var(--nf-glass-sheen), inset 0 -1px 0 #ffffff40;backdrop-filter:blur(30px)saturate(180%);border-radius:22px;flex-direction:column;gap:10px;padding:16px 18px;transition:transform .22s,box-shadow .22s;display:flex;position:relative}.CUIYUW_card:before{content:\"\";border-radius:inherit;pointer-events:none;background:var(--nf-glass-core), linear-gradient(90deg, transparent, var(--nf-glass-sheen), transparent) no-repeat 10% 0 / 80% 1px, linear-gradient(156deg, #ffffff42 0%, #fff0 55%);z-index:0;position:absolute;inset:0}.CUIYUW_card:after{content:\"\";border-radius:inherit;pointer-events:none;background:var(--nf-glass-noise);opacity:.06;z-index:0;position:absolute;inset:0}.CUIYUW_card:hover{box-shadow:var(--nf-card-shadow-hover), inset 0 1.5px 0 var(--nf-glass-sheen), inset 0 -1px 0 #ffffff40;transform:translateY(-3px)}.CUIYUW_card>*{z-index:1;position:relative}.CUIYUW_cardTitle{color:var(--nf-text);align-items:center;gap:8px;margin:0;font-size:14px;font-weight:650;display:flex}.CUIYUW_button{border:1px solid var(--nf-border-strong);background:var(--nf-bg-inset);color:var(--nf-text);cursor:pointer;white-space:nowrap;border-radius:12px;padding:6px 14px;font-size:13px;font-weight:500;transition:background .15s,border-color .15s,transform .1s,box-shadow .15s}.CUIYUW_button:hover:not([disabled]){background:var(--nf-hover);border-color:var(--nf-border-strong)}.CUIYUW_button:active:not([disabled]){transform:scale(.96)}.CUIYUW_button[disabled]{opacity:.45;cursor:not-allowed}.CUIYUW_buttonPrimary{background:linear-gradient(180deg, color-mix(in srgb, var(--nf-accent) 88%, #fff), var(--nf-accent));color:var(--nf-accent-fg);box-shadow:0 2px 10px color-mix(in srgb, var(--nf-accent) 45%, transparent), 0 0 0 .5px color-mix(in srgb, var(--nf-accent) 30%, transparent);border-color:#0000}.CUIYUW_buttonPrimary:hover:not([disabled]){background:linear-gradient(180deg, var(--nf-accent-hover), color-mix(in srgb, var(--nf-accent-hover) 85%, #000));border-color:#0000}.CUIYUW_buttonDanger{border-color:var(--nf-error);color:var(--nf-error)}.CUIYUW_buttonDanger:hover:not([disabled]){background:#ff3b301a}.CUIYUW_buttonSmall{border-radius:9px;padding:3px 10px;font-size:12px}.CUIYUW_field{flex-direction:column;gap:5px;display:flex}.CUIYUW_fieldLabel{color:var(--nf-text-2);font-size:12px;font-weight:500}.CUIYUW_input{border:1px solid var(--nf-border-strong);background:var(--nf-bg-inset);color:var(--nf-text);box-sizing:border-box;border-radius:12px;width:100%;padding:7px 11px;font-size:13px;transition:border-color .15s,box-shadow .15s}.CUIYUW_input:focus,.CUIYUW_textarea:focus{border-color:var(--nf-accent);box-shadow:0 0 0 3px var(--nf-accent-soft);outline:none}.CUIYUW_input::placeholder,.CUIYUW_textarea::placeholder{color:var(--nf-text-3)}.CUIYUW_textarea{border:1px solid var(--nf-border-strong);background:var(--nf-bg-inset);color:var(--nf-text);box-sizing:border-box;resize:vertical;border-radius:12px;width:100%;min-height:200px;padding:9px 11px;font-family:inherit;font-size:13px;line-height:1.7;transition:border-color .15s,box-shadow .15s}.CUIYUW_row{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.CUIYUW_spaceBetween{justify-content:space-between}.CUIYUW_chapterList{flex-direction:column;gap:8px;display:flex}.CUIYUW_volumeGroup{flex-direction:column;gap:6px;display:flex}.CUIYUW_volumeGroupHeader{background:var(--nf-bg-inset);border:1px solid var(--nf-border);cursor:pointer;user-select:none;border-radius:10px;align-items:center;gap:8px;padding:6px 10px;font-size:13px;transition:border-color .15s;display:flex}.CUIYUW_volumeGroupHeader:hover{border-color:var(--nf-accent)}.CUIYUW_volumeGroupToggle{color:var(--nf-text-2);flex:none;font-size:11px}.CUIYUW_chapter{border:1px solid var(--nf-border);background:var(--nf-bg);border-radius:10px;align-items:center;gap:10px;padding:9px 12px;transition:border-color .15s,box-shadow .15s,transform .1s;display:flex}.CUIYUW_chapter:hover{border-color:var(--nf-border-strong);box-shadow:var(--nf-shadow)}.CUIYUW_chapterNum{background:var(--nf-bg-inset);border:1px solid var(--nf-border);min-width:28px;height:28px;color:var(--nf-text-2);border-radius:8px;flex-shrink:0;justify-content:center;align-items:center;padding:0 8px;font-size:12px;font-weight:700;display:inline-flex}.CUIYUW_chapterMain{flex:1;min-width:0}.CUIYUW_chapterTitle{color:var(--nf-text);align-items:center;gap:8px;font-size:13px;font-weight:600;display:flex}.CUIYUW_chapterBeats{color:var(--nf-text-2);opacity:.85;text-overflow:ellipsis;white-space:nowrap;font-size:12px;overflow:hidden}.CUIYUW_chapterActions{opacity:.85;flex-shrink:0;gap:4px;transition:opacity .15s;display:flex}.CUIYUW_chapter:hover .CUIYUW_chapterActions{opacity:1}.CUIYUW_badge{white-space:nowrap;letter-spacing:.2px;border:1px solid;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:600}.CUIYUW_badgePending{color:var(--nf-info);border-color:var(--nf-info);background:color-mix(in srgb, var(--nf-info) 10%, transparent)}.CUIYUW_badgeGenerating{color:var(--nf-accent);border-color:var(--nf-accent);background:color-mix(in srgb, var(--nf-accent) 12%, transparent);animation:1.2s ease-in-out infinite CUIYUW_pulse}.CUIYUW_badgeWritten{color:var(--nf-warn);border-color:var(--nf-warn);background:color-mix(in srgb, var(--nf-warn) 10%, transparent)}.CUIYUW_badgeRejected{color:var(--nf-error);border-color:var(--nf-error);background:color-mix(in srgb, var(--nf-error) 10%, transparent)}.CUIYUW_badgeDone{color:var(--nf-success);border-color:var(--nf-success);background:color-mix(in srgb, var(--nf-success) 10%, transparent)}.CUIYUW_badgeError{color:var(--nf-error);border-color:var(--nf-error);background:color-mix(in srgb, var(--nf-error) 10%, transparent)}.CUIYUW_reviewBox{border:1px solid var(--nf-border);background:var(--nf-bg-inset);border-radius:10px;flex-direction:column;gap:6px;padding:10px 12px;font-size:12.5px;display:flex}.CUIYUW_chapterPreview{white-space:pre-wrap;word-break:break-all;max-height:320px;color:var(--nf-text);background:var(--nf-bg-inset);border:1px solid var(--nf-border);border-radius:10px;margin:0;padding:10px 12px;font-family:inherit;font-size:12.5px;line-height:1.8;overflow:auto}.CUIYUW_chatScroll{border:1px solid var(--nf-border);background:var(--nf-bg-inset);border-radius:12px;flex-direction:column;flex:1;gap:10px;min-height:240px;max-height:480px;padding:14px;display:flex;overflow-y:auto}.CUIYUW_chatBubbleUser{background:linear-gradient(180deg, var(--nf-accent), var(--nf-accent-hover));max-width:90%;color:var(--nf-accent-fg);border-radius:14px 14px 4px;align-self:flex-end;padding:9px 14px;font-size:13px;box-shadow:0 2px 6px #4d6bfe33}.CUIYUW_chatBubbleAssistant{background:var(--nf-bg-raise);max-width:92%;color:var(--nf-text);border:1px solid var(--nf-border);box-shadow:var(--nf-shadow);border-radius:14px 14px 14px 4px;align-self:flex-start;padding:9px 14px;font-size:13px}.CUIYUW_chatRole{color:var(--nf-text-3);margin-bottom:3px;font-size:11px;font-weight:600}.CUIYUW_toolLive{background:var(--nf-bg-inset);border:1px dashed var(--nf-border-strong);white-space:pre-wrap;word-break:break-all;color:var(--nf-text-2);border-radius:8px;max-height:180px;margin-top:6px;padding:8px 10px;font-size:12px;line-height:1.7;overflow-y:auto}.CUIYUW_assistantStatus{color:var(--nf-text-2);background:var(--nf-bg-inset);border:1px solid var(--nf-border);border-radius:999px;flex:none;align-items:center;gap:6px;margin-top:6px;padding:6px 12px;font-size:12px;display:flex}.CUIYUW_assistantStatusBusy{color:var(--nf-accent);border-color:var(--nf-accent);background:var(--nf-accent-soft);font-weight:600}.CUIYUW_toolSteps{flex-direction:column;gap:4px;margin-top:6px;display:flex}.CUIYUW_toolStep{background:var(--nf-bg-inset);border:1px solid var(--nf-border);border-radius:8px;align-items:center;gap:8px;padding:5px 10px;font-size:12px;display:flex}.CUIYUW_toolStepActive{border-color:var(--nf-accent);background:var(--nf-accent-soft)}.CUIYUW_toolStepError{border-color:var(--nf-error);background:color-mix(in srgb, var(--nf-error) 8%, transparent)}.CUIYUW_toolStepIcon{flex:none;font-size:13px}.CUIYUW_toolStepName{text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0;font-weight:600;overflow:hidden}.CUIYUW_toolStepStatus{color:var(--nf-text-2);flex:none;font-size:11px}.CUIYUW_toolStepActive .CUIYUW_toolStepStatus{color:var(--nf-accent)}.CUIYUW_toolStepError .CUIYUW_toolStepStatus{color:var(--nf-error)}.CUIYUW_toolStepDetail{width:100%;color:var(--nf-error);word-break:break-all;font-size:11px}.CUIYUW_progress{border:1px solid var(--nf-border);white-space:pre-wrap;word-break:break-all;min-height:60px;max-height:220px;color:var(--nf-text-2);font-size:12px;font-family:var(--nf-font-mono);background:var(--nf-bg-inset);border-radius:10px;padding:10px 14px;line-height:1.8;overflow:auto}.CUIYUW_progressLine{color:var(--nf-text-2);opacity:.9}.CUIYUW_progressLineLive{color:var(--nf-accent);align-items:center;gap:8px;font-weight:600;display:flex}.CUIYUW_progressBar{background:var(--nf-border);border-radius:999px;flex:none;width:110px;height:6px;display:inline-block;overflow:hidden}.CUIYUW_progressBarFill{background:var(--nf-accent);border-radius:3px;height:100%;transition:width .3s;display:block}.CUIYUW_busyRow{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;display:flex}.CUIYUW_liveText{font-variant-numeric:tabular-nums;color:var(--nf-text-2);font-size:12px}.CUIYUW_bigProgressBar{background:var(--nf-border);border-radius:999px;height:8px;margin-top:10px;overflow:hidden}.CUIYUW_bigProgressBarFill{background:linear-gradient(90deg, var(--nf-accent), var(--nf-accent-2,var(--nf-accent)));border-radius:999px;height:100%;transition:width .3s;display:block}.CUIYUW_diffLegend{flex-wrap:wrap;align-items:center;gap:14px;margin:6px 0 8px;font-size:12px;display:flex}.CUIYUW_legendOld{color:var(--nf-error);font-weight:700}.CUIYUW_legendNew{color:var(--nf-success);font-weight:700}.CUIYUW_onlyChanges{color:var(--nf-text-2);cursor:pointer;align-items:center;gap:4px;margin-left:auto;display:inline-flex}.CUIYUW_diffList{border:1px solid var(--nf-border);background:var(--nf-bg-inset);border-radius:8px;flex-direction:column;flex:1;gap:8px;min-height:0;padding:10px 12px;font-size:13px;line-height:1.7;display:flex;overflow-y:auto}.CUIYUW_diffSame{border:1px dashed var(--nf-border);color:var(--nf-text-2);opacity:.85;border-radius:6px;padding:6px 10px}.CUIYUW_diffSame summary{cursor:pointer;user-select:none;font-size:12px}.CUIYUW_diffSameBody{white-space:pre-wrap;margin-top:6px}.CUIYUW_diffChange{border:1px solid var(--nf-border);border-radius:8px;grid-template-columns:1fr 1fr;display:grid;overflow:hidden}.CUIYUW_diffColumn{flex-direction:column;gap:6px;min-width:0;padding:8px 10px;display:flex}.CUIYUW_diffColumn:first-child{border-right:1px solid var(--nf-border)}.CUIYUW_diffTagOld,.CUIYUW_diffTagNew{letter-spacing:.5px;border-radius:4px;flex:none;align-self:flex-start;padding:1px 7px;font-size:11px;font-weight:700}.CUIYUW_diffTagOld{color:var(--nf-error);background:color-mix(in srgb, var(--nf-error) 16%, transparent);border:1px solid color-mix(in srgb, var(--nf-error) 45%, transparent)}.CUIYUW_diffTagNew{color:var(--nf-success);background:color-mix(in srgb, var(--nf-success) 16%, transparent);border:1px solid color-mix(in srgb, var(--nf-success) 45%, transparent)}.CUIYUW_diffOld{color:var(--nf-error);white-space:pre-wrap;text-decoration:line-through;text-decoration-color:color-mix(in srgb, var(--nf-error) 55%, transparent)}.CUIYUW_diffNew{color:var(--nf-success);white-space:pre-wrap;font-weight:500}.CUIYUW_diffDel{border:1px solid color-mix(in srgb, var(--nf-error) 35%, transparent);background:color-mix(in srgb, var(--nf-error) 7%, transparent);border-radius:6px;flex-direction:column;gap:4px;padding:6px 10px;display:flex}.CUIYUW_diffAdd{border:1px solid color-mix(in srgb, var(--nf-success) 35%, transparent);background:color-mix(in srgb, var(--nf-success) 7%, transparent);border-radius:6px;flex-direction:column;gap:4px;padding:6px 10px;display:flex}.CUIYUW_diffText{white-space:pre-wrap}.CUIYUW_diffDel .CUIYUW_diffText{color:var(--nf-error);text-decoration:line-through;text-decoration-color:color-mix(in srgb, var(--nf-error) 50%, transparent)}.CUIYUW_diffAdd .CUIYUW_diffText{color:var(--nf-success)}.CUIYUW_wsPage{flex-direction:column;flex:1;gap:10px;min-height:0;display:flex}.CUIYUW_wsPageHeader{flex-wrap:wrap;flex:none;align-items:center;gap:8px;display:flex}.CUIYUW_wsColumns{flex:1;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;min-height:0;display:grid}.CUIYUW_wsColumn{flex-direction:column;gap:8px;min-width:0;min-height:0;display:flex}.CUIYUW_wsEditor{resize:vertical;min-height:0;font-family:var(--nf-font);white-space:pre-wrap;flex:1;font-size:13px;line-height:1.75}.CUIYUW_wsSelected{border:1px solid var(--nf-accent);background:color-mix(in srgb, var(--nf-accent) 8%, transparent);border-radius:6px;max-height:120px;padding:6px 10px;overflow:auto}.CUIYUW_wsSelectedText{color:var(--nf-text-2);white-space:pre-wrap;margin-top:4px;font-size:12px}.CUIYUW_wsPreview{border:1px solid var(--nf-border);background:var(--nf-bg-inset);border-radius:8px;flex-direction:column;gap:8px;padding:8px 10px;display:flex}.CUIYUW_wsPreviewText{white-space:pre-wrap;min-height:0;color:var(--nf-text);flex:1;margin:0;font-size:13px;line-height:1.7;overflow:auto}.CUIYUW_assetGrid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;display:grid}.CUIYUW_assetStat{border:1px solid var(--nf-glass-border);background:var(--nf-glass-inset);box-shadow:inset 0 1px 0 var(--nf-glass-sheen);border-radius:14px;flex-direction:column;gap:4px;padding:10px 12px;display:flex}.CUIYUW_assetStatLabel{color:var(--nf-text-2);opacity:.9;font-size:11px}.CUIYUW_assetStatValue{color:var(--nf-text);font-size:15px;font-weight:700;line-height:1.2}.CUIYUW_assetStatDetail{color:var(--nf-text-2);opacity:.85;text-overflow:ellipsis;white-space:nowrap;font-size:11px;overflow:hidden}.CUIYUW_dashHero{border:1px solid var(--nf-glass-border);background:var(--nf-glass-face);box-shadow:var(--nf-card-shadow), inset 0 1.5px 0 var(--nf-glass-sheen), inset 0 -1px 0 #ffffff40;backdrop-filter:blur(30px)saturate(180%);border-radius:22px;flex-direction:column;gap:14px;padding:18px 20px;transition:transform .22s,box-shadow .22s;display:flex;position:relative}.CUIYUW_dashHero:before{content:\"\";border-radius:inherit;pointer-events:none;background:radial-gradient(46% 40% at 92% -10%, color-mix(in srgb, var(--nf-accent) 13%, transparent), transparent 62%), var(--nf-glass-core), linear-gradient(90deg, transparent, var(--nf-glass-sheen), transparent) no-repeat 10% 0 / 80% 1px, linear-gradient(156deg, #ffffff42 0%, #fff0 55%);z-index:0;position:absolute;inset:0}.CUIYUW_dashHero:after{content:\"\";border-radius:inherit;pointer-events:none;background:var(--nf-glass-noise);opacity:.06;z-index:0;position:absolute;inset:0}.CUIYUW_dashHero:hover{box-shadow:var(--nf-card-shadow-hover), inset 0 1.5px 0 var(--nf-glass-sheen), inset 0 -1px 0 #ffffff40;transform:translateY(-3px)}.CUIYUW_dashHero>*{z-index:1;position:relative}.CUIYUW_dashHeroEyebrow{color:var(--nf-accent);align-items:center;gap:6px;font-size:13px;font-weight:600;display:inline-flex}.CUIYUW_dashHeroSparkle{font-size:14px}.CUIYUW_dashHeroTitle{flex-direction:column;gap:2px;display:flex}.CUIYUW_dashHeroBook{letter-spacing:-.3px;margin:0;font-size:24px;font-weight:700;line-height:1.25}.CUIYUW_dashHeroAction{border:1px solid var(--nf-glass-border);background:var(--nf-glass-inset);box-shadow:inset 0 1px 0 var(--nf-glass-sheen);border-radius:14px;align-items:center;gap:12px;padding:10px 14px;display:flex}.CUIYUW_dashHeroArrow{background:var(--nf-accent);color:#fff;border-radius:50%;flex:none;justify-content:center;align-items:center;width:28px;height:28px;font-size:14px;display:inline-flex}.CUIYUW_dashHeroActionBody{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.CUIYUW_dashHeroActionTitle{font-size:14px;font-weight:600}.CUIYUW_dashJourney{flex-direction:column;gap:6px;display:flex}.CUIYUW_dashJourneyBar{background:var(--nf-border);border-radius:999px;height:6px;overflow:hidden}.CUIYUW_dashJourneyFill{background:linear-gradient(90deg, var(--nf-info), var(--nf-accent));border-radius:999px;height:100%;transition:width .4s;display:block}.CUIYUW_dashJourneyStages{grid-template-columns:repeat(6,minmax(0,1fr));gap:4px;display:grid}.CUIYUW_dashStage{color:var(--nf-text-3);text-align:center;white-space:nowrap;flex-direction:column;align-items:center;gap:3px;font-size:11px;display:flex}.CUIYUW_dashStageDot{border:1px solid var(--nf-border-strong,var(--nf-text-3));background:var(--nf-bg-base);border-radius:50%;justify-content:center;align-items:center;width:18px;height:18px;font-size:10px;display:inline-flex}.CUIYUW_dashStageDone{color:var(--nf-text-2)}.CUIYUW_dashStageDone .CUIYUW_dashStageDot{background:var(--nf-success);border-color:var(--nf-success);color:#fff}.CUIYUW_dashStageCurrent{color:var(--nf-accent);font-weight:600}.CUIYUW_dashStageCurrent .CUIYUW_dashStageDot{border-color:var(--nf-accent);color:var(--nf-accent);box-shadow:0 0 0 3px color-mix(in srgb, var(--nf-accent) 18%, transparent)}.CUIYUW_dashFacts{border-top:1px solid var(--nf-border);grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding-top:12px;display:grid}.CUIYUW_dashFact{flex-direction:column;gap:2px;min-width:0;display:flex}.CUIYUW_dashFact b{white-space:nowrap;text-overflow:ellipsis;font-size:13px;overflow:hidden}.CUIYUW_dashGrid{grid-template-columns:minmax(0,3fr) minmax(0,2fr);align-items:start;gap:14px;display:grid}.CUIYUW_todoItem{border:1px solid var(--nf-border);border-radius:8px;align-items:center;gap:10px;padding:8px 12px;font-size:12.5px;display:flex}.CUIYUW_todoDanger{border-color:color-mix(in srgb, var(--nf-error) 40%, transparent);background:color-mix(in srgb, var(--nf-error) 8%, transparent)}.CUIYUW_todoWarning{border-color:color-mix(in srgb, var(--nf-warn) 40%, transparent);background:color-mix(in srgb, var(--nf-warn) 8%, transparent)}.CUIYUW_todoInfo{border-color:color-mix(in srgb, var(--nf-info) 40%, transparent);background:color-mix(in srgb, var(--nf-info) 7%, transparent)}.CUIYUW_todoText{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.CUIYUW_outlineReadonly{border:1px solid var(--nf-border);background:var(--nf-bg-inset);white-space:pre-wrap;user-select:text;border-radius:12px;max-height:480px;margin:0;padding:12px 14px;font-size:12.5px;line-height:1.8;overflow:auto}.CUIYUW_bookCreateOutline{flex-direction:column;align-items:flex-start;gap:6px;display:flex}.CUIYUW_assistantFloat{z-index:80;border:1px solid var(--nf-border);background:var(--nf-bg-raise);backdrop-filter:blur(24px)saturate(180%);box-shadow:var(--nf-shadow-lg);border-radius:16px;flex-direction:column;min-width:320px;min-height:220px;display:flex;position:absolute;overflow:hidden}.CUIYUW_assistantFloatHeader{cursor:grab;user-select:none;border-bottom:1px solid var(--nf-border);background:var(--nf-bg-inset);flex:none;justify-content:space-between;align-items:center;gap:8px;padding:8px 10px 8px 14px;font-size:13px;font-weight:600;display:flex}.CUIYUW_assistantFloatHeader:active{cursor:grabbing}.CUIYUW_assistantFloatBody{flex:1;min-height:0;padding:10px;display:flex;overflow:hidden}.CUIYUW_assistantFloatBody>*{flex:1;min-width:0}.CUIYUW_assistantResize{cursor:nwse-resize;background:linear-gradient(135deg, transparent 0 55%, var(--nf-border-strong) 55% 62%, transparent 62%) no-repeat 4px 4px / 12px 12px;width:20px;height:20px;position:absolute;bottom:0;right:0}.CUIYUW_coverPreview{border:1px solid var(--nf-border);background:var(--nf-bg-inset);border-radius:12px;flex:none;justify-content:center;align-items:center;width:150px;height:200px;display:flex;overflow:hidden}.CUIYUW_coverPreview img{object-fit:contain;width:100%;height:100%;display:block}.CUIYUW_coverPlaceholder{color:var(--nf-text-3);font-size:12px}.CUIYUW_shelfView{flex-direction:column;flex:1;gap:16px;min-height:0;padding:18px;display:flex;overflow:auto}.CUIYUW_shelfHeader{flex-direction:column;gap:2px;display:flex}.CUIYUW_shelfGrid{grid-template-columns:repeat(auto-fill,minmax(190px,1fr));align-content:start;gap:14px;display:grid}.CUIYUW_bookCard{border:1px solid var(--nf-border);background:var(--nf-bg-raise);backdrop-filter:blur(24px)saturate(180%);box-shadow:var(--nf-shadow);cursor:pointer;border-radius:16px;flex-direction:column;gap:8px;padding:12px;transition:border-color .15s,transform .1s,box-shadow .15s;display:flex}.CUIYUW_bookCard:hover{border-color:var(--nf-accent);box-shadow:var(--nf-shadow-lg);transform:translateY(-2px)}.CUIYUW_bookCardActive{border-color:var(--nf-accent);box-shadow:0 0 0 3px var(--nf-accent-soft)}.CUIYUW_bookCardCover{aspect-ratio:3/4;background:var(--nf-bg-inset);border:1px solid var(--nf-border);border-radius:12px;flex:none;justify-content:center;align-items:center;display:flex;overflow:hidden}.CUIYUW_bookCardCover img{object-fit:contain;width:100%;height:100%;display:block}.CUIYUW_bookCardCoverFallback{background:radial-gradient(400px 200px at 80% -20%, color-mix(in srgb, var(--nf-accent) 25%, transparent), transparent 70%), linear-gradient(155deg, var(--nf-bg-inset), color-mix(in srgb, var(--nf-accent) 10%, var(--nf-bg-inset)));flex-direction:column;justify-content:center;align-items:center;gap:6px;width:100%;height:100%;display:flex}.CUIYUW_bookCardCoverTitle{color:var(--nf-accent);letter-spacing:2px;font-size:22px;font-weight:800}.CUIYUW_bookCardBody{flex-direction:column;gap:5px;min-width:0;display:flex}.CUIYUW_bookCardTitleRow{justify-content:space-between;align-items:center;gap:6px;display:flex}.CUIYUW_bookCardName{text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:700;overflow:hidden}.CUIYUW_bookCardBlurb{-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:34px;display:-webkit-box;overflow:hidden}.CUIYUW_bookCardProgressBar{background:var(--nf-border);border-radius:999px;height:5px;overflow:hidden}.CUIYUW_bookCardProgressFill{background:linear-gradient(90deg, var(--nf-info), var(--nf-accent));border-radius:999px;height:100%;transition:width .3s;display:block}.CUIYUW_bookAddCard{text-align:center;color:var(--nf-text-2);border-style:dashed;justify-content:center;align-items:center;gap:8px;min-height:260px}.CUIYUW_bookAddCard:hover{color:var(--nf-accent)}.CUIYUW_bookAddIcon{color:var(--nf-accent);font-size:34px;line-height:1}.CUIYUW_bookCreateCard{border-color:var(--nf-accent);min-height:260px}.CUIYUW_createBookView{flex-direction:column;flex:1;gap:14px;min-height:0;padding:14px 18px 24px;display:flex;overflow:auto}.CUIYUW_createBookTop{align-items:center;display:flex}.CUIYUW_createBookCard{border:1px solid var(--nf-border);background:var(--nf-bg-raise);backdrop-filter:blur(24px)saturate(180%);width:min(520px,100%);box-shadow:var(--nf-shadow-lg);border-radius:20px;flex-direction:column;align-self:center;gap:12px;padding:26px 28px;display:flex}.CUIYUW_createBookIcon{font-size:34px;line-height:1}.CUIYUW_createBookTitle{letter-spacing:-.3px;margin:0;font-size:22px;font-weight:800}.CUIYUW_progressLineDone{color:var(--nf-success);font-weight:600}.CUIYUW_progressLineError{color:var(--nf-error);font-weight:600}.CUIYUW_meta{color:var(--nf-text-2);opacity:.9;font-size:12px}.CUIYUW_genreDesc{-webkit-line-clamp:2;-webkit-box-orient:vertical;max-width:560px;display:-webkit-box;overflow:hidden}.CUIYUW_fileList{color:var(--nf-text-2);opacity:.9;word-break:break-all;flex-direction:column;gap:3px;font-size:12px;display:flex}.CUIYUW_panelContent::-webkit-scrollbar,.CUIYUW_chatScroll::-webkit-scrollbar,.CUIYUW_chapterPreview::-webkit-scrollbar,.CUIYUW_progress::-webkit-scrollbar,.CUIYUW_toolLive::-webkit-scrollbar{width:8px;height:8px}.CUIYUW_panelContent::-webkit-scrollbar-thumb,.CUIYUW_chatScroll::-webkit-scrollbar-thumb,.CUIYUW_chapterPreview::-webkit-scrollbar-thumb,.CUIYUW_progress::-webkit-scrollbar-thumb,.CUIYUW_toolLive::-webkit-scrollbar-thumb{background:var(--nf-border-strong);border-radius:4px}.CUIYUW_panelContent::-webkit-scrollbar-thumb:hover,.CUIYUW_chatScroll::-webkit-scrollbar-thumb:hover,.CUIYUW_chapterPreview::-webkit-scrollbar-thumb:hover,.CUIYUW_progress::-webkit-scrollbar-thumb:hover,.CUIYUW_toolLive::-webkit-scrollbar-thumb:hover{background:var(--nf-text-3)}.CUIYUW_workflowList{flex-direction:column;gap:0;display:flex}.CUIYUW_workflowRow{align-items:flex-start;gap:12px;padding:8px 4px;display:flex;position:relative}.CUIYUW_workflowRow:before{content:\"\";background:var(--nf-border);width:2px;position:absolute;top:34px;bottom:-8px;left:13px}.CUIYUW_workflowRow:last-child:before{display:none}.CUIYUW_workflowDot{border:2px solid var(--nf-border-strong);background:var(--nf-bg-raise);width:28px;height:28px;color:var(--nf-text-2);z-index:1;border-radius:50%;flex-shrink:0;justify-content:center;align-items:center;font-size:12px;font-weight:700;display:inline-flex}.CUIYUW_workflowDotDone{border-color:var(--nf-success);background:color-mix(in srgb, var(--nf-success) 15%, var(--nf-bg-raise));color:var(--nf-success)}.CUIYUW_workflowDotActive{border-color:var(--nf-accent);background:var(--nf-accent);color:var(--nf-accent-fg);box-shadow:0 0 0 4px var(--nf-accent-soft)}.CUIYUW_workflowBody{flex-direction:column;flex:1;gap:4px;min-width:0;padding-top:2px;display:flex}.CUIYUW_workflowLabel{color:var(--nf-text);font-size:13px;font-weight:600}.CUIYUW_workflowHint{color:var(--nf-text-2);font-size:12px}@keyframes CUIYUW_pulse{0%,to{opacity:1}50%{opacity:.45}}@keyframes CUIYUW_fadeIn{0%{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}.CUIYUW_card{animation:.2s CUIYUW_fadeIn}.CUIYUW_bookshelf{border:1px solid var(--nf-glass-border);background:var(--nf-glass-face);box-shadow:var(--nf-shadow), inset 0 1px 0 var(--nf-glass-sheen);backdrop-filter:blur(26px)saturate(175%);z-index:1;border-radius:16px;flex-wrap:wrap;flex-shrink:0;align-items:center;gap:10px;margin:10px 12px 0;padding:8px 14px;display:flex;position:relative}.CUIYUW_bookshelfLabel{color:var(--nf-text-3);letter-spacing:1px;flex-shrink:0;font-size:12px;font-weight:700}.CUIYUW_bookshelfList{flex-wrap:wrap;flex:1;align-items:center;gap:6px;min-width:0;display:flex}.CUIYUW_bookChip{border:1px solid var(--nf-border);background:var(--nf-bg-inset);cursor:pointer;border-radius:999px;align-items:center;gap:6px;max-width:220px;padding:4px 8px 4px 10px;font-size:12px;transition:border-color .15s,background .15s;display:flex}.CUIYUW_bookChip:hover{border-color:var(--nf-border-strong)}.CUIYUW_bookChipActive{border-color:var(--nf-accent);background:var(--nf-accent-soft);color:var(--nf-accent)}.CUIYUW_bookChipName{text-overflow:ellipsis;white-space:nowrap;font-weight:600;overflow:hidden}.CUIYUW_bookChipMeta{opacity:.7;white-space:nowrap;font-size:11px}.CUIYUW_bookChipRemove{color:var(--nf-text-3);cursor:pointer;background:0 0;border:none;border-radius:4px;padding:0 2px;font-size:13px;line-height:1}.CUIYUW_bookChipRemove:hover{color:var(--nf-error)}.CUIYUW_bookAdd{border:1px dashed var(--nf-border-strong);color:var(--nf-text-2);cursor:pointer;background:0 0;border-radius:999px;padding:4px 12px;font-size:12px;transition:border-color .15s,color .15s}.CUIYUW_bookAdd:hover{border-color:var(--nf-accent);color:var(--nf-accent)}.CUIYUW_bookCreateForm{align-items:center;gap:6px;display:flex}.CUIYUW_dropzone{border:2px dashed var(--nf-border-strong);text-align:center;color:var(--nf-text-2);cursor:pointer;border-radius:10px;flex-direction:column;align-items:center;gap:6px;padding:18px 14px;font-size:13px;transition:border-color .15s,background .15s;display:flex}.CUIYUW_dropzone:hover,.CUIYUW_dropzoneActive{border-color:var(--nf-accent);background:var(--nf-accent-soft);color:var(--nf-accent)}.CUIYUW_dropzoneIcon{font-size:22px;line-height:1}";
		const tagId = "@waterwx/dsh-novel-forge/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@waterwx/dsh-novel-forge";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"diffNew": "CUIYUW_diffNew",
			"outlineReadonly": "CUIYUW_outlineReadonly",
			"workflowDot": "CUIYUW_workflowDot",
			"panel": "CUIYUW_panel",
			"dashStageCurrent": "CUIYUW_dashStageCurrent",
			"todoInfo": "CUIYUW_todoInfo",
			"dropzone": "CUIYUW_dropzone",
			"navTab": "CUIYUW_navTab",
			"createBookTitle": "CUIYUW_createBookTitle",
			"dashHeroActionTitle": "CUIYUW_dashHeroActionTitle",
			"dashJourneyFill": "CUIYUW_dashJourneyFill",
			"textarea": "CUIYUW_textarea",
			"assistantFloatBody": "CUIYUW_assistantFloatBody",
			"bookChip": "CUIYUW_bookChip",
			"bookChipActive": "CUIYUW_bookChipActive",
			"toolStep": "CUIYUW_toolStep",
			"diffList": "CUIYUW_diffList",
			"dashJourneyBar": "CUIYUW_dashJourneyBar",
			"navGroupSep": "CUIYUW_navGroupSep",
			"panelNavCollapsed": "CUIYUW_panelNavCollapsed",
			"meta": "CUIYUW_meta",
			"workflowDotActive": "CUIYUW_workflowDotActive",
			"workflowBody": "CUIYUW_workflowBody",
			"chatBubbleUser": "CUIYUW_chatBubbleUser",
			"chapterPreview": "CUIYUW_chapterPreview",
			"assetGrid": "CUIYUW_assetGrid",
			"navSpacer": "CUIYUW_navSpacer",
			"todoDanger": "CUIYUW_todoDanger",
			"bookCardCover": "CUIYUW_bookCardCover",
			"chapterTitle": "CUIYUW_chapterTitle",
			"assetStat": "CUIYUW_assetStat",
			"navAboutUpdate": "CUIYUW_navAboutUpdate",
			"badge": "CUIYUW_badge",
			"entry": "CUIYUW_entry",
			"diffText": "CUIYUW_diffText",
			"panelSubtitle": "CUIYUW_panelSubtitle",
			"badgePending": "CUIYUW_badgePending",
			"progressLineDone": "CUIYUW_progressLineDone",
			"panelTitle": "CUIYUW_panelTitle",
			"assistantStatusBusy": "CUIYUW_assistantStatusBusy",
			"headerProgress": "CUIYUW_headerProgress",
			"bookAdd": "CUIYUW_bookAdd",
			"progressLine": "CUIYUW_progressLine",
			"dashStage": "CUIYUW_dashStage",
			"toolStepStatus": "CUIYUW_toolStepStatus",
			"dashStageDot": "CUIYUW_dashStageDot",
			"input": "CUIYUW_input",
			"diffChange": "CUIYUW_diffChange",
			"field": "CUIYUW_field",
			"headerProgressDot": "CUIYUW_headerProgressDot",
			"toolSteps": "CUIYUW_toolSteps",
			"assetStatValue": "CUIYUW_assetStatValue",
			"reviewBox": "CUIYUW_reviewBox",
			"dashFacts": "CUIYUW_dashFacts",
			"dashHeroActionBody": "CUIYUW_dashHeroActionBody",
			"bookCard": "CUIYUW_bookCard",
			"assetStatLabel": "CUIYUW_assetStatLabel",
			"bookAddCard": "CUIYUW_bookAddCard",
			"diffDel": "CUIYUW_diffDel",
			"createBookView": "CUIYUW_createBookView",
			"cardTitle": "CUIYUW_cardTitle",
			"bookChipName": "CUIYUW_bookChipName",
			"chatRole": "CUIYUW_chatRole",
			"workflowList": "CUIYUW_workflowList",
			"progress": "CUIYUW_progress",
			"entryLabel": "CUIYUW_entryLabel",
			"chapterBeats": "CUIYUW_chapterBeats",
			"card": "CUIYUW_card",
			"badgeWritten": "CUIYUW_badgeWritten",
			"onlyChanges": "CUIYUW_onlyChanges",
			"diffTagOld": "CUIYUW_diffTagOld",
			"navTabIcon": "CUIYUW_navTabIcon",
			"liveText": "CUIYUW_liveText",
			"diffSameBody": "CUIYUW_diffSameBody",
			"wsColumns": "CUIYUW_wsColumns",
			"dashStageDone": "CUIYUW_dashStageDone",
			"bookCardBlurb": "CUIYUW_bookCardBlurb",
			"createBookCard": "CUIYUW_createBookCard",
			"spaceBetween": "CUIYUW_spaceBetween",
			"diffLegend": "CUIYUW_diffLegend",
			"dashHero": "CUIYUW_dashHero",
			"createBookTop": "CUIYUW_createBookTop",
			"bookCardName": "CUIYUW_bookCardName",
			"fileList": "CUIYUW_fileList",
			"assistantStatus": "CUIYUW_assistantStatus",
			"workflowHint": "CUIYUW_workflowHint",
			"bookCreateForm": "CUIYUW_bookCreateForm",
			"wsPreviewText": "CUIYUW_wsPreviewText",
			"assetStatDetail": "CUIYUW_assetStatDetail",
			"chapterActions": "CUIYUW_chapterActions",
			"dashHeroBook": "CUIYUW_dashHeroBook",
			"dashGrid": "CUIYUW_dashGrid",
			"coverPreview": "CUIYUW_coverPreview",
			"panelNav": "CUIYUW_panelNav",
			"bookChipRemove": "CUIYUW_bookChipRemove",
			"dashHeroEyebrow": "CUIYUW_dashHeroEyebrow",
			"toolLive": "CUIYUW_toolLive",
			"navTabBadgeDone": "CUIYUW_navTabBadgeDone",
			"buttonDanger": "CUIYUW_buttonDanger",
			"view": "CUIYUW_view",
			"panelBody": "CUIYUW_panelBody",
			"navGroupLabel": "CUIYUW_navGroupLabel",
			"badgeRejected": "CUIYUW_badgeRejected",
			"dashHeroAction": "CUIYUW_dashHeroAction",
			"assistantFloatHeader": "CUIYUW_assistantFloatHeader",
			"wsPageHeader": "CUIYUW_wsPageHeader",
			"chapterNum": "CUIYUW_chapterNum",
			"wsSelectedText": "CUIYUW_wsSelectedText",
			"navTabLabel": "CUIYUW_navTabLabel",
			"toolStepActive": "CUIYUW_toolStepActive",
			"chatScroll": "CUIYUW_chatScroll",
			"bookCardActive": "CUIYUW_bookCardActive",
			"bookCardCoverFallback": "CUIYUW_bookCardCoverFallback",
			"dashJourney": "CUIYUW_dashJourney",
			"createBookIcon": "CUIYUW_createBookIcon",
			"navAbout": "CUIYUW_navAbout",
			"todoWarning": "CUIYUW_todoWarning",
			"todoText": "CUIYUW_todoText",
			"shelfGrid": "CUIYUW_shelfGrid",
			"navAboutRow": "CUIYUW_navAboutRow",
			"fieldLabel": "CUIYUW_fieldLabel",
			"panelHeader": "CUIYUW_panelHeader",
			"chatBubbleAssistant": "CUIYUW_chatBubbleAssistant",
			"dashFact": "CUIYUW_dashFact",
			"progressLineError": "CUIYUW_progressLineError",
			"diffColumn": "CUIYUW_diffColumn",
			"genreDesc": "CUIYUW_genreDesc",
			"volumeGroupHeader": "CUIYUW_volumeGroupHeader",
			"workflowDotDone": "CUIYUW_workflowDotDone",
			"bookCreateCard": "CUIYUW_bookCreateCard",
			"busyRow": "CUIYUW_busyRow",
			"progressBar": "CUIYUW_progressBar",
			"diffSame": "CUIYUW_diffSame",
			"shelfHeader": "CUIYUW_shelfHeader",
			"bookshelfList": "CUIYUW_bookshelfList",
			"panelContent": "CUIYUW_panelContent",
			"dropzoneActive": "CUIYUW_dropzoneActive",
			"bookCreateOutline": "CUIYUW_bookCreateOutline",
			"progressBarFill": "CUIYUW_progressBarFill",
			"button": "CUIYUW_button",
			"bookChipMeta": "CUIYUW_bookChipMeta",
			"iconButton": "CUIYUW_iconButton",
			"tabBar": "CUIYUW_tabBar",
			"wsEditor": "CUIYUW_wsEditor",
			"fadeIn": "CUIYUW_fadeIn",
			"toolStepDetail": "CUIYUW_toolStepDetail",
			"volumeGroupToggle": "CUIYUW_volumeGroupToggle",
			"legendOld": "CUIYUW_legendOld",
			"navTabBadge": "CUIYUW_navTabBadge",
			"row": "CUIYUW_row",
			"wsColumn": "CUIYUW_wsColumn",
			"bookCardProgressBar": "CUIYUW_bookCardProgressBar",
			"shelfView": "CUIYUW_shelfView",
			"bookCardProgressFill": "CUIYUW_bookCardProgressFill",
			"volumeGroup": "CUIYUW_volumeGroup",
			"bookAddIcon": "CUIYUW_bookAddIcon",
			"diffTagNew": "CUIYUW_diffTagNew",
			"bookCardTitleRow": "CUIYUW_bookCardTitleRow",
			"chapterMain": "CUIYUW_chapterMain",
			"dashHeroTitle": "CUIYUW_dashHeroTitle",
			"diffOld": "CUIYUW_diffOld",
			"chapter": "CUIYUW_chapter",
			"dashHeroSparkle": "CUIYUW_dashHeroSparkle",
			"assistantResize": "CUIYUW_assistantResize",
			"workflowRow": "CUIYUW_workflowRow",
			"bookshelf": "CUIYUW_bookshelf",
			"bigProgressBarFill": "CUIYUW_bigProgressBarFill",
			"navTabBadgeWarn": "CUIYUW_navTabBadgeWarn",
			"dashJourneyStages": "CUIYUW_dashJourneyStages",
			"toolStepError": "CUIYUW_toolStepError",
			"badgeGenerating": "CUIYUW_badgeGenerating",
			"pulse": "CUIYUW_pulse",
			"workflowLabel": "CUIYUW_workflowLabel",
			"toolStepName": "CUIYUW_toolStepName",
			"navTabBadgeDanger": "CUIYUW_navTabBadgeDanger",
			"badgeError": "CUIYUW_badgeError",
			"dashHeroArrow": "CUIYUW_dashHeroArrow",
			"progressLineLive": "CUIYUW_progressLineLive",
			"coverPlaceholder": "CUIYUW_coverPlaceholder",
			"badgeDone": "CUIYUW_badgeDone",
			"bookCardCoverTitle": "CUIYUW_bookCardCoverTitle",
			"bigProgressBar": "CUIYUW_bigProgressBar",
			"wsPreview": "CUIYUW_wsPreview",
			"bookCardBody": "CUIYUW_bookCardBody",
			"wsSelected": "CUIYUW_wsSelected",
			"chapterList": "CUIYUW_chapterList",
			"bookshelfLabel": "CUIYUW_bookshelfLabel",
			"buttonSmall": "CUIYUW_buttonSmall",
			"wsPage": "CUIYUW_wsPage",
			"todoItem": "CUIYUW_todoItem",
			"buttonPrimary": "CUIYUW_buttonPrimary",
			"navGroup": "CUIYUW_navGroup",
			"assistantFloat": "CUIYUW_assistantFloat",
			"legendNew": "CUIYUW_legendNew",
			"entryIcon": "CUIYUW_entryIcon",
			"toolStepIcon": "CUIYUW_toolStepIcon",
			"diffAdd": "CUIYUW_diffAdd",
			"dropzoneIcon": "CUIYUW_dropzoneIcon",
			"tab": "CUIYUW_tab"
		};
		//#endregion
		//#region src/client/panel/AssistantTab.tsx
		/**
		* AI 助手（编辑老师）：与 AI 编辑对话讨论剧情，助手通过动作指令直接修改
		* 大纲 / 设定圣经 / 章节。流式渲染回复；工具调用显示为步骤卡片（中文名 +
		* 状态 + 耗时），顶部状态条展示当前在做什么；支持清空对话记录。
		*/
		/** 工具中文名 + 图标映射（作者看得懂）。 */
		const TOOL_LABELS = {
			book_overview: {
				icon: "📖",
				label: "读取全书上下文"
			},
			impact_analysis: {
				icon: "🔗",
				label: "影响分析"
			},
			outline_text: {
				icon: "📄",
				label: "读取大纲"
			},
			outline_replace: {
				icon: "📝",
				label: "修改大纲"
			},
			bible_set_rule: {
				icon: "📖",
				label: "修改设定规则"
			},
			bible_set_redline: {
				icon: "🚫",
				label: "修改写作红线"
			},
			chapter_text: {
				icon: "📄",
				label: "读取章节"
			},
			chapter_rewrite: {
				icon: "✏️",
				label: "修订章节"
			},
			chapter_generate: {
				icon: "✨",
				label: "生成章节"
			},
			chapter_review: {
				icon: "🔍",
				label: "AI 审稿"
			},
			foreshadow_add: {
				icon: "🪤",
				label: "新增伏笔"
			},
			foreshadow_update: {
				icon: "🪤",
				label: "更新伏笔"
			},
			export_txt: {
				icon: "📦",
				label: "导出 TXT"
			},
			assets_status: {
				icon: "🎨",
				label: "查看写作资产"
			},
			assets_set_genre: {
				icon: "🏷️",
				label: "设置题材"
			},
			assets_set_progression: {
				icon: "📈",
				label: "设置推进模式"
			},
			assets_add_rule: {
				icon: "🚫",
				label: "新增反AI规则"
			},
			error: {
				icon: "⚠️",
				label: "出错了"
			}
		};
		/** The assistant conversation tab. */
		function AssistantTab({ api }) {
			const [lines, setLines] = (0, react.useState)([]);
			const [input, setInput] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			/** 思考耗时（秒，busy 时每秒刷新）。 */
			const [thinkSeconds, setThinkSeconds] = (0, react.useState)(0);
			const idRef = (0, react.useRef)(0);
			const scrollRef = (0, react.useRef)(null);
			/** busy 计时：显示"已思考 Xs"，让作者知道在干活。 */
			(0, react.useEffect)(() => {
				if (!busy) {
					setThinkSeconds(0);
					return;
				}
				const started = Date.now();
				const timer = window.setInterval(() => {
					setThinkSeconds(Math.floor((Date.now() - started) / 1e3));
				}, 1e3);
				return () => {
					window.clearInterval(timer);
				};
			}, [busy]);
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
			/** Push a tool event: start 创建步骤，done/error 更新同名步骤（含耗时）。 */
			const pushTool = (0, react.useCallback)((tool) => {
				setLines((prev) => {
					const last = prev[prev.length - 1];
					if (last === void 0 || last.role !== "assistant") return [...prev, {
						id: idRef.current++,
						role: "assistant",
						text: "",
						tools: [{
							...tool,
							startedAt: tool.status === "start" ? Date.now() : void 0
						}]
					}];
					const tools = [...last.tools];
					if (tool.status === "start") tools.push({
						...tool,
						startedAt: Date.now()
					});
					else for (let i = tools.length - 1; i >= 0; i--) {
						const step = tools[i];
						if (step.name === tool.name && step.status === "start") {
							tools[i] = {
								...step,
								status: tool.status,
								detail: tool.detail,
								elapsedMs: Date.now() - (step.startedAt ?? Date.now())
							};
							break;
						}
					}
					return [...prev.slice(0, -1), {
						...last,
						tools,
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
			/** 当前进行中的工具（状态条显示）。 */
			const activeTool = (() => {
				if (!busy) return null;
				for (let i = lines.length - 1; i >= 0; i--) {
					const line = lines[i];
					if (line.role !== "assistant") continue;
					for (let j = line.tools.length - 1; j >= 0; j--) if (line.tools[j].status === "start") return line.tools[j];
				}
				return null;
			})();
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
			/** 清空对话记录（服务端删除历史 + 本地清空）。 */
			const handleClear = async () => {
				if (!window.confirm("清空全部聊天记录？此操作不可恢复（不影响大纲/设定/章节）。")) return;
				setBusy(true);
				setError("");
				try {
					await api.assistantClear();
					setLines([]);
					setNotice("对话已清空，编辑老师会重新了解项目");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** Send one message. */
			const handleSend = async () => {
				const message = input.trim();
				if (message === "" || busy) return;
				setInput("");
				setError("");
				setNotice("");
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						style: { justifyContent: "space-between" },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.cardTitle,
							children: tt("tab.assistant")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.iconButton,
							title: "清空聊天记录",
							"aria-label": "清空聊天记录",
							onClick: () => {
								handleClear();
							},
							children: "🗑️"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.meta,
						children: tt("assistant.hint")
					}),
					notice !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: {
							color: "var(--nf-success)",
							fontSize: 12
						},
						children: notice
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: `${panel_module_css_default.assistantStatus} ${busy ? panel_module_css_default.assistantStatusBusy : ""}`,
						children: busy ? `🤖 编辑老师 · ${activeTool !== null ? `正在「${TOOL_LABELS[activeTool.name]?.label ?? activeTool.name}」` : `正在思考…（已 ${thinkSeconds}s）`}` : "💬 编辑老师 · 等你开口"
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
										className: panel_module_css_default.toolSteps,
										children: line.tools.map((tool, i) => {
											const meta = TOOL_LABELS[tool.name] ?? {
												icon: "⚙️",
												label: tool.name
											};
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: `${panel_module_css_default.toolStep} ${tool.status === "error" ? panel_module_css_default.toolStepError : tool.status === "start" ? panel_module_css_default.toolStepActive : ""}`,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.toolStepIcon,
														children: meta.icon
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.toolStepName,
														children: meta.label
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.toolStepStatus,
														children: tool.status === "start" ? "⏳ 进行中" : tool.status === "done" ? `✓ ${tool.elapsedMs !== void 0 ? `${(tool.elapsedMs / 1e3).toFixed(1)}s` : ""}` : "✗ 失败"
													}),
													tool.status === "error" && tool.detail !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.toolStepDetail,
														children: tool.detail
													})
												]
											}, i);
										})
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
					className: `${panel_module_css_default.meta} ${panel_module_css_default.genreDesc}`,
					title: node.description,
					children: ["— ", node.description]
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
		/** 写作资产页签。 */
		function AssetsTab({ api, initialTab = "genre" }) {
			const [assetTab, setAssetTab] = (0, react.useState)(initialTab);
			const [data, setData] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const [notice, setNotice] = (0, react.useState)("");
			const [sampleText, setSampleText] = (0, react.useState)("");
			const [styleName, setStyleName] = (0, react.useState)("");
			const [newRule, setNewRule] = (0, react.useState)("");
			const [newProgression, setNewProgression] = (0, react.useState)("");
			/** 正在行内编辑的自定义反 AI 规则（下标 + 草稿字段）。 */
			const [editingRule, setEditingRule] = (0, react.useState)(null);
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
			/** 保存行内编辑的自定义规则。 */
			const handleSaveRuleEdit = async () => {
				if (editingRule === null) return;
				const rules = [...data?.projectAssets.antiAiRules ?? []];
				if (editingRule.index < 0 || editingRule.index >= rules.length) return;
				const name = editingRule.name.trim() || rules[editingRule.index].name;
				if (editingRule.avoid.trim() === "" && editingRule.fix.trim() === "") return;
				rules[editingRule.index] = {
					name,
					avoid: editingRule.avoid.trim(),
					fix: editingRule.fix.trim()
				};
				await patch({ antiAiRules: rules });
				setEditingRule(null);
			};
			/** 删除一条自定义规则。 */
			const handleRemoveRule = async (index) => {
				const rules = [...data?.projectAssets.antiAiRules ?? []];
				rules.splice(index, 1);
				setEditingRule(null);
				await patch({ antiAiRules: rules });
			};
			/** 把内置规则复制为自定义副本（同名覆盖生效），并打开行内编辑。 */
			const handleOverrideBuiltin = (rule) => {
				const rules = data?.projectAssets.antiAiRules ?? [];
				const existing = rules.findIndex((r) => r.name === rule.name);
				if (existing >= 0) setEditingRule({
					index: existing,
					name: rules[existing].name,
					avoid: rules[existing].avoid,
					fix: rules[existing].fix ?? ""
				});
				else {
					const next = [...rules, {
						...rule,
						fix: rule.fix ?? ""
					}];
					setEditingRule({
						index: next.length - 1,
						name: rule.name,
						avoid: rule.avoid,
						fix: rule.fix ?? ""
					});
					patch({ antiAiRules: next });
				}
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
					gap: 12,
					flex: 1,
					minHeight: 0
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
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.assetGrid,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.assetStat,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.assetStatLabel,
										children: "当前题材"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.assetStatValue,
										children: assets.genre?.name ?? "未设置"
									}),
									assets.genre !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.assetStatDetail,
										title: assets.genre.description,
										children: assets.genre.description
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.assetStat,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.assetStatLabel,
										children: "主推进模式"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.assetStatValue,
										children: assets.primaryProgression?.name ?? "未设置"
									}),
									assets.primaryProgression !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.assetStatDetail,
										title: assets.primaryProgression.driver,
										children: assets.primaryProgression.driver
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.assetStat,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.assetStatLabel,
										children: "已绑定写法"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.assetStatValue,
										children: [assets.styleAssets?.length ?? 0, " 套"]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.assetStatDetail,
										title: (assets.styleAssets ?? []).map((s) => s.name).join("、"),
										children: (assets.styleAssets ?? []).map((s) => s.name).join("、") || "未绑定（可在「笔法帖」一键选用）"
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.assetStat,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.assetStatLabel,
										children: "文戒"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.assetStatValue,
										children: [
											builtinRules.length,
											" 内置 + ",
											(assets.antiAiRules ?? []).length,
											" 自定义"
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.assetStatDetail,
										children: "全部生效于生成与审稿提示词"
									})
								]
							})
						]
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
									gap: 8
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
						style: {
							flex: 1,
							minHeight: 0
						},
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
									flex: 1,
									minHeight: 0,
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
						style: {
							flex: 1,
							minHeight: 0
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cardTitle,
								children: "笔法帖"
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
									flex: 1,
									minHeight: 0,
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
						style: {
							flex: 1,
							minHeight: 0
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cardTitle,
								children: "文戒"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.meta,
								children: "写作时必须遵守的表达边界（内置全局 + 项目自定义），生成与审稿都会检查。内置规则可用「覆盖编辑」复制为自定义版本调整。"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: 6,
									flex: 1,
									minHeight: 0,
									overflowY: "auto"
								},
								children: [builtinRules.map((rule) => {
									const overridden = customRules.some((r) => r.name === rule.name);
									return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											border: "1px solid var(--nf-border)",
											borderRadius: 6,
											padding: "6px 10px",
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
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: rule.name }),
													" ",
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.badge,
														style: {
															borderColor: overridden ? "var(--nf-accent)" : "var(--nf-text-3)",
															color: overridden ? "var(--nf-accent)" : "var(--nf-text-3)"
														},
														children: overridden ? "自定义覆盖中" : "内置"
													})
												] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
													disabled: busy,
													onClick: () => {
														handleOverrideBuiltin(rule);
													},
													children: overridden ? "✎ 编辑覆盖" : "＋ 覆盖编辑"
												})]
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
									}, rule.name);
								}), customRules.map((rule, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										border: "1px solid var(--nf-accent)",
										borderRadius: 6,
										padding: "6px 10px",
										fontSize: 12
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											alignItems: "center",
											justifyContent: "space-between",
											gap: 8
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: rule.name }),
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.badge,
												style: {
													borderColor: "var(--nf-accent)",
													color: "var(--nf-accent)"
												},
												children: "自定义"
											})
										] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												display: "flex",
												gap: 6
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
												disabled: busy,
												onClick: () => {
													setEditingRule({
														index,
														name: rule.name,
														avoid: rule.avoid,
														fix: rule.fix ?? ""
													});
												},
												children: "编辑"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
												disabled: busy,
												onClick: () => {
													handleRemoveRule(index);
												},
												children: "删除"
											})]
										})]
									}), editingRule !== null && editingRule.index === index ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											flexDirection: "column",
											gap: 6,
											marginTop: 6
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												placeholder: "规则名",
												value: editingRule.name,
												onChange: (e) => {
													setEditingRule({
														...editingRule,
														name: e.target.value
													});
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												placeholder: "避免（要杜绝的表达）",
												value: editingRule.avoid,
												onChange: (e) => {
													setEditingRule({
														...editingRule,
														avoid: e.target.value
													});
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												className: panel_module_css_default.input,
												placeholder: "修正（改写方向，可留空）",
												value: editingRule.fix,
												onChange: (e) => {
													setEditingRule({
														...editingRule,
														fix: e.target.value
													});
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
													disabled: busy || editingRule.avoid.trim() === "" && editingRule.fix.trim() === "",
													onClick: () => {
														handleSaveRuleEdit();
													},
													children: "保存"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
													onClick: () => {
														setEditingRule(null);
													},
													children: "取消"
												})]
											})
										]
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.meta,
										children: ["避免：", rule.avoid]
									}), rule.fix !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.meta,
										children: ["修正：", rule.fix]
									})] })]
								}, `${rule.name}-${index}`))]
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
								children: "心法"
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
		//#region src/client/panel/ShelfView.tsx
		/**
		* 书架首页视图：书卡网格（封面/书名/简介/进度）+ 开书入口。
		* 进入小说工坊默认展示；点击书卡进入该书工作台，＋ 进入开书向导页。
		*/
		/** 一张书卡（封面懒加载）。 */
		function BookCard({ api, book, active, onOpen }) {
			const [cover, setCover] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				if (!book.hasCover) return;
				let cancelled = false;
				api.coverGet(book.outputDir).then((result) => {
					if (!cancelled) setCover(result.dataUrl);
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, [
				api,
				book.hasCover,
				book.outputDir
			]);
			const ratio = book.total > 0 ? Math.min(book.done / book.total, 1) : 0;
			const statusLabel = !book.hasProject ? "未开书" : book.total > 0 && book.done >= book.total ? "已完结" : "进行中";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${panel_module_css_default.bookCard} ${active ? panel_module_css_default.bookCardActive : ""}`,
				onClick: onOpen,
				title: `打开《${book.bookName}》`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.bookCardCover,
					children: cover !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						src: cover,
						alt: `《${book.bookName}》封面`
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.bookCardCoverFallback,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.bookCardCoverTitle,
							children: book.bookName.slice(0, 4)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.meta,
							children: "暂无封面"
						})]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.bookCardBody,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.bookCardTitleRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.bookCardName,
								children: book.bookName
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `${panel_module_css_default.badge} ${book.hasProject ? book.total > 0 && book.done >= book.total ? panel_module_css_default.badgeDone : panel_module_css_default.badgeWritten : panel_module_css_default.badgePending}`,
								children: statusLabel
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: `${panel_module_css_default.meta} ${panel_module_css_default.bookCardBlurb}`,
							title: book.blurb ?? "",
							children: book.blurb !== void 0 && book.blurb !== "" ? book.blurb : "暂无简介"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.bookCardProgressBar,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.bookCardProgressFill,
								style: { width: `${Math.round(ratio * 100)}%` }
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.meta,
							children: book.total > 0 ? `已完成 ${book.done} / ${book.total} 章` : "尚未规划章节"
						})
					]
				})]
			});
		}
		/** 书架首页。 */
		function ShelfView({ api, shelf, onOpenBook, onAddBook }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.shelfView,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.shelfHeader,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: panel_module_css_default.panelTitle,
						style: { margin: 0 },
						children: "📚 书架"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.meta,
						children: "选择一本书进入工作台，或开一本新书"
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.shelfGrid,
					children: [shelf.books.map((book) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BookCard, {
						api,
						book,
						active: book.id === shelf.activeBookId,
						onOpen: () => {
							onOpenBook(book.id);
						}
					}, book.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `${panel_module_css_default.bookCard} ${panel_module_css_default.bookAddCard}`,
						onClick: onAddBook,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.bookAddIcon,
								children: "＋"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "开一本新书" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.meta,
								children: "书名 + 大纲，开书即建项目"
							})
						]
					})]
				})]
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
		//#region src/client/panel/CreateBookView.tsx
		/**
		* 开书向导：独立页面视图 —— 书名 + 大纲（选择 docx / 拖拽 / 粘贴），
		* 实时书名识别与题材提示，开书即建项目并进入工作台。
		*/
		/** 从大纲首行推断书名（与服务端 inferBookName 一致，供实时预览）。 */
		function inferBookNamePreview(outline) {
			const line = outline.split("\n").map((l) => l.trim()).find((l) => l.length > 0);
			if (line === void 0) return "";
			return line.replace(/^《/, "").replace(/》.*$/, "").slice(0, 40);
		}
		/** 简单题材识别（提示用）。 */
		function guessGenre(outline) {
			for (const [genre, keywords] of [
				["仙侠修真", [
					"仙",
					"修",
					"灵根",
					"元婴",
					"宗门",
					"飞升"
				]],
				["都市", [
					"都市",
					"公司",
					"外卖",
					"职场",
					"总裁"
				]],
				["玄幻", [
					"斗气",
					"魂力",
					"大陆",
					"斗罗",
					"神"
				]],
				["悬疑", [
					"悬疑",
					"密室",
					"案件",
					"推理",
					"凶"
				]],
				["科幻", [
					"机甲",
					"星舰",
					"AI",
					"未来",
					"星际"
				]],
				["历史", [
					"朝代",
					"皇帝",
					"将军",
					"古代",
					"王朝"
				]],
				["游戏", [
					"游戏",
					"副本",
					"装备",
					"等级",
					"职业"
				]]
			]) if (keywords.some((k) => outline.includes(k))) return genre;
			return null;
		}
		/** 开书向导页。 */
		function CreateBookView({ api, onBack, onCreated }) {
			const [name, setName] = (0, react.useState)("");
			const [outlineText, setOutlineText] = (0, react.useState)("");
			const [outlineName, setOutlineName] = (0, react.useState)("");
			const [dragActive, setDragActive] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			const outlineFileRef = (0, react.useRef)(null);
			const autoName = inferBookNamePreview(outlineText);
			const effectiveName = name.trim() !== "" ? name.trim() : autoName;
			const genre = guessGenre(outlineText);
			const handlePickOutlineFile = async (file) => {
				if (file === void 0) return;
				try {
					const text = extractDocxTextFromBuffer(await file.arrayBuffer());
					if (text.length < 50) {
						setError("大纲内容过短（<50 字符），请检查文件");
						return;
					}
					setOutlineText(text);
					setOutlineName(file.name);
					if (name.trim() === "") setName(inferBookNamePreview(text));
					setError("");
				} catch (err) {
					setError(`读取大纲失败：${err.message}`);
				}
			};
			const handleCreate = async () => {
				if (effectiveName === "") {
					setError("请填写书名，或提供大纲自动识别");
					return;
				}
				setBusy(true);
				setError("");
				try {
					const snapshot = await api.bookCreate(effectiveName, void 0, outlineText.trim() !== "" ? outlineText.trim() : void 0);
					const created = snapshot.books.find((b) => b.id === snapshot.activeBookId);
					if (created !== void 0) onCreated(created.id);
					else setError("开书失败：未找到新书");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.createBookView,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.createBookTop,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.iconButton,
						title: "返回书架",
						"aria-label": "返回书架",
						onClick: onBack,
						children: "← 书架"
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.createBookCard,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.createBookIcon,
							children: "✒️"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: panel_module_css_default.createBookTitle,
							children: "开书向导"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.meta,
							children: "把一份大纲「编译」成一本完整的小说"
						}),
						error !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.card,
							style: {
								borderColor: "var(--nf-error)",
								padding: "8px 12px"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									color: "var(--nf-error)",
									fontSize: 12
								},
								children: error
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: panel_module_css_default.fieldLabel,
								children: "书名"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input,
								placeholder: autoName !== "" ? `自动识别：${autoName}` : "输入书名（提供大纲后自动识别）",
								value: name,
								onChange: (e) => {
									setName(e.target.value);
								},
								onKeyDown: (e) => {
									if (e.key === "Enter") handleCreate();
								},
								autoFocus: true
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.field,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									className: panel_module_css_default.fieldLabel,
									children: "大纲"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: `${panel_module_css_default.dropzone} ${dragActive ? panel_module_css_default.dropzoneActive : ""}`,
									onClick: () => {
										outlineFileRef.current?.click();
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
										handlePickOutlineFile(e.dataTransfer.files?.[0]);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.dropzoneIcon,
											children: "📄"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: outlineName !== "" ? `已选择：${outlineName}` : "点击选择 docx 大纲，或将文件拖到这里" }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.meta,
											children: "推荐提供大纲：开书即建立项目，书名自动识别"
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											ref: outlineFileRef,
											type: "file",
											accept: ".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
											style: { display: "none" },
											onChange: (e) => {
												handlePickOutlineFile(e.target.files?.[0]);
												e.target.value = "";
											}
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
									className: panel_module_css_default.textarea,
									style: { minHeight: 130 },
									placeholder: "或直接粘贴大纲文本（50 字以上）…",
									value: outlineText,
									onChange: (e) => {
										setOutlineText(e.target.value);
									},
									spellCheck: false
								})
							]
						}),
						(outlineText.trim().length > 0 || effectiveName !== "") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.row,
							style: { flexWrap: "wrap" },
							children: [
								outlineText.trim().length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.meta,
									children: [
										"大纲 ",
										outlineText.length,
										" 字"
									]
								}),
								effectiveName !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.meta,
									children: ["书名：", effectiveName]
								}),
								genre !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.meta,
									children: ["题材：", genre]
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
							style: {
								width: "100%",
								padding: "10px 0",
								fontSize: 14
							},
							disabled: busy || effectiveName === "",
							onClick: () => {
								handleCreate();
							},
							children: "✨ 开书并进入工作台"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.meta,
							style: { textAlign: "center" },
							children: "未提供大纲也能开书，稍后可在大纲页导入"
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/panel/WorldTab.tsx
		/**
		* 大世界页签：境界体系 / 地理区域 / 势力分布 的结构化编辑 + AI 提炼。
		* 数据注入每章生成与审稿提示词（renderWorld），保证设定不写飞。
		*/
		const EMPTY = {
			realms: [],
			regions: [],
			factions: []
		};
		/** 一个可编辑条目行。 */
		function EditableRow({ name, detail, onName, onDetail, onRemove, namePlaceholder, detailPlaceholder }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					gap: 6,
					alignItems: "flex-start"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.input,
						style: {
							flex: 2,
							minWidth: 0
						},
						placeholder: namePlaceholder,
						value: name,
						onChange: (e) => {
							onName(e.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.input,
						style: {
							flex: 3,
							minWidth: 0
						},
						placeholder: detailPlaceholder,
						value: detail,
						onChange: (e) => {
							onDetail(e.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
						title: "删除",
						onClick: onRemove,
						children: "×"
					})
				]
			});
		}
		/** 大世界页签。 */
		function WorldTab({ api, world, onChanged }) {
			const [draft, setDraft] = (0, react.useState)(() => world ?? EMPTY);
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)("");
			(0, react.useEffect)(() => {
				setDraft(world ?? EMPTY);
			}, [world]);
			const handleGenerate = async () => {
				setBusy(true);
				setError("");
				try {
					const result = await api.world("generate");
					setDraft(result.world);
					onChanged(result.world);
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			const handleSave = async () => {
				setBusy(true);
				setError("");
				try {
					onChanged((await api.world("save", draft)).world);
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			const setRealms = (realms) => setDraft((prev) => ({
				...prev,
				realms
			}));
			const setRegions = (regions) => setDraft((prev) => ({
				...prev,
				regions
			}));
			const setFactions = (factions) => setDraft((prev) => ({
				...prev,
				factions
			}));
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
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: { color: "var(--nf-error)" },
							children: error
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.card,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.row,
							style: { justifyContent: "space-between" },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.cardTitle,
								children: "大世界"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
									disabled: busy,
									onClick: () => {
										handleGenerate();
									},
									children: "✨ AI 提炼"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
									disabled: busy,
									onClick: () => {
										handleSave();
									},
									children: "💾 保存"
								})]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.meta,
							children: "境界体系按由低到高排序注入章节生成提示词，模型不得随意跳级或自创境界；区域与势力约束地理/势力设定。AI 提炼不满意可逐条编辑后保存。"
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.card,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.row,
							style: { justifyContent: "space-between" },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.cardTitle,
								children: [
									"境界体系（",
									draft.realms.length,
									"）"
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
								onClick: () => {
									setRealms([...draft.realms, {
										name: "",
										description: ""
									}]);
								},
								children: "＋ 新增境界"
							})]
						}), draft.realms.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.meta,
							children: "暂无境界体系 — 点击 ✨AI 提炼 或手动添加（由低到高）。"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: draft.realms.map((realm, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditableRow, {
								name: realm.name,
								detail: realm.description,
								onName: (v) => {
									const next = [...draft.realms];
									next[i] = {
										...next[i],
										name: v
									};
									setRealms(next);
								},
								onDetail: (v) => {
									const next = [...draft.realms];
									next[i] = {
										...next[i],
										description: v
									};
									setRealms(next);
								},
								onRemove: () => {
									setRealms(draft.realms.filter((_, idx) => idx !== i));
								},
								namePlaceholder: `第 ${i + 1} 阶境界名`,
								detailPlaceholder: "突破条件 / 寿命 / 标志…"
							}, i))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.card,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.row,
							style: { justifyContent: "space-between" },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.cardTitle,
								children: [
									"地理区域（",
									draft.regions.length,
									"）"
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
								onClick: () => {
									setRegions([...draft.regions, {
										name: "",
										description: ""
									}]);
								},
								children: "＋ 新增区域"
							})]
						}), draft.regions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.meta,
							children: "暂无地理区域 — 大陆 / 海域 / 秘境 / 遗迹…"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: draft.regions.map((region, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditableRow, {
								name: region.name,
								detail: region.description,
								onName: (v) => {
									const next = [...draft.regions];
									next[i] = {
										...next[i],
										name: v
									};
									setRegions(next);
								},
								onDetail: (v) => {
									const next = [...draft.regions];
									next[i] = {
										...next[i],
										description: v
									};
									setRegions(next);
								},
								onRemove: () => {
									setRegions(draft.regions.filter((_, idx) => idx !== i));
								},
								namePlaceholder: "区域名（如大荒 / 青云山脉）",
								detailPlaceholder: "描述…"
							}, i))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.card,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.row,
							style: { justifyContent: "space-between" },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.cardTitle,
								children: [
									"势力分布（",
									draft.factions.length,
									"）"
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
								onClick: () => {
									setFactions([...draft.factions, {
										name: "",
										kind: "宗门",
										description: ""
									}]);
								},
								children: "＋ 新增势力"
							})]
						}), draft.factions.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.meta,
							children: "暂无势力 — 宗门 / 家族 / 王朝 / 组织…"
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 6
							},
							children: draft.factions.map((faction, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EditableRow, {
								name: `${faction.name}（${faction.kind}）`,
								detail: faction.description,
								onName: (v) => {
									const next = [...draft.factions];
									const match = /^(.*)（(.*)）$/.exec(v);
									next[i] = {
										...next[i],
										name: (match?.[1] ?? v).trim(),
										kind: (match?.[2] ?? next[i].kind).trim() || "宗门"
									};
									setFactions(next);
								},
								onDetail: (v) => {
									const next = [...draft.factions];
									next[i] = {
										...next[i],
										description: v
									};
									setFactions(next);
								},
								onRemove: () => {
									setFactions(draft.factions.filter((_, idx) => idx !== i));
								},
								namePlaceholder: "势力名（类型）如：青云宗（宗门）",
								detailPlaceholder: "描述…"
							}, i))
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/views.tsx
		/** 统计格：状态摘要条 / 资产健康通用。 */
		function StatCell(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.assetStat,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.assetStatLabel,
						children: props.label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.assetStatValue,
						style: {
							color: props.valueColor,
							fontSize: props.valueFontSize
						},
						children: props.value
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.assetStatDetail,
						title: props.detailTitle,
						children: props.detail
					})
				]
			});
		}
		/** 待办队列行。 */
		function TodoRow(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${panel_module_css_default.todoItem} ${props.tone === "danger" ? panel_module_css_default.todoDanger : props.tone === "warning" ? panel_module_css_default.todoWarning : panel_module_css_default.todoInfo}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default.todoText,
					children: [props.title, props.description !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: panel_module_css_default.meta,
						children: [" — ", props.description]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
					disabled: props.disabled,
					onClick: props.onAction,
					children: props.actionLabel
				})]
			});
		}
		/** 全书质检问题行。 */
		function AuditIssueRow(props) {
			const { issue } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `${panel_module_css_default.todoItem} ${issue.severity === "high" ? panel_module_css_default.todoDanger : issue.severity === "medium" ? panel_module_css_default.todoWarning : panel_module_css_default.todoInfo}`,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default.todoText,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
						issue.chapterNo > 0 ? `第 ${issue.chapterNo} 章` : "未定位章节",
						" · [",
						issue.severity,
						"] ",
						issue.item
					] }), issue.suggestion !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: panel_module_css_default.meta,
						children: ["建议：", issue.suggestion]
					})]
				}), issue.chapterNo > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
					disabled: props.disabled,
					onClick: props.onFix,
					children: "去修订"
				})]
			});
		}
		/** 剧情线卡片（列表主体）。 */
		function PlotlineCard(props) {
			const { line } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					border: "1px solid var(--nf-border)",
					borderRadius: 10,
					padding: "8px 12px",
					fontSize: 12,
					display: "flex",
					flexDirection: "column",
					gap: 4
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						style: {
							justifyContent: "space-between",
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6,
								flexWrap: "wrap"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: line.name }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									style: {
										borderColor: "var(--nf-accent)",
										color: "var(--nf-accent)"
									},
									children: kindLabel(line.kind)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									style: {
										borderColor: plotlineStatusColor(line.status),
										color: plotlineStatusColor(line.status)
									},
									children: plotlineStatusLabel(line.status)
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								gap: 6
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
									disabled: props.disabled,
									onClick: props.onRefresh,
									title: "AI 结合编年录与章节摘要，自动更新这条线的当前进度",
									children: "↻ AI 刷新进度"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
									disabled: props.disabled,
									onClick: props.onEdit,
									children: tt("plotlines.edit")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
									disabled: props.disabled,
									onClick: props.onRemove,
									children: tt("plotlines.remove")
								})
							]
						})]
					}),
					line.goal !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [tt("plotlines.goal"), "："] }), line.goal]
					}),
					line.progress !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [tt("plotlines.progress"), "："] }), line.progress]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						children: [
							tt("plotlines.chapters"),
							"：",
							line.chapters.length > 0 ? line.chapters.map((n) => `第${n}章`).join("、") : "—"
						]
					})
				]
			}, line.id);
		}
		/** AI 候选角色行（提炼结果，可采纳/修改后采纳）。 */
		function RoleCandidateRow(props) {
			const { candidate: r } = props;
			const label = ROLE_LABELS[r.roleLabel] ?? r.roleLabel;
			const color = roleColor(r.roleLabel);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					border: "1px solid var(--nf-border)",
					borderRadius: 8,
					padding: "6px 10px",
					fontSize: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						style: {
							justifyContent: "space-between",
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6,
								flexWrap: "wrap"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: r.name }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									style: {
										borderColor: color,
										color
									},
									children: label
								}),
								r.identity !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.meta,
									children: r.identity
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
								disabled: props.disabled,
								onClick: props.onAdopt,
								children: "＋ 采纳"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
								disabled: props.disabled,
								onClick: props.onEdit,
								title: "修改后再采纳（候选列表保留）",
								children: "✏️ 修改后采纳"
							})]
						})]
					}),
					r.goals !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						children: ["目标：", r.goals]
					}),
					r.relations.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						children: ["关系：", r.relations.join("、")]
					})
				]
			}, r.name);
		}
		/** 已收录角色卡（含从编年录刷新的当前状态行）。 */
		function RoleCard(props) {
			const { role: r, status: st } = props;
			const label = ROLE_LABELS[r.roleLabel] ?? r.roleLabel;
			const color = roleColor(r.roleLabel);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					border: "1px solid var(--nf-border)",
					borderRadius: 8,
					padding: "6px 10px",
					fontSize: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						style: {
							justifyContent: "space-between",
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 6,
								flexWrap: "wrap"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: r.name }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									style: {
										borderColor: color,
										color
									},
									children: label
								}),
								r.identity !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.meta,
									children: r.identity
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								gap: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
								disabled: props.disabled,
								onClick: props.onEdit,
								children: "编辑"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
								disabled: props.disabled,
								onClick: props.onRemove,
								children: "删除"
							})]
						})]
					}),
					r.goals !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						children: ["目标：", r.goals]
					}),
					st !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						style: { color: "var(--nf-accent)" },
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "当前状态：" }),
							st.status !== "" ? st.status : "（编年录暂无该角色记录）",
							" · 出场 ",
							st.appearances,
							" 次 · 最近 第 ",
							st.lastChapter,
							" 章"
						]
					}),
					r.relations.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						children: ["关系：", r.relations.join("、")]
					}),
					r.arc.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						children: ["成长线：", r.arc.join(" → ")]
					}),
					r.knowledge.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						children: ["知情度：", r.knowledge.join("；")]
					})
				]
			}, r.name);
		}
		/** 🩺 剧情健康检查报告面板。 */
		function PlotlineHealthPanel(props) {
			const { report } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					border: "1px solid var(--nf-info)",
					borderRadius: 12,
					padding: 10
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						style: {
							justifyContent: "space-between",
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "🩺 剧情健康检查" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
								disabled: props.disabled,
								onClick: props.onPlan,
								title: "基于本次诊断生成下一阶段剧情方案",
								children: "✨ 基于此设计方案"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
								onClick: props.onClose,
								children: "收起"
							})]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							fontSize: 12,
							fontWeight: 700,
							color: "var(--nf-accent)"
						},
						children: ["判定：", report.verdict]
					}),
					report.timing !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "建议时机：" }), report.timing]
					}),
					report.reasons.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 2,
							fontSize: 12
						},
						children: report.reasons.map((r, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.meta,
							children: ["· ", r]
						}, i))
					}),
					report.lines.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 4,
							fontSize: 12
						},
						children: report.lines.map((l, i) => {
							const color = l.health === "ok" ? "var(--nf-success)" : l.health === "warning" ? "var(--nf-warn)" : "var(--nf-error)";
							const label = l.health === "ok" ? "健康" : l.health === "warning" ? "预警" : "搁置过久";
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									gap: 8,
									alignItems: "flex-start"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									style: {
										borderColor: color,
										color,
										flex: "none",
										marginTop: 1
									},
									children: label
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.meta,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: l.name }),
										"：",
										l.note
									]
								})]
							}, i);
						})
					})
				]
			});
		}
		/** ✨ AI 剧情方案面板。 */
		function PlotlinePlanPanel(props) {
			const { plan } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					border: "1px solid var(--nf-accent)",
					borderRadius: 12,
					padding: 10
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						style: {
							justifyContent: "space-between",
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "✨ AI 剧情方案" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
							onClick: props.onClose,
							children: "收起"
						})]
					}),
					plan.direction !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.meta,
						style: { fontSize: 12 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "下一阶段方向：" }), plan.direction]
					}),
					plan.suggestions.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: 4,
							fontSize: 12
						},
						children: plan.suggestions.map((s, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								border: "1px solid var(--nf-border)",
								borderRadius: 8,
								padding: "6px 10px"
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.row,
									style: {
										justifyContent: "space-between",
										flexWrap: "wrap"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: 6,
											flexWrap: "wrap"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: s.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.badge,
											style: {
												borderColor: "var(--nf-accent)",
												color: "var(--nf-accent)"
											},
											children: kindLabel(s.kind)
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
										disabled: props.disabled,
										onClick: () => {
											props.onAdopt(s);
										},
										children: "＋ 采纳"
									})]
								}),
								s.goal !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.meta,
									children: s.goal
								}),
								s.progress !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.meta,
									children: ["初始进度：", s.progress]
								})
							]
						}, i))
					})
				]
			});
		}
		/** ✨ AI 建议剧情线面板。 */
		function PlotlineSuggestionPanel(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					border: "1px solid var(--nf-info)",
					borderRadius: 12,
					padding: 10
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.row,
						style: {
							justifyContent: "space-between",
							flexWrap: "wrap"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
							"✨ AI 建议（",
							props.suggestions.length,
							" 条）"
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
							onClick: props.onClose,
							children: "收起"
						})]
					}),
					props.suggestions.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.meta,
						children: "没有候选线。"
					}),
					props.suggestions.map((s, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							border: "1px solid var(--nf-border)",
							borderRadius: 8,
							padding: "6px 10px",
							fontSize: 12
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.row,
							style: {
								justifyContent: "space-between",
								flexWrap: "wrap"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: 6,
									flexWrap: "wrap"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: s.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									style: {
										borderColor: "var(--nf-accent)",
										color: "var(--nf-accent)"
									},
									children: kindLabel(s.kind)
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
								disabled: props.disabled,
								onClick: () => {
									props.onAdopt(s);
								},
								children: "＋ 采纳"
							})]
						}), s.goal !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.meta,
							children: s.goal
						})]
					}, i))
				]
			});
		}
		//#endregion
		//#region src/client/panel/NovelPanel.tsx
		/**
		* The novel-forge workbench panel: tabs — 工作流 (guided pipeline), 大纲
		* (outline), 章节 (chapter plan + per-chapter write/review/rewrite/polish),
		* 设定库 (story bible), 伏笔 (foreshadows), 设置 (config). Generation and
		* review streams land in the progress console.
		*/
		/** The navigation groups (AI-Novel-Writing-Assistant style grouping). */
		const NAV_GROUPS = [
			{
				id: "create",
				label: "创作",
				items: [
					{
						id: "workflow",
						label: tt("tab.workflow"),
						icon: "🛠️"
					},
					{
						id: "overview",
						label: tt("tab.overview"),
						icon: "📄"
					},
					{
						id: "blurb",
						label: "卷首语",
						icon: "📖"
					},
					{
						id: "plan",
						label: tt("tab.plan"),
						icon: "📚"
					},
					{
						id: "plotlines",
						label: tt("tab.plotlines"),
						icon: "🧵"
					}
				]
			},
			{
				id: "tools",
				label: "工具",
				items: [{
					id: "assistant",
					label: tt("tab.assistant"),
					icon: "💬"
				}, {
					id: "progress",
					label: "工作进度",
					icon: "📊"
				}]
			},
			{
				id: "db",
				label: "数据库",
				items: [
					{
						id: "bible",
						label: tt("tab.bible"),
						icon: "📖"
					},
					{
						id: "world",
						label: "大世界",
						icon: "🌍"
					},
					{
						id: "roles",
						label: "角色库",
						icon: "👥"
					},
					{
						id: "foreshadow",
						label: tt("tab.foreshadow"),
						icon: "🔮"
					},
					{
						id: "facts",
						label: tt("tab.facts"),
						icon: "📜"
					},
					{
						id: "reviews",
						label: "复盘记录",
						icon: "📋"
					},
					{
						id: "assetsGenre",
						label: "题材基底",
						icon: "🏷️"
					},
					{
						id: "assetsProgression",
						label: "推进模式",
						icon: "📈"
					},
					{
						id: "assetsTemplates",
						label: "笔法帖",
						icon: "🖋️"
					},
					{
						id: "assetsRules",
						label: "文戒",
						icon: "🚫"
					},
					{
						id: "assetsStyle",
						label: "心法",
						icon: "🎨"
					}
				]
			}
		];
		/** Settings tab — pinned to the bottom of the nav rail. */
		const SETTINGS_TAB = {
			id: "settings",
			label: tt("tab.settings"),
			icon: "⚙️"
		};
		const PLUGIN_VERSION = "1.1.6";
		/** GitHub 仓库地址（关于区块点击跳转）。 */
		const REPO_URL = "https://github.com/watersxya/dsh-novel-forge";
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
		/**
		* Paragraph-level LCS diff between an original chapter body and its
		* rewrite/polish draft. Adjacent delete+add runs merge into "change" pairs
		* (the common case: a reworded paragraph shown as old → new).
		*/
		function paragraphDiff(oldText, newText) {
			const split = (t) => t.replace(/^#\s+.*$/m, "").trim().split(/\n{2,}/).map((p) => p.trim()).filter((p) => p !== "");
			const a = split(oldText);
			const b = split(newText);
			const n = a.length;
			const m = b.length;
			const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
			for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
			const rows = [];
			let i = 0;
			let j = 0;
			while (i < n || j < m) if (i < n && j < m && a[i] === b[j]) {
				rows.push({
					kind: "same",
					text: a[i]
				});
				i++;
				j++;
			} else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
				rows.push({
					kind: "del",
					text: a[i]
				});
				i++;
			} else if (j < m) {
				rows.push({
					kind: "add",
					text: b[j]
				});
				j++;
			} else if (i < n) {
				rows.push({
					kind: "del",
					text: a[i]
				});
				i++;
			} else {
				rows.push({
					kind: "add",
					text: b[j]
				});
				j++;
			}
			const merged = [];
			let k = 0;
			while (k < rows.length) {
				const row = rows[k];
				if (row.kind !== "del" && row.kind !== "add") {
					merged.push(row);
					k++;
					continue;
				}
				const dels = [];
				const adds = [];
				while (k < rows.length && (rows[k].kind === "del" || rows[k].kind === "add")) {
					if (rows[k].kind === "del") dels.push(rows[k].text);
					else adds.push(rows[k].text);
					k++;
				}
				if (dels.length > 0 && adds.length > 0) merged.push({
					kind: "change",
					old: dels.join("\n\n"),
					neu: adds.join("\n\n")
				});
				else if (dels.length > 0) for (const d of dels) merged.push({
					kind: "del",
					text: d
				});
				else for (const ad of adds) merged.push({
					kind: "add",
					text: ad
				});
			}
			return merged;
		}
		/** 把章节 beats 按结构标签渲染（本章目标/剧情要点/爽点/结尾钩子 等）。 */
		function renderBeats(beats) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 2
				},
				children: beats.split("\n").map((line, i) => {
					const trimmed = line.trim();
					const match = /^([^：:]{2,14})[：:]/.exec(trimmed);
					if (match !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", {
						style: { color: "var(--nf-accent)" },
						children: match[1]
					}), trimmed.slice(match[0].length)] }, i);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: line }, i);
				})
			});
		}
		/** The diff list of a draft-vs-original comparison (scrollable). */
		function DiffList({ original, draft, fontSize }) {
			const rows = (0, react.useMemo)(() => paragraphDiff(original, draft), [original, draft]);
			const changed = rows.filter((r) => r.kind === "change").length;
			const added = rows.filter((r) => r.kind === "add").length;
			const removed = rows.filter((r) => r.kind === "del").length;
			const [onlyChanges, setOnlyChanges] = (0, react.useState)(false);
			const shown = onlyChanges ? rows.filter((r) => r.kind !== "same") : rows;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.diffLegend,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.legendOld,
						children: "■ 原稿"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.legendNew,
						children: "■ 新稿"
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: panel_module_css_default.meta,
						children: [
							"原 ",
							original.length,
							" 字 → 新 ",
							draft.length,
							" 字 · 修改 ",
							changed,
							" · 新增 ",
							added,
							" · 删除 ",
							removed
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: panel_module_css_default.onlyChanges,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: onlyChanges,
							onChange: (e) => {
								setOnlyChanges(e.target.checked);
							}
						}), "只看改动"]
					})
				]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.diffList,
				style: fontSize !== void 0 ? { fontSize } : void 0,
				children: shown.map((row, idx) => {
					if (row.kind === "same") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
						className: panel_module_css_default.diffSame,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
							"第 ",
							idx + 1,
							" 段 · 未改动（点击展开）"
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.diffSameBody,
							children: row.text
						})]
					}, idx);
					if (row.kind === "change") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.diffChange,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.diffColumn,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.diffTagOld,
								children: "原稿"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.diffOld,
								children: row.old
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.diffColumn,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.diffTagNew,
								children: "新稿"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.diffNew,
								children: row.neu
							})]
						})]
					}, idx);
					if (row.kind === "del") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.diffDel,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.diffTagOld,
							children: "原稿"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.diffText,
							children: row.text
						})]
					}, idx);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.diffAdd,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.diffTagNew,
							children: "新稿"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.diffText,
							children: row.text
						})]
					}, idx);
				})
			})] });
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
			/** 复盘记录页：当前展开的章节号。 */
			const [expandedReviewChapter, setExpandedReviewChapter] = (0, react.useState)(null);
			const [chapterText, setChapterText] = (0, react.useState)("");
			const progressId = (0, react.useRef)(0);
			/** id of the single live progress row (generation counter), if any. */
			const liveProgressId = (0, react.useRef)(null);
			/** last chars value rendered into the live row (throttle for streaming). */
			const lastDeltaChars = (0, react.useRef)(0);
			/** cumulative chars received this job (delta frames carry increments). */
			const liveChars = (0, react.useRef)(0);
			/** chapter no of the job currently streaming (delta frames carry no `no`). */
			const currentJobNo = (0, react.useRef)(0);
			/** prominent top-of-panel progress bar while a chapter is being written. */
			const [liveBar, setLiveBar] = (0, react.useState)(null);
			/** 润色/修订工作区：左栏原文（可选中局部目标）+ 右栏指令/预览/应用。 */
			const [workspace, setWorkspace] = (0, react.useState)(null);
			/** 工作区左栏当前选中的文字（局部修订目标）。 */
			const [wsSelected, setWsSelected] = (0, react.useState)("");
			/** 工作区预览区：diff 对比视图开关。 */
			const [wsShowDiff, setWsShowDiff] = (0, react.useState)(false);
			/** 工作区原文 textarea 引用（用于捕获选中文字）。 */
			const wsEditorRef = (0, react.useRef)(null);
			/** 工作区：手动编辑后的 AI 审查结果（不落盘）。 */
			const [wsCheckReport, setWsCheckReport] = (0, react.useState)(null);
			/** 手动审查结果中作者勾选要修复的问题（issue 下标）。 */
			const [wsChecked, setWsChecked] = (0, react.useState)([]);
			/** 编辑页字号（localStorage 记忆，仅影响显示）。 */
			const [editorFontSize, setEditorFontSize] = (0, react.useState)(() => {
				try {
					const v = Number(window.localStorage.getItem("dsh-novel-forge.editor.fontSize"));
					return v >= 12 && v <= 24 ? v : 14;
				} catch {
					return 14;
				}
			});
			const changeEditorFontSize = (next) => {
				const v = Math.min(24, Math.max(12, next));
				setEditorFontSize(v);
				try {
					window.localStorage.setItem("dsh-novel-forge.editor.fontSize", String(v));
				} catch {}
			};
			/** 面板主题（localStorage 记忆）：'liquid'=iOS 液态玻璃（绿） / 'classic'=经典毛玻璃（蓝） / 'neumorph'=新拟物（浅色）。 */
			const [panelTheme, setPanelTheme] = (0, react.useState)(() => {
				try {
					const v = window.localStorage.getItem("dsh-novel-forge.theme");
					return v === "classic" || v === "neumorph" ? v : "liquid";
				} catch {
					return "liquid";
				}
			});
			const changePanelTheme = (next) => {
				setPanelTheme(next);
				try {
					window.localStorage.setItem("dsh-novel-forge.theme", next);
				} catch {}
			};
			/** 有未采纳草稿的章节号（refresh 后检测到遗留草稿时提示）。 */
			const [draftNo, setDraftNo] = (0, react.useState)(null);
			/** 大纲页「更新大纲」编辑区是否展开。 */
			const [updatingOutline, setUpdatingOutline] = (0, react.useState)(false);
			/** 全书质检结果（null = 未运行）。 */
			const [auditIssues, setAuditIssues] = (0, react.useState)(null);
			/** 角色卡（从事实库聚合）。 */
			const [charCards, setCharCards] = (0, react.useState)(null);
			/** 世界观规则编辑草稿（bible tab，每行一条）。 */
			const [worldRulesDraft, setWorldRulesDraft] = (0, react.useState)("");
			/** 小说简介编辑草稿。 */
			const [blurbDraft, setBlurbDraft] = (0, react.useState)("");
			/** 书名编辑草稿（简介页改名用）。 */
			const [bookNameDraft, setBookNameDraft] = (0, react.useState)("");
			/** 封面 dataUrl（无封面为 null）。 */
			const [coverDataUrl, setCoverDataUrl] = (0, react.useState)(null);
			/** 封面文件选择。 */
			const coverFileRef = (0, react.useRef)(null);
			/** 章节列表按卷折叠（存已折叠的卷号）。 */
			const [collapsedVolumes, setCollapsedVolumes] = (0, react.useState)([]);
			/** 章节页当前选中的卷（'all' = 全部卷显示在一起）。 */
			const [selectedVolume, setSelectedVolume] = (0, react.useState)("all");
			/** 剧情线编辑草稿（null = 未在编辑）。 */
			const [plotlineDraft, setPlotlineDraft] = (0, react.useState)(null);
			/** 角色知情度编辑草稿（角色名 → 文本，每行一条）。 */
			const [knowledgeDraft, setKnowledgeDraft] = (0, react.useState)({});
			/** 角色库：AI 提炼候选（null = 未运行；localStorage 持久化，刷新不丢）。 */
			const [roleCandidates, setRoleCandidates] = (0, react.useState)(() => {
				try {
					const raw = window.localStorage.getItem("dsh-novel-forge.role.candidates");
					if (raw !== null) {
						const parsed = JSON.parse(raw);
						return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
					}
				} catch {}
				return null;
			});
			/** 角色库：编辑草稿（null = 不在编辑）。 */
			const [roleDraft, setRoleDraft] = (0, react.useState)(null);
			/** 角色库候选持久化：提炼/采纳后写回 localStorage。 */
			(0, react.useEffect)(() => {
				try {
					if (roleCandidates !== null && roleCandidates.length > 0) window.localStorage.setItem("dsh-novel-forge.role.candidates", JSON.stringify(roleCandidates));
					else window.localStorage.removeItem("dsh-novel-forge.role.candidates");
				} catch {}
			}, [roleCandidates]);
			/** 全书敏感词检查结果（null = 未运行）。 */
			const [sensHits, setSensHits] = (0, react.useState)(null);
			const [sensScanned, setSensScanned] = (0, react.useState)(0);
			/** AI 建议的剧情线候选（null = 未运行）。 */
			const [plotlineSuggestions, setPlotlineSuggestions] = (0, react.useState)(null);
			/** 剧情健康检查报告（null = 未运行）。 */
			const [plotlineHealth, setPlotlineHealth] = (0, react.useState)(null);
			/** AI 剧情方案（null = 未运行）。 */
			const [plotlinePlan, setPlotlinePlan] = (0, react.useState)(null);
			/** npm 最新版本（更新检测；null = 未检测/检测失败）。 */
			const [npmLatest, setNpmLatest] = (0, react.useState)(null);
			/** 活动输出容器：自动滚动锚点（有新活动时跟随到底部）。 */
			const progressEndRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				progressEndRef.current?.scrollIntoView({
					behavior: "smooth",
					block: "nearest"
				});
			}, [progress]);
			/** 后台检测 npm 最新版本（失败静默，不打扰）。 */
			(0, react.useEffect)(() => {
				let cancelled = false;
				fetch("https://registry.npmjs.org/@waterwx%2Fdsh-novel-forge").then((response) => response.json()).then((data) => {
					if (!cancelled && data["dist-tags"]?.latest !== void 0) setNpmLatest(data["dist-tags"].latest);
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, []);
			/** AI 助手悬浮窗：是否打开。 */
			const [assistantOpen, setAssistantOpen] = (0, react.useState)(false);
			/** 工作进度悬浮窗：是否打开。 */
			const [progressOpen, setProgressOpen] = (0, react.useState)(false);
			/** 工作进度悬浮窗位置（localStorage 记忆）。 */
			const [progressPos, setProgressPos] = (0, react.useState)(() => {
				try {
					const raw = window.localStorage.getItem("dsh-novel-forge.progress.float");
					if (raw !== null) {
						const parsed = JSON.parse(raw);
						return {
							x: typeof parsed.x === "number" ? parsed.x : 60,
							y: typeof parsed.y === "number" ? parsed.y : 120
						};
					}
				} catch {}
				return {
					x: 60,
					y: 120
				};
			});
			/** 工作进度悬浮窗尺寸（localStorage 记忆）。 */
			const [progressSize, setProgressSize] = (0, react.useState)(() => {
				try {
					const raw = window.localStorage.getItem("dsh-novel-forge.progress.size");
					if (raw !== null) {
						const parsed = JSON.parse(raw);
						return {
							w: typeof parsed.w === "number" ? parsed.w : 460,
							h: typeof parsed.h === "number" ? parsed.h : 420
						};
					}
				} catch {}
				return {
					w: 460,
					h: 420
				};
			});
			/** 悬浮窗位置（相对面板，localStorage 记忆）。 */
			const [assistantPos, setAssistantPos] = (0, react.useState)(() => {
				try {
					const raw = window.localStorage.getItem("dsh-novel-forge.assistant.float");
					if (raw !== null) {
						const parsed = JSON.parse(raw);
						return {
							x: typeof parsed.x === "number" ? parsed.x : 260,
							y: typeof parsed.y === "number" ? parsed.y : 60
						};
					}
				} catch {}
				return {
					x: 260,
					y: 60
				};
			});
			/** 悬浮窗尺寸（localStorage 记忆）。 */
			const [assistantSize, setAssistantSize] = (0, react.useState)(() => {
				try {
					const raw = window.localStorage.getItem("dsh-novel-forge.assistant.size");
					if (raw !== null) {
						const parsed = JSON.parse(raw);
						return {
							w: typeof parsed.w === "number" ? parsed.w : 420,
							h: typeof parsed.h === "number" ? parsed.h : 460
						};
					}
				} catch {}
				return {
					w: 420,
					h: 460
				};
			});
			/** 拖拽/缩放状态（target 区分 AI 助手 / 工作进度两个悬浮窗）。 */
			const dragState = (0, react.useRef)(null);
			/** 悬浮窗位置/尺寸持久化。 */
			(0, react.useEffect)(() => {
				try {
					window.localStorage.setItem("dsh-novel-forge.assistant.float", JSON.stringify(assistantPos));
					window.localStorage.setItem("dsh-novel-forge.assistant.size", JSON.stringify(assistantSize));
					window.localStorage.setItem("dsh-novel-forge.progress.float", JSON.stringify(progressPos));
					window.localStorage.setItem("dsh-novel-forge.progress.size", JSON.stringify(progressSize));
				} catch {}
			}, [
				assistantPos,
				assistantSize,
				progressPos,
				progressSize
			]);
			/** 全局拖拽/缩放监听（挂一次，靠 dragState 判断）。 */
			(0, react.useEffect)(() => {
				const onMove = (e) => {
					const s = dragState.current;
					if (s === null) return;
					if (s.type === "move") {
						const next = {
							x: Math.max(-340, Math.min(s.origX + e.clientX - s.startX, 3e3)),
							y: Math.max(0, Math.min(s.origY + e.clientY - s.startY, 3e3))
						};
						if (s.target === "assistant") setAssistantPos(next);
						else setProgressPos(next);
					} else {
						const next = {
							w: Math.max(320, Math.min(s.origW + e.clientX - s.startX, 1400)),
							h: Math.max(220, Math.min(s.origH + e.clientY - s.startY, 1200))
						};
						if (s.target === "assistant") setAssistantSize(next);
						else setProgressSize(next);
					}
				};
				const onUp = () => {
					dragState.current = null;
				};
				window.addEventListener("mousemove", onMove);
				window.addEventListener("mouseup", onUp);
				return () => {
					window.removeEventListener("mousemove", onMove);
					window.removeEventListener("mouseup", onUp);
				};
			}, []);
			/** 左侧导航折叠状态（localStorage 记忆，参照 AI-Novel-Writing-Assistant 侧边栏）。 */
			const [navCollapsed, setNavCollapsed] = (0, react.useState)(() => {
				try {
					return window.localStorage.getItem("dsh-novel-forge.nav.collapsed") === "true";
				} catch {
					return false;
				}
			});
			/** 视图：shelf = 书架首页；create = 开书向导；workspace = 当前书工作台。 */
			const [viewMode, setViewMode] = (0, react.useState)("shelf");
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
			/** Update the single live progress row in place (create it on first call). */
			const setLiveProgress = (0, react.useCallback)((text, ratio) => {
				setProgress((prev) => {
					if (liveProgressId.current !== null) return prev.map((l) => l.id === liveProgressId.current ? {
						...l,
						text,
						ratio
					} : l);
					const id = progressId.current++;
					liveProgressId.current = id;
					return [...prev.slice(-300), {
						id,
						text,
						kind: "info",
						live: true,
						ratio
					}];
				});
			}, []);
			/** Remove the live progress row (a job finished / failed). */
			const clearLiveProgress = (0, react.useCallback)(() => {
				if (liveProgressId.current === null) return;
				const id = liveProgressId.current;
				liveProgressId.current = null;
				setProgress((prev) => prev.filter((l) => l.id !== id));
			}, []);
			/** Refresh status (config + project + files). */
			const refresh = (0, react.useCallback)(async (showError = true, forceOutline = false) => {
				try {
					const status = await api.status();
					setConfig(status.config);
					setConfigDraft(status.config);
					setProject(status.project ?? null);
					if (status.project?.roleStatus !== void 0) setCharCards(status.project.roleStatus);
					else setCharCards(null);
					setGeneratedFiles(status.generatedFiles);
					const withDraft = status.project?.chapters.find((c) => c.pendingDraft !== void 0 && c.pendingDraft !== "");
					setDraftNo(withDraft?.no ?? null);
					const nextOutline = status.project?.outline;
					if (forceOutline || nextOutline !== void 0 && outlineText === "") setOutlineText(nextOutline ?? "");
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
			/** 进入简介页时预填已保存的简介。 */
			(0, react.useEffect)(() => {
				if (activeTab === "blurb") {
					if (blurbDraft === "" && project?.blurb !== void 0 && project.blurb !== "") setBlurbDraft(project.blurb);
					if (bookNameDraft === "" && project?.bookName !== void 0 && project.bookName !== "") setBookNameDraft(project.bookName);
					loadCover();
				}
			}, [
				activeTab,
				project?.blurb,
				project?.bookName
			]);
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
			/** 大纲页「更新大纲」展开/收起（展开时预填当前大纲文本）。 */
			const handleToggleUpdateOutline = () => {
				if (!updatingOutline && project !== null) setOutlineText(project.outline);
				setUpdatingOutline((v) => !v);
			};
			/** 重置项目：清空全部进度，从新大纲重新开始（二次确认）。 */
			const handleResetProject = async () => {
				if (project === null) return;
				if (!window.confirm("将清空本书全部进度（道藏/卷计划/章节计划/已生成章节/暗线/写作资产/编年录），且不可恢复。确定用新总纲重置？")) return;
				setBusy(true);
				setError("");
				try {
					const result = await api.reset(outlineText);
					setUpdatingOutline(false);
					pushProgress(`已重置项目：${result.bookName}（从新大纲重新开始）`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`重置失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
					await refresh(false);
				}
			};
			/** 全书一致性质检（LLM 扫描已生成章节）。 */
			const handleAudit = async () => {
				setBusy(true);
				setBusyLabel("全书一致性质检中…");
				setError("");
				try {
					const result = await api.audit();
					setAuditIssues(result.issues);
					pushProgress(result.issues.length === 0 ? `全书质检完成：${result.auditedChapters} 章未发现矛盾 🎉` : `全书质检完成：发现 ${result.issues.length} 处疑似矛盾`, result.issues.length === 0 ? "done" : "error");
				} catch (err) {
					setError(err.message);
					pushProgress(`全书质检失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 角色卡刷新。 */
			const handleCharactersRefresh = async () => {
				setBusy(true);
				setBusyLabel("聚合角色状态中…");
				setError("");
				try {
					const result = await api.charactersRefresh();
					setCharCards(result.cards);
					setProject((prev) => prev === null ? prev : {
						...prev,
						roleStatus: result.cards,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					pushProgress(`角色状态已刷新：${result.cards.length} 个角色`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`角色状态刷新失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 事实库回填（历史章节批量抽取）。 */
			const handleFactsBackfill = async () => {
				if (doneCount === 0) return;
				setBusy(true);
				setBusyLabel("回填历史章节事实中…");
				setError("");
				try {
					const result = await api.factsBackfill();
					pushProgress(result.filled > 0 ? `事实库回填完成：${result.filled} 章已抽取事实` : "事实库无需回填（所有章节都已有事实记录）", "done");
					await refresh(false);
				} catch (err) {
					setError(err.message);
					pushProgress(`事实库回填失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 章节复位：generating 卡死 → pending（可重新生成）。 */
			const handleChapterReset = async (no) => {
				setBusy(true);
				setError("");
				try {
					await api.chapterReset(no);
					setProject((prev) => prev === null ? prev : {
						...prev,
						chapters: prev.chapters.map((c) => c.no === no ? {
							...c,
							status: "pending",
							error: void 0
						} : c)
					});
					pushProgress(`第 ${no} 章已复位为待生成，可重新生成`, "info");
				} catch (err) {
					setError(err.message);
					pushProgress(`复位失败：${err.message}`, "error");
				} finally {
					setBusy(false);
				}
			};
			/** 章节直接通过（作者行使最终决定权）。 */
			const handleChapterApprove = async (no) => {
				if (!window.confirm(`确定直接通过第 ${no} 章？（跳过审稿判定，保留审稿记录）`)) return;
				setBusy(true);
				setError("");
				try {
					await api.chapterApprove(no);
					setProject((prev) => prev === null ? prev : {
						...prev,
						chapters: prev.chapters.map((c) => c.no === no ? {
							...c,
							status: "approved"
						} : c)
					});
					pushProgress(`第 ${no} 章已直接通过`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`操作失败：${err.message}`, "error");
				} finally {
					setBusy(false);
				}
			};
			/** 剧情线：保存草稿（新增或更新）。 */
			const handlePlotlineSave = async () => {
				if (plotlineDraft === null) return;
				const line = {
					id: plotlineDraft.id,
					name: plotlineDraft.name.trim(),
					kind: plotlineDraft.kind,
					goal: plotlineDraft.goal.trim(),
					progress: plotlineDraft.progress.trim(),
					status: plotlineDraft.status,
					chapters: plotlineDraft.id !== "" ? project?.plotlines?.find((l) => l.id === plotlineDraft.id)?.chapters ?? [] : [],
					createdAt: plotlineDraft.id !== "" ? project?.plotlines?.find((l) => l.id === plotlineDraft.id)?.createdAt ?? (/* @__PURE__ */ new Date()).toISOString() : (/* @__PURE__ */ new Date()).toISOString()
				};
				if (line.name === "") {
					setError("剧情线名称不能为空");
					return;
				}
				setBusy(true);
				setError("");
				try {
					const result = await api.plotlines({
						op: plotlineDraft.id !== "" ? "update" : "add",
						line
					});
					setProject((prev) => prev === null ? prev : {
						...prev,
						plotlines: result.plotlines,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					setPlotlineDraft(null);
					pushProgress(plotlineDraft.id !== "" ? `剧情线已更新：${line.name}` : `剧情线已创建：${line.name}`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`保存剧情线失败：${err.message}`, "error");
				} finally {
					setBusy(false);
				}
			};
			/** 剧情线：删除。 */
			const handlePlotlineRemove = async (id) => {
				if (!window.confirm("确定删除这条剧情线？关联章节记录会一并移除。")) return;
				setBusy(true);
				setError("");
				try {
					const result = await api.plotlines({
						op: "remove",
						id
					});
					setProject((prev) => prev === null ? prev : {
						...prev,
						plotlines: result.plotlines,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					pushProgress("剧情线已删除", "done");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 剧情线：AI 建议候选线。 */
			const handlePlotlineSuggest = async () => {
				setBusy(true);
				setBusyLabel("AI 分析剧情线中…");
				setError("");
				try {
					const result = await api.plotlines({ op: "suggest" });
					setPlotlineSuggestions(result.suggestions ?? []);
					pushProgress(result.suggestions !== void 0 && result.suggestions.length > 0 ? `AI 建议了 ${result.suggestions.length} 条剧情线，可逐条采纳` : "AI 没有给出剧情线建议，请检查大纲是否已加载", "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`AI 建议剧情线失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 剧情线：采纳一条 AI 建议。 */
			const handlePlotlineAdopt = async (suggestion) => {
				setBusy(true);
				setError("");
				try {
					const result = await api.plotlines({
						op: "add",
						line: {
							...suggestion,
							id: ""
						}
					});
					setProject((prev) => prev === null ? prev : {
						...prev,
						plotlines: result.plotlines,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					setPlotlineSuggestions((prev) => prev === null ? prev : prev.filter((s) => s !== suggestion));
					pushProgress(`已采纳剧情线：${suggestion.name}`, "done");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 剧情线：AI 刷新单条线进度。 */
			const handlePlotlineRefresh = async (id) => {
				setBusy(true);
				setBusyLabel("AI 刷新剧情线进度中…");
				setError("");
				try {
					const result = await api.plotlines({
						op: "refresh",
						id
					});
					setProject((prev) => prev === null ? prev : {
						...prev,
						plotlines: result.plotlines,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					const line = result.plotlines.find((l) => l.id === id);
					pushProgress(`剧情线进度已刷新：${line?.progress ?? ""}`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`刷新剧情线进度失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 🩺 剧情健康检查：判断是否需要新线、多少章后添加。 */
			const handlePlotlineHealth = async () => {
				setBusy(true);
				setBusyLabel("🩺 剧情健康检查中…");
				setError("");
				try {
					const result = await api.plotlines({ op: "health" });
					setPlotlineHealth(result.health ?? null);
					pushProgress(`剧情健康检查完成：${result.health?.verdict ?? "无结论"}`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`剧情健康检查失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** ✨ AI 设计剧情方案：下一阶段方向 + 建议新线（含健康检查）。 */
			const handlePlotlinePlan = async () => {
				setBusy(true);
				setBusyLabel("✨ 设计剧情方案中…");
				setError("");
				try {
					const result = await api.plotlines({ op: "plan" });
					setPlotlineHealth(result.health ?? null);
					setPlotlinePlan(result.plan ?? null);
					pushProgress(`剧情方案已生成：${result.plan?.suggestions.length ?? 0} 条建议新线`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`剧情方案生成失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 采纳方案里的一条建议线。 */
			const handlePlanAdopt = async (suggestion) => {
				setBusy(true);
				setError("");
				try {
					const result = await api.plotlines({
						op: "add",
						line: {
							...suggestion,
							id: ""
						}
					});
					setProject((prev) => prev === null ? prev : {
						...prev,
						plotlines: result.plotlines,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					setPlotlinePlan((prev) => prev === null ? prev : {
						...prev,
						suggestions: prev.suggestions.filter((s) => s !== suggestion)
					});
					pushProgress(`已采纳剧情线：${suggestion.name}`, "done");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 全书敏感词检查（硬匹配内置词库）。 */
			const handleSensitiveScan = async () => {
				setBusy(true);
				setBusyLabel("敏感词检查中…");
				setError("");
				try {
					const result = await api.sensitiveCheck({ all: true });
					setSensHits(result.hits);
					setSensScanned(result.scannedChapters);
					pushProgress(result.hits.length > 0 ? `敏感词检查：${result.hits.length} 处命中（${new Set(result.hits.map((h) => h.chapterNo)).size} 章受影响）` : `敏感词检查完成：扫描 ${result.scannedChapters} 章，未命中违禁词`, result.hits.length > 0 ? "error" : "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`敏感词检查失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 作者复盘补跑：全书缺失章节（流式）。 */
			const handleAuthorBackfillAll = async () => {
				const missing = chapters.filter((c) => c.status !== "pending" && c.status !== "generating" && c.authorReview === void 0).length;
				setBusy(true);
				setBusyLabel(`补齐历史章节作者复盘（${missing} 章）…`);
				setError("");
				try {
					await api.reviewBackfillAll((frame) => {
						applyJobFrame(frame, () => "");
					});
				} catch (err) {
					setError(err.message);
					pushProgress(`补齐作者复盘失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 作者复盘补跑：单章。 */
			const handleAuthorBackfillChapter = async (no) => {
				setBusy(true);
				setBusyLabel(`生成第 ${no} 章作者复盘…`);
				setError("");
				try {
					const result = await api.reviewBackfillChapter(no);
					setProject((prev) => prev === null ? prev : {
						...prev,
						chapters: prev.chapters.map((c) => c.no === result.no ? {
							...c,
							authorReview: result.review
						} : c)
					});
					const r = result.review;
					pushProgress(`📋 第${no}章作者复盘：钩子${r.hookHonored ? "已兑现 ✓" : "未兑现 ✗"} · 结尾钩子 ${r.endingHook}/10`, r.hookHonored && r.endingHook >= 6 ? "done" : "error");
				} catch (err) {
					setError(err.message);
					pushProgress(`生成第 ${no} 章作者复盘失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 角色库：AI 从全书提炼角色候选。 */
			const handleRolesExtract = async () => {
				setBusy(true);
				setBusyLabel("✨ 提炼角色库中…");
				setError("");
				try {
					const result = await api.roles({ op: "extract" });
					const inLibrary = new Set((project?.roles ?? []).map((r) => r.name));
					const fresh = (result.candidates ?? []).filter((r) => !inLibrary.has(r.name));
					setRoleCandidates((prev) => {
						return [...(prev ?? []).filter((p) => !fresh.some((f) => f.name === p.name)), ...fresh];
					});
					pushProgress(`AI 提炼出 ${fresh.length} 个新角色（已排除 ${(result.candidates?.length ?? 0) - fresh.length} 个已收录）`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`角色提炼失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 角色库：采纳候选（或修改后采纳）。 */
			const handleRoleAdopt = async (role) => {
				setBusy(true);
				setError("");
				try {
					const result = await api.roles({
						op: "adopt",
						role
					});
					setProject((prev) => prev === null ? prev : {
						...prev,
						roles: result.roles,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					setRoleCandidates((prev) => prev === null ? prev : prev.filter((r) => r !== role));
					pushProgress(`已加入角色库：${role.name}`, "done");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 角色库：保存编辑草稿。 */
			const handleRoleSave = async () => {
				if (roleDraft === null) return;
				if (roleDraft.name.trim() === "") {
					setError("角色名不能为空");
					return;
				}
				setBusy(true);
				setError("");
				try {
					const result = await api.roles({
						op: "update",
						role: roleDraft
					});
					setProject((prev) => prev === null ? prev : {
						...prev,
						roles: result.roles,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					setRoleDraft(null);
					pushProgress(`角色已保存：${roleDraft.name}`, "done");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 角色库：删除角色。 */
			const handleRoleRemove = async (name) => {
				if (!window.confirm(`确定从角色库删除「${name}」？`)) return;
				setBusy(true);
				setError("");
				try {
					const result = await api.roles({
						op: "remove",
						name
					});
					setProject((prev) => prev === null ? prev : {
						...prev,
						roles: result.roles,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					pushProgress(`已从角色库删除：${name}`, "info");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 保存世界观规则编辑（bible tab，每行一条）。 */
			const handleSaveWorldRules = async () => {
				if (bible === void 0) return;
				const rules = worldRulesDraft.split("\n").map((line) => line.trim()).filter((line) => line !== "");
				setBusy(true);
				setError("");
				try {
					const result = await api.biblePatch({ worldRules: rules });
					setProject((prev) => prev === null ? prev : {
						...prev,
						bible: result.bible,
						updatedAt: (/* @__PURE__ */ new Date()).toISOString()
					});
					pushProgress(`世界观规则已保存（${rules.length} 条）`, "done");
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 简介：AI 全量生成。 */
			const handleBlurbGenerate = async () => {
				if (project === null) return;
				setBusy(true);
				setBusyLabel("AI 生成简介中…");
				setError("");
				try {
					const result = await api.blurb("generate");
					setBlurbDraft(result.blurb);
					pushProgress(`简介已生成（${result.blurb.length} 字）`, "done");
					await refresh(false);
				} catch (err) {
					setError(err.message);
					pushProgress(`简介生成失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 简介：按已写开头 AI 补全。 */
			const handleBlurbComplete = async () => {
				if (project === null) return;
				if (blurbDraft.trim() === "") return;
				setBusy(true);
				setBusyLabel("AI 补全简介中…");
				setError("");
				try {
					const result = await api.blurb("generate", void 0, blurbDraft);
					setBlurbDraft(result.blurb);
					pushProgress(`简介已补全（${result.blurb.length} 字）`, "done");
					await refresh(false);
				} catch (err) {
					setError(err.message);
					pushProgress(`简介补全失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 简介：手动保存。 */
			const handleBlurbSave = async () => {
				if (project === null) return;
				setBusy(true);
				setError("");
				try {
					const result = await api.blurb("save", blurbDraft);
					pushProgress(`简介已保存（${result.blurb.length} 字）`, "done");
					await refresh(false);
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 加载封面（进入简介页时）。 */
			const loadCover = (0, react.useCallback)(async () => {
				try {
					const result = await api.coverGet();
					setCoverDataUrl(result.dataUrl);
				} catch {}
			}, [api]);
			/** 封面上传（本地预览 + 落盘）。 */
			const handleCoverUpload = (file) => {
				if (file === void 0) return;
				const reader = new FileReader();
				reader.onload = () => {
					const dataUrl = typeof reader.result === "string" ? reader.result : null;
					if (dataUrl === null) return;
					setCoverDataUrl(dataUrl);
					(async () => {
						setBusy(true);
						setError("");
						try {
							await api.coverPost("upload", dataUrl);
							pushProgress(`封面已上传：${file.name}`, "done");
							await refresh(false);
						} catch (err) {
							setError(err.message);
							pushProgress(`封面上传失败：${err.message}`, "error");
							await loadCover();
						} finally {
							setBusy(false);
						}
					})();
				};
				reader.readAsDataURL(file);
			};
			/** 工作区：AI 审查当前编辑的正文（不落盘）。 */
			const handleWsCheck = async () => {
				if (workspace === null) return;
				if (workspace.original.trim().length < 50) {
					setError("正文过短（<50 字），请先编辑内容");
					return;
				}
				setBusy(true);
				setBusyLabel(`AI 审查 第${workspace.no}章`);
				setError("");
				try {
					const result = await api.chapterCheck(workspace.no, workspace.original);
					setWsCheckReport(result.report);
					const highIdx = result.report.issues.map((it, i) => ({
						it,
						i
					})).filter((x) => x.it.severity === "high").map((x) => x.i);
					const mediumIdx = result.report.issues.map((it, i) => ({
						it,
						i
					})).filter((x) => x.it.severity === "medium").map((x) => x.i);
					setWsChecked(highIdx.length > 0 ? highIdx : mediumIdx);
					pushProgress(`审查完成：${result.report.score} 分 — ${result.report.verdict}`, result.report.passed ? "done" : "error");
				} catch (err) {
					setError(err.message);
					pushProgress(`AI 审查失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 工作区：保存手动编辑的正文（备份 .bak；沿用审查报告或自动审稿，保存即出结论）。 */
			const handleWsSave = async () => {
				if (workspace === null) return;
				if (workspace.original.trim().length < 50) {
					setError("正文过短（<50 字），未保存");
					return;
				}
				setBusy(true);
				setError("");
				try {
					const result = await api.chapterSave(workspace.no, workspace.original, wsCheckReport ?? void 0);
					const report = result.report;
					setWorkspace(null);
					setDraftNo(null);
					setWsCheckReport(null);
					setWsChecked([]);
					if (report !== void 0) pushProgress(`已保存并审稿：${report.score} 分 — ${report.verdict}（${report.passed ? "通过" : "未通过"}）`, report.passed ? "done" : "error");
					else pushProgress(`已保存第 ${workspace.no} 章编辑（${result.chars} 字，原稿已备份 .bak）`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`保存失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
					await refresh(false);
				}
			};
			/** 移除封面。 */
			const handleCoverRemove = async () => {
				setBusy(true);
				setError("");
				try {
					await api.coverPost("remove");
					setCoverDataUrl(null);
					pushProgress("封面已移除", "info");
					await refresh(false);
				} catch (err) {
					setError(err.message);
				} finally {
					setBusy(false);
				}
			};
			/** 重命名当前书（同步项目与书架）。 */
			const handleRename = async () => {
				const name = bookNameDraft.trim();
				if (name === "" || project === null || name === project.bookName) return;
				setBusy(true);
				setError("");
				try {
					const result = await api.rename(name);
					pushProgress(`书名已改为《${result.bookName}》`, "done");
					await refresh(false);
					await refreshShelf();
				} catch (err) {
					setError(err.message);
					pushProgress(`改名失败：${err.message}`, "error");
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
					pushProgress(`提炼道藏失败：${err.message}`, "error");
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
					let freshCount = 0;
					setProject((prev) => {
						const base = prev ?? {
							bookName: "",
							outline: outlineText,
							chapters: [],
							foreshadows: [],
							createdAt: (/* @__PURE__ */ new Date()).toISOString(),
							updatedAt: (/* @__PURE__ */ new Date()).toISOString()
						};
						const existingTitles = new Set(base.chapters.map((c) => c.title));
						const fresh = result.chapters.filter((c) => !existingTitles.has(c.title));
						freshCount = fresh.length;
						if (fresh.length === 0) return base;
						return {
							...base,
							chapters: [...base.chapters, ...fresh],
							updatedAt: (/* @__PURE__ */ new Date()).toISOString()
						};
					});
					pushProgress(tt("workflow.planDone", { n: freshCount }), "done");
					if (freshCount < result.chapters.length) pushProgress(`已跳过 ${result.chapters.length - freshCount} 个与已有章节同名的重复章节`, "error");
				} catch (err) {
					setError(err.message);
					pushProgress(`生成章节计划失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
				}
			};
			/** 打开某章的工作区（读取服务器原文；有遗留草稿时预载草稿；可预填修订指令）。 */
			const openWorkspace = (0, react.useCallback)(async (no, instruction) => {
				try {
					const [chapterRes, statusRes] = await Promise.all([api.chapter(no), api.status()]);
					const chapter = statusRes.project?.chapters.find((c) => c.no === no);
					if (chapter === void 0) return;
					let autoInstruction = instruction ?? "";
					if (autoInstruction === "" && chapter.review !== void 0 && !chapter.review.passed) {
						const high = chapter.review.issues.filter((i) => i.severity === "high");
						autoInstruction = "按审稿意见修订（优先处理）：\n" + (high.length > 0 ? high.slice(0, 3) : chapter.review.issues.slice(0, 3)).map((i) => `[${i.severity}] ${i.item} → ${i.suggestion}`).join("\n");
					}
					setWorkspace({
						no,
						title: chapter.title,
						original: chapterRes.markdown,
						instruction: autoInstruction,
						draft: chapter.pendingDraft !== void 0 && chapter.pendingDraft !== "" ? chapter.pendingDraft : null
					});
					setWsSelected("");
					setWsShowDiff(true);
					setWsCheckReport(null);
					setWsChecked([]);
				} catch {}
			}, [api]);
			/** 捕获工作区原文 textarea 中选中的文字（局部修订目标）。 */
			const captureWsSelection = () => {
				const el = wsEditorRef.current;
				if (el === null) return;
				const start = el.selectionStart ?? 0;
				const end = el.selectionEnd ?? 0;
				if (end > start) setWsSelected(el.value.slice(start, end).trim());
				else setWsSelected("");
			};
			/** 工作区：去 AI 味润色（流式 → 预览草稿）。 */
			const handleWsPolish = async () => {
				if (workspace === null) return;
				setBusy(true);
				setBusyLabel(`${tt("plan.polish")} 第${workspace.no}章`);
				setError("");
				try {
					await api.polish(workspace.no, (frame) => {
						applyJobFrame(frame, (n) => tt("progress.polishing", { no: n }));
					});
				} catch (err) {
					setError(err.message);
					pushProgress(`第 ${workspace.no} 章润色失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
					await refresh(false);
				}
			};
			/** 工作区：按指令修订（whole=true 整章，false 仅修订选中片段）。 */
			const handleWsRewrite = async (whole, overrideInstruction) => {
				if (workspace === null) return;
				const target = whole ? "" : wsSelected;
				const instruction = overrideInstruction ?? workspace.instruction;
				setBusy(true);
				setBusyLabel(`${tt("plan.rewrite")} 第${workspace.no}章`);
				setError("");
				try {
					await api.rewrite(workspace.no, instruction, target, (frame) => {
						applyJobFrame(frame, (n) => tt("progress.rewriting", { no: n }));
					});
				} catch (err) {
					setError(err.message);
					pushProgress(`第 ${workspace.no} 章修订失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
					await refresh(false);
				}
			};
			/** 工作区：按审查报告中勾选的问题一键修订（预填指令 + 立即整章修订到草稿）。 */
			const handleWsReviseByReport = async () => {
				if (workspace === null || wsCheckReport === null) return;
				const picked = wsChecked.map((i) => wsCheckReport.issues[i]).filter((it) => it !== void 0).slice(0, 5);
				if (picked.length === 0) return;
				const instruction = "按审稿意见修订（优先处理）：\n" + picked.map((i) => `[${i.severity}] ${i.item} → ${i.suggestion}`).join("\n");
				setWorkspace({
					...workspace,
					instruction
				});
				await handleWsRewrite(true, instruction);
			};
			/** 采纳草稿：覆盖正文文件并刷新。 */
			const handleDraftApply = async (no) => {
				setBusy(true);
				setError("");
				try {
					const result = await api.draftApply(no);
					setWorkspace(null);
					setDraftNo(null);
					pushProgress(`已采纳第 ${no} 章新稿（${result.chars} 字）→ ${result.file}`, "done");
				} catch (err) {
					setError(err.message);
					pushProgress(`采纳第 ${no} 章草稿失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
					await refresh(false);
				}
			};
			/** 放弃草稿：保留原稿，仅清空草稿。 */
			const handleDraftDiscard = async (no) => {
				setBusy(true);
				setError("");
				try {
					await api.draftDiscard(no);
					setWorkspace(null);
					setDraftNo(null);
					pushProgress(`已放弃第 ${no} 章草稿，保留原稿`, "info");
				} catch (err) {
					setError(err.message);
					pushProgress(`放弃第 ${no} 章草稿失败：${err.message}`, "error");
				} finally {
					setBusy(false);
					setBusyLabel("");
					await refresh(false);
				}
			};
			/** Shared frame handler for generate/rewrite/polish streams. */
			const applyJobFrame = (0, react.useCallback)((frame, label) => {
				if (frame.type === "start") {
					clearLiveProgress();
					setLiveBar(null);
					lastDeltaChars.current = 0;
					liveChars.current = 0;
					currentJobNo.current = frame.no;
					setProgressOpen(true);
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
					const chars = liveChars.current += frame.text.length;
					const target = project?.chapters.find((c) => c.no === currentJobNo.current)?.targetChars ?? 0;
					if (chars < 50 || chars - lastDeltaChars.current >= 200) {
						lastDeltaChars.current = chars;
						const text = target > 0 ? `已生成 ${chars} / ${target} 字` : `已生成 ${chars} 字`;
						const ratio = target > 0 ? Math.min(chars / target, 1) : void 0;
						setLiveProgress(text, ratio);
						setLiveBar({
							text,
							ratio
						});
					}
				} else if (frame.type === "done" || frame.type === "rewritten") {
					clearLiveProgress();
					setLiveBar(null);
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
					clearLiveProgress();
					setLiveBar(null);
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
				} else if (frame.type === "author-review") {
					setProject((prev) => prev === null ? prev : {
						...prev,
						chapters: prev.chapters.map((c) => c.no === frame.no ? {
							...c,
							authorReview: frame.review
						} : c)
					});
					const r = frame.review;
					pushProgress(`📋 第${frame.no}章作者复盘：钩子${r.hookHonored ? "已兑现 ✓" : "未兑现 ✗"} · 结尾钩子 ${r.endingHook}/10 · ${r.plotlineProgress !== "" ? r.plotlineProgress : "无实质推进"}`, r.hookHonored && r.endingHook >= 6 ? "done" : r.endingHook < 6 || !r.hookHonored ? "error" : "info");
				} else if (frame.type === "author-backfill-done") {
					clearLiveProgress();
					setLiveBar(null);
					pushProgress(`✅ 历史章节作者复盘补齐完成（共 ${frame.count} 章）`, "done");
					refresh(false);
				} else if (frame.type === "drafted") {
					clearLiveProgress();
					setLiveBar(null);
					setProject((prev) => prev === null ? prev : {
						...prev,
						chapters: prev.chapters.map((c) => c.no === frame.no ? {
							...c,
							pendingDraft: frame.draft
						} : c)
					});
					pushProgress(`第 ${frame.no} 章润色完成（${frame.chars} 字），请查看预览后应用或放弃`);
					setDraftNo(frame.no);
					setWsShowDiff(false);
					setWorkspace((prev) => prev !== null && prev.no === frame.no ? {
						...prev,
						draft: frame.draft
					} : prev);
				} else if (frame.type === "error") {
					clearLiveProgress();
					setLiveBar(null);
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
			}, [
				pushProgress,
				setLiveProgress,
				clearLiveProgress,
				project
			]);
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
			/** Batch-write all remaining chapters in sequence (auto-retry once per chapter). */
			const handleWriteAll = async () => {
				const remaining = chapters.filter((c) => c.status === "pending" || c.status === "error");
				if (remaining.length === 0) return;
				setBusy(true);
				setBusyLabel(`${tt("plan.writeAllPending")}（共 ${remaining.length} 章）`);
				setError("");
				let failed = 0;
				const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
				for (const chapter of remaining) {
					pushProgress(`▶ 开始生成第 ${chapter.no} 章《${chapter.title}》`);
					let lastError = null;
					for (let attempt = 1; attempt <= 2; attempt++) try {
						await api.generate(chapter.no, false, (frame) => {
							applyJobFrame(frame, (n) => tt("progress.generating", {
								no: n,
								title: project?.chapters.find((c) => c.no === n)?.title ?? ""
							}));
						});
						lastError = null;
						break;
					} catch (err) {
						lastError = err;
						if (attempt < 2) {
							pushProgress(`第 ${chapter.no} 章第 ${attempt} 次尝试失败（${err.message}），3 秒后自动重试…`, "error");
							await sleep(3e3);
						}
					}
					if (lastError !== null) {
						failed++;
						pushProgress(`第 ${chapter.no} 章失败：${lastError.message}`, "error");
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
			/** 章节按卷分组（未分卷章节单独一组；章节多时可按卷折叠浏览）。 */
			const chapterGroups = (0, react.useMemo)(() => {
				const groups = [];
				if (volumes !== void 0) for (const v of volumes) {
					const list = chapters.filter((c) => c.volume === v.no);
					if (list.length > 0) groups.push({
						no: v.no,
						title: `第${v.no}卷 · ${v.title}`,
						chapters: list
					});
				}
				const unassigned = chapters.filter((c) => c.volume === 0);
				if (unassigned.length > 0) groups.push({
					no: 0,
					title: "未分卷",
					chapters: unassigned
				});
				if (groups.length === 0) groups.push({
					no: 0,
					title: "全部章节",
					chapters
				});
				return groups;
			}, [chapters, volumes]);
			const approvedCount = chapters.filter((c) => c.status === "approved").length;
			const reviewPendingCount = chapters.filter((c) => c.status === "written" || c.status === "rejected").length;
			const totalChars = chapters.reduce((sum, c) => sum + (c.chars ?? 0), 0);
			const firstChapter = chapters[0];
			const currentVolumeName = (() => {
				if (firstChapter === void 0 || volumes === void 0 || volumes.length === 0) return "—";
				const vol = volumes.find((v) => v.no === firstChapter.volume);
				return vol !== void 0 ? vol.title : `第 ${firstChapter.volume} 卷`;
			})();
			const lastUpdated = project?.updatedAt !== void 0 ? new Date(project.updatedAt).toLocaleString("zh-CN", {
				month: "numeric",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			}) : "—";
			/** 创作旅程 6 阶段（完成/当前/未到）。 */
			const journeyStages = [
				{
					id: "outline",
					label: "大纲",
					done: project !== null
				},
				{
					id: "bible",
					label: "设定",
					done: bible !== void 0
				},
				{
					id: "volumes",
					label: "卷计划",
					done: volumes !== void 0
				},
				{
					id: "plan",
					label: "章节计划",
					done: chapters.length > 0
				},
				{
					id: "write",
					label: "正文",
					done: chapters.some((c) => (c.chars ?? 0) > 0)
				},
				{
					id: "review",
					label: "审稿",
					done: approvedCount > 0
				}
			];
			const journeyDoneCount = journeyStages.filter((s) => s.done).length;
			const journeyPercent = Math.round(journeyDoneCount / journeyStages.length * 100);
			const currentStageId = journeyStages.find((s) => !s.done)?.id;
			/** 主行动卡片：推荐下一步（AI-Novel-Writing-Assistant 首页主卡模式）。 */
			const nextAction = (0, react.useMemo)(() => {
				if (project === null) return {
					eyebrow: "开始你的第一本书",
					title: "导入小说大纲",
					reason: "从 docx 文件或粘贴文本开始，AI 会把一份大纲「编译」成完整的小说。",
					actionLabel: "导入大纲",
					onClick: () => {
						setActiveTab("overview");
					}
				};
				if (bible === void 0) return {
					eyebrow: "推荐下一步",
					title: "提炼道藏",
					reason: "人设、世界观、金手指规则、写作红线是后续所有生成的地基，越完整质量越高。",
					actionLabel: "生成道藏",
					onClick: () => {
						handleBible();
					}
				};
				if (volumes === void 0) return {
					eyebrow: "推荐下一步",
					title: "规划全书卷结构",
					reason: "按剧情弧线划分卷，章节计划才有骨架可依。",
					actionLabel: "生成卷计划",
					onClick: () => {
						handleVolumes();
					}
				};
				if (chapters.length === 0) return {
					eyebrow: "推荐下一步",
					title: "生成章节计划",
					reason: "LLM 根据大纲拆解每章标题与剧情要点，然后就可以逐章生成正文。",
					actionLabel: "生成章节计划",
					onClick: () => {
						handlePlan();
					}
				};
				const drafting = chapters.find((c) => c.pendingDraft !== void 0 && c.pendingDraft !== "");
				if (drafting !== void 0) return {
					eyebrow: "需要你确认",
					title: `第 ${drafting.no} 章有未采纳的润色草稿`,
					reason: "打开工作区查看对比，决定采纳新稿或保留原稿（原稿未被改动）。",
					actionLabel: "打开工作区",
					onClick: () => {
						openWorkspace(drafting.no);
					}
				};
				if (pendingCount > 0) return {
					eyebrow: "继续创作",
					title: `还有 ${pendingCount} 章待生成`,
					reason: "批量生成剩余章节，顶部进度条会实时显示每章字数与进度。",
					actionLabel: `批量生成（${pendingCount}）`,
					onClick: () => {
						handleWriteAll();
					}
				};
				if (reviewPendingCount > 0) return {
					eyebrow: "推荐下一步",
					title: `${reviewPendingCount} 章待审稿`,
					reason: "审稿通过后章节才算完成；不通过的可按意见在工作区修订。",
					actionLabel: "去审稿",
					onClick: () => {
						setActiveTab("plan");
					}
				};
				return {
					eyebrow: "全部完成 🎉",
					title: "《" + project.bookName + "》已全部生成",
					reason: "可以去 AI 味润色（对比后采纳）、按卷复查或导出全本（TXT/MD）。",
					actionLabel: "导出全本",
					onClick: () => {
						handleExport("txt");
					}
				};
			}, [
				project,
				bible,
				volumes,
				chapters,
				pendingCount,
				reviewPendingCount,
				openWorkspace
			]);
			/** 待办队列（失败/草稿/待审稿，点击直达）。 */
			const todos = (0, react.useMemo)(() => {
				const items = [];
				for (const chapter of chapters) {
					if (chapter.status === "error") items.push({
						tone: "danger",
						title: `第 ${chapter.no} 章《${chapter.title}》生成失败`,
						description: chapter.error ?? "",
						actionLabel: "去处理",
						onClick: () => {
							setActiveTab("plan");
						}
					});
					if (items.length >= 3) return items;
				}
				const drafting = chapters.find((c) => c.pendingDraft !== void 0 && c.pendingDraft !== "");
				if (drafting !== void 0 && items.length < 3) items.push({
					tone: "warning",
					title: `第 ${drafting.no} 章《${drafting.title}》有未采纳草稿`,
					description: "原稿未被改动，采纳或放弃由你决定",
					actionLabel: "打开工作区",
					onClick: () => {
						openWorkspace(drafting.no);
					}
				});
				for (const chapter of chapters) if ((chapter.status === "written" || chapter.status === "rejected") && items.length < 3) items.push({
					tone: "info",
					title: `第 ${chapter.no} 章《${chapter.title}》待审稿`,
					description: chapter.status === "rejected" ? "审稿未通过，可按意见修订" : "等待 AI 审稿确认",
					actionLabel: "去审稿",
					onClick: () => {
						setActiveTab("plan");
					}
				});
				return items;
			}, [chapters, openWorkspace]);
			/** 资产健康（设定/卷/写作资产/伏笔）。 */
			const assetSummary = (() => {
				const assets = project?.assets;
				const parts = [];
				if (assets?.genre !== void 0) parts.push(`题材：${assets.genre.name}`);
				if (assets?.primaryProgression !== void 0) parts.push(`推进：${assets.primaryProgression.name}`);
				if ((assets?.styleAssets?.length ?? 0) > 0) parts.push(`写法：${assets.styleAssets.length} 套`);
				return parts.length > 0 ? parts.join(" · ") : "题材 / 推进 / 写法未绑定";
			})();
			const assetCount = (() => {
				const assets = project?.assets;
				let n = 0;
				if (assets?.genre !== void 0) n++;
				if (assets?.primaryProgression !== void 0) n++;
				n += assets?.auxiliaryProgressions?.length ?? 0;
				n += assets?.styleAssets?.length ?? 0;
				n += assets?.antiAiRules?.length ?? 0;
				return n;
			})();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				"data-nf-theme": panelTheme,
				children: [
					viewMode === "shelf" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShelfView, {
						api,
						shelf: shelf ?? {
							books: [],
							activeBookId: null
						},
						onOpenBook: async (id) => {
							setBusy(true);
							try {
								await api.bookActivate(id);
								setOutlineText("");
								setProject(null);
								setGeneratedFiles([]);
								setChapterText("");
								setExpandedChapter(null);
								setProgress([]);
								setAuditIssues(null);
								setCharCards(null);
								await refresh(false, true);
								await refreshShelf();
								setViewMode("workspace");
							} catch (err) {
								setError(err.message);
							} finally {
								setBusy(false);
							}
						},
						onAddBook: () => {
							setViewMode("create");
						}
					}) : viewMode === "create" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreateBookView, {
						api,
						onBack: () => {
							setViewMode("shelf");
						},
						onCreated: async (id) => {
							setBusy(true);
							try {
								setOutlineText("");
								setProject(null);
								setGeneratedFiles([]);
								setChapterText("");
								setExpandedChapter(null);
								setProgress([]);
								setAuditIssues(null);
								setCharCards(null);
								await refresh(false, true);
								await refreshShelf();
								setViewMode("workspace");
							} catch (err) {
								setError(err.message);
							} finally {
								setBusy(false);
							}
						}
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.panelHeader,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 2,
								minWidth: 0
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
								className: panel_module_css_default.panelTitle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.iconButton,
									title: "返回书架",
									"aria-label": "返回书架",
									onClick: () => {
										setViewMode("shelf");
									},
									children: "←"
								}), tt("panel.title")]
							}), project?.bookName !== "" && project?.bookName !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.panelSubtitle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["📖 ", project.bookName] }), chapters.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.headerProgress,
									children: [
										"已完成 ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: doneCount }),
										"/",
										chapters.length,
										" 章",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.headerProgressDot }),
										"通过 ",
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: chapters.filter((c) => c.status === "approved").length })
									]
								})]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: 2
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.iconButton,
								title: navCollapsed ? "展开导航栏" : "收起导航栏",
								"aria-label": navCollapsed ? "展开导航栏" : "收起导航栏",
								onClick: () => {
									setNavCollapsed((prev) => {
										const next = !prev;
										try {
											window.localStorage.setItem("dsh-novel-forge.nav.collapsed", String(next));
										} catch {}
										return next;
									});
								},
								children: navCollapsed ? "▸" : "◂"
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
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.panelBody,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("nav", {
							className: `${panel_module_css_default.panelNav} ${navCollapsed ? panel_module_css_default.panelNavCollapsed : ""}`,
							role: "tablist",
							"aria-label": "工作台导航",
							children: [
								NAV_GROUPS.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.navGroup,
									children: [
										!navCollapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default.navGroupLabel,
											children: group.label
										}),
										group.items.map((tab) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											role: "tab",
											"aria-selected": activeTab === tab.id || tab.id === "assistant" && assistantOpen || tab.id === "progress" && progressOpen,
											"data-active": activeTab === tab.id || tab.id === "assistant" && assistantOpen || tab.id === "progress" && progressOpen ? "" : void 0,
											className: panel_module_css_default.navTab,
											title: tab.label,
											onClick: () => {
												if (tab.id === "assistant") setAssistantOpen(true);
												else if (tab.id === "progress") setProgressOpen((v) => !v);
												else setActiveTab(tab.id);
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.navTabIcon,
													children: tab.icon
												}),
												!navCollapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.navTabLabel,
													children: tab.label
												}),
												tab.id === "plan" && (pendingCount > 0 || reviewPendingCount > 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: `${panel_module_css_default.navTabBadge} ${chapters.some((c) => c.status === "error") ? panel_module_css_default.navTabBadgeDanger : panel_module_css_default.navTabBadgeWarn}`,
													children: chapters.some((c) => c.status === "error") ? `!${pendingCount + reviewPendingCount}` : pendingCount + reviewPendingCount
												}),
												tab.id === "foreshadow" && foreshadows.some((f) => f.status === "planned") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.navTabBadge,
													children: foreshadows.filter((f) => f.status === "planned").length
												}),
												tab.id === "workflow" && chapters.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: `${panel_module_css_default.navTabBadge} ${panel_module_css_default.navTabBadgeDone}`,
													children: [journeyPercent, "%"]
												})
											]
										}, tab.id)),
										!navCollapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.navGroupSep })
									]
								}, group.id)),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.navSpacer }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									role: "tab",
									"aria-selected": activeTab === SETTINGS_TAB.id,
									"data-active": activeTab === SETTINGS_TAB.id ? "" : void 0,
									className: panel_module_css_default.navTab,
									title: SETTINGS_TAB.label,
									onClick: () => {
										setActiveTab(SETTINGS_TAB.id);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.navTabIcon,
										children: SETTINGS_TAB.icon
									}), !navCollapsed && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.navTabLabel,
										children: SETTINGS_TAB.label
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.navAbout,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: panel_module_css_default.navAboutRow,
										title: "打开 GitHub 仓库",
										onClick: () => {
											window.open(REPO_URL, "_blank", "noopener");
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["ℹ️ v", PLUGIN_VERSION] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.meta,
											children: "GitHub ↗"
										})]
									}), npmLatest !== null && npmLatest !== PLUGIN_VERSION && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: panel_module_css_default.navAboutUpdate,
										title: "查看更新方法",
										onClick: () => {
											window.alert(`检测到新版本 v${npmLatest}（当前 v${PLUGIN_VERSION}）\n\n更新方式：\n\n【npm 安装】\ncd ~/.dsh/profiles/web && pnpm add @waterwx/dsh-novel-forge@latest\n然后重启 dsh web\n\n【GitHub 安装】\ndsh plugin --profile web add github:watersxya/dsh-novel-forge\n\n【本地开发】\n拉取最新代码 → pnpm install && pnpm build → 重启 dsh web`);
										},
										children: ["📦 有新版本 v", npmLatest]
									})]
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
								workspace === null && draftNo !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.card,
									style: { borderColor: "var(--nf-info)" },
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.busyRow,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: { color: "var(--nf-info)" },
											children: [
												"第 ",
												draftNo,
												" 章有未采纳的润色/修订草稿（原稿未被改动）"
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												display: "flex",
												gap: 8
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
												disabled: busy,
												onClick: () => {
													openWorkspace(draftNo);
												},
												children: "打开工作区"
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
												disabled: busy,
												onClick: () => {
													handleDraftDiscard(draftNo);
												},
												children: "放弃"
											})]
										})]
									})
								}),
								workspace !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.wsPage,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.wsPageHeader,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
												onClick: () => {
													setWorkspace(null);
												},
												title: "返回章节列表（草稿不丢失）",
												children: "← 返回"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: panel_module_css_default.cardTitle,
												children: [
													"第 ",
													workspace.no,
													" 章《",
													workspace.title,
													"》"
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: panel_module_css_default.meta,
												children: [workspace.original.length, " 字"]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: {
													display: "flex",
													gap: 4,
													alignItems: "center",
													marginLeft: "auto"
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: panel_module_css_default.iconButton,
														title: "减小字号",
														"aria-label": "减小字号",
														onClick: () => {
															changeEditorFontSize(editorFontSize - 1);
														},
														children: "A−"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: panel_module_css_default.meta,
														children: [editorFontSize, "px"]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: panel_module_css_default.iconButton,
														title: "增大字号",
														"aria-label": "增大字号",
														onClick: () => {
															changeEditorFontSize(editorFontSize + 1);
														},
														children: "A＋"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: panel_module_css_default.iconButton,
														title: "关闭工作区",
														"aria-label": "关闭工作区",
														onClick: () => {
															setWorkspace(null);
														},
														children: "×"
													})
												]
											})
										]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.wsColumns,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.wsColumn,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.meta,
												children: [
													"原文（",
													workspace.original.length,
													" 字）— 在正文中选中文字可作为「修订选中」的局部目标"
												]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
												ref: wsEditorRef,
												className: `${panel_module_css_default.textarea} ${panel_module_css_default.wsEditor}`,
												style: { fontSize: editorFontSize },
												value: workspace.original,
												onChange: (e) => {
													setWorkspace({
														...workspace,
														original: e.target.value
													});
												},
												onMouseUp: captureWsSelection,
												onKeyUp: captureWsSelection,
												onSelect: captureWsSelection,
												spellCheck: false
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.wsColumn,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.meta,
													style: { fontWeight: 600 },
													children: "AI 修正指令"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
													className: panel_module_css_default.textarea,
													style: { minHeight: 60 },
													placeholder: "输入修正要求，例如：压缩冗余、加强冲突、这段对话更口语化…（可留空）",
													value: workspace.instruction,
													onChange: (e) => {
														setWorkspace({
															...workspace,
															instruction: e.target.value
														});
													}
												}),
												wsSelected !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.wsSelected,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: panel_module_css_default.meta,
														children: "当前选中内容（将用于精准修订）"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: panel_module_css_default.wsSelectedText,
														children: wsSelected
													})]
												}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.meta,
													children: "未选中内容时仅支持整章润色/修订。"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.row,
													style: { flexWrap: "wrap" },
													children: [
														workspace.instruction.includes("按审稿意见修订") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
															disabled: busy,
															onClick: () => {
																handleWsRewrite(true);
															},
															title: "AI 按已预填的审稿意见自动修订整章（无需自己找问题）",
															children: "🔧 按意见修订"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
															disabled: busy,
															onClick: () => {
																handleWsPolish();
															},
															children: "✨ 去AI味润色"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															disabled: busy || workspace.instruction.trim() === "",
															onClick: () => {
																handleWsRewrite(true);
															},
															children: "整章修订"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															disabled: busy || wsSelected === "",
															onClick: () => {
																handleWsRewrite(false);
															},
															children: "修订选中"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															disabled: busy || workspace.original.trim().length < 50,
															onClick: () => {
																handleWsCheck();
															},
															children: "🔍 AI 审查"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															disabled: busy || workspace.original.trim().length < 50,
															onClick: () => {
																handleWsSave();
															},
															children: "💾 保存并审稿"
														})
													]
												}),
												wsCheckReport !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.wsPreview,
													style: { borderColor: wsCheckReport.passed ? "var(--nf-success)" : "var(--nf-warn)" },
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: panel_module_css_default.busyRow,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: panel_module_css_default.meta,
																style: { fontWeight: 600 },
																children: "AI 审查结果"
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																style: { color: wsCheckReport.passed ? "var(--nf-success)" : "var(--nf-error)" },
																children: [
																	wsCheckReport.score,
																	" 分 — ",
																	wsCheckReport.passed ? "通过" : "未通过"
																]
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: panel_module_css_default.meta,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "总评：" }), wsCheckReport.verdict]
														}),
														wsCheckReport.issues.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
															style: {
																margin: 0,
																paddingLeft: 16,
																display: "flex",
																flexDirection: "column",
																gap: 3,
																fontSize: editorFontSize - 1,
																maxHeight: "45vh",
																overflowY: "auto"
															},
															children: wsCheckReport.issues.map((issue, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
																style: {
																	color: severityColor(issue.severity),
																	display: "flex",
																	gap: 6,
																	alignItems: "flex-start"
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																	type: "checkbox",
																	style: { marginTop: 1 },
																	checked: wsChecked.includes(i),
																	onChange: (e) => {
																		setWsChecked((prev) => e.target.checked ? [...prev, i] : prev.filter((x) => x !== i));
																	},
																	title: "勾选后可由「修复所选问题」一起修订"
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
																	"[",
																	issue.severity,
																	"] ",
																	issue.item,
																	issue.suggestion !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																		style: { color: "var(--nf-text-2)" },
																		children: [" → ", issue.suggestion]
																	})
																] })]
															}, i))
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: panel_module_css_default.meta,
															children: "审查只读不落盘；勾选要修的问题，点下方按钮一键修订；改完点「💾 保存为正文」才写入文件（原稿自动备份 .bak）。"
														}),
														wsCheckReport.issues.length > 0 && wsChecked.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
															style: { marginTop: 8 },
															children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
																disabled: busy,
																onClick: () => {
																	handleWsReviseByReport();
																},
																title: "自动按勾选的问题修订整章，产出草稿预览（不落盘），对比后应用或放弃",
																children: [
																	"🔧 修复所选问题（",
																	wsChecked.length,
																	"）"
																]
															})
														})
													]
												}),
												workspace.draft !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.wsPreview,
													style: {
														flex: 1,
														minHeight: 0
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.busyRow,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															className: panel_module_css_default.meta,
															children: [
																"优化预览（",
																workspace.draft.length,
																" 字）"
															]
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															style: {
																display: "flex",
																gap: 8
															},
															children: [
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																	type: "button",
																	className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																	onClick: () => {
																		setWsShowDiff((v) => !v);
																	},
																	children: wsShowDiff ? "显示文本" : "查看对比"
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																	type: "button",
																	className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
																	disabled: busy,
																	onClick: () => {
																		handleDraftApply(workspace.no);
																	},
																	children: "✅ 应用预览"
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																	type: "button",
																	className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																	disabled: busy,
																	onClick: () => {
																		handleDraftDiscard(workspace.no);
																	},
																	children: "↩️ 放弃"
																})
															]
														})]
													}), wsShowDiff ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DiffList, {
														original: workspace.original,
														draft: workspace.draft,
														fontSize: editorFontSize
													}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
														className: panel_module_css_default.wsPreviewText,
														style: { fontSize: editorFontSize },
														children: workspace.draft
													})]
												})
											]
										})]
									})]
								}),
								workspace === null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									activeTab === "workflow" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.dashHero,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.dashHeroEyebrow,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.dashHeroSparkle,
														children: "✨"
													}), nextAction?.eyebrow ?? "开始"]
												}),
												project !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.dashHeroTitle,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.meta,
														children: "正在创作"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
														className: panel_module_css_default.dashHeroBook,
														children: [
															"《",
															project.bookName,
															"》"
														]
													})]
												}),
												nextAction !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.dashHeroAction,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: panel_module_css_default.dashHeroArrow,
															children: "→"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: panel_module_css_default.dashHeroActionBody,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: panel_module_css_default.dashHeroActionTitle,
																children: nextAction.title
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: panel_module_css_default.meta,
																children: nextAction.reason
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
															disabled: busy,
															onClick: () => {
																nextAction.onClick();
															},
															children: nextAction.actionLabel
														})
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.dashJourney,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: panel_module_css_default.busyRow,
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: panel_module_css_default.meta,
																style: { fontWeight: 600 },
																children: "创作旅程"
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																className: panel_module_css_default.meta,
																children: [
																	journeyPercent,
																	"% · 已完成 ",
																	journeyDoneCount,
																	"/",
																	journeyStages.length,
																	" 步"
																]
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
															className: panel_module_css_default.dashJourneyBar,
															children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																className: panel_module_css_default.dashJourneyFill,
																style: { width: `${journeyPercent}%` }
															})
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
															className: panel_module_css_default.dashJourneyStages,
															children: journeyStages.map((stage) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																className: `${panel_module_css_default.dashStage} ${stage.done ? panel_module_css_default.dashStageDone : stage.id === currentStageId ? panel_module_css_default.dashStageCurrent : ""}`,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: panel_module_css_default.dashStageDot,
																	children: stage.done ? "✓" : stage.id === currentStageId ? "●" : "○"
																}), stage.label]
															}, stage.id))
														})
													]
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.assetGrid,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
													label: "全书进度",
													value: `${doneCount}/${chapters.length} 章`,
													valueColor: "var(--nf-accent)",
													detail: `${chapters.length > 0 ? Math.round(doneCount / chapters.length * 100) : 0}%`
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
													label: "已通过审稿",
													value: String(approvedCount),
													valueColor: approvedCount > 0 ? "var(--nf-success)" : void 0,
													detail: "章节已 approved"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
													label: "待生成",
													value: String(pendingCount),
													valueColor: pendingCount > 0 ? "var(--nf-warn)" : void 0,
													detail: "pending + error"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
													label: "待审稿",
													value: String(reviewPendingCount),
													valueColor: reviewPendingCount > 0 ? "var(--nf-info)" : void 0,
													detail: "written + rejected"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
													label: "总字数",
													value: String(totalChars),
													detail: "已生成正文累计"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
													label: "当前卷",
													value: currentVolumeName,
													valueFontSize: 13,
													detail: "正在推进的卷"
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
													label: "最近创作",
													value: lastUpdated,
													valueFontSize: 13,
													detail: "最近生成/编辑时间"
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.card,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												style: { justifyContent: "space-between" },
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.cardTitle,
													children: "资产健康"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
													disabled: busy || doneCount === 0,
													onClick: () => {
														handleAudit();
													},
													title: "LLM 扫描全本已生成章节，检查人名/境界/资源/时间线矛盾",
													children: "🔍 全书质检"
												})]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.assetGrid,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
														label: "道藏",
														value: bible !== void 0 ? `✓ ${bible.worldRules.length} 条规则` : "未生成",
														valueColor: bible !== void 0 ? "var(--nf-success)" : "var(--nf-text-3)",
														detail: bible !== void 0 ? `${bible.characters.length} 人物 · ${bible.redLines.length} 红线` : "提炼人设 / 世界观 / 金手指"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
														label: "卷计划",
														value: volumes !== void 0 ? `${volumes.length} 卷` : "未生成",
														valueColor: volumes !== void 0 ? "var(--nf-success)" : "var(--nf-text-3)",
														detail: volumes !== void 0 ? volumes.map((v) => v.title).join(" / ") : "按剧情弧线划分全书",
														detailTitle: volumes?.map((v) => v.title).join(" / ")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
														label: "写作资产",
														value: `${assetCount} 项`,
														valueColor: assetCount > 0 ? "var(--nf-success)" : "var(--nf-text-3)",
														detail: assetSummary,
														detailTitle: assetSummary
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatCell, {
														label: "伏笔",
														value: `${foreshadows.length} 条`,
														detail: `${foreshadows.filter((f) => f.status === "planned").length} 待埋 · ${foreshadows.filter((f) => f.status === "resolved").length} 已回收`
													})
												]
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "grid",
												gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
												gap: 14,
												alignItems: "stretch"
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.card,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.row,
													style: {
														justifyContent: "space-between",
														flexWrap: "wrap"
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: panel_module_css_default.cardTitle,
														children: [
															"🧵 ",
															tt("plotlines.workflowTitle"),
															"（",
															(project?.plotlines ?? []).length,
															" 条）"
														]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
														onClick: () => {
															setActiveTab("plotlines");
														},
														title: "查看完整剧情线管理页",
														children: "查看全部 →"
													})]
												}), (() => {
													const all = project?.plotlines ?? [];
													const active = all.filter((l) => l.status === "active").length;
													const paused = all.filter((l) => l.status === "paused").length;
													const resolved = all.filter((l) => l.status === "resolved").length;
													const main = all.find((l) => l.kind === "main" && l.status === "active");
													const latest = all.filter((l) => l.chapters.length > 0).sort((a, b) => Math.max(...b.chapters) - Math.max(...a.chapters))[0];
													if (all.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.meta,
														children: tt("plotlines.workflowEmpty")
													});
													return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: panel_module_css_default.meta,
														children: [
															active,
															" 推进中 · ",
															paused,
															" 暂停 · ",
															resolved,
															" 已完结",
															main !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [" · 主线：", main.name] }),
															latest !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
																" · 最近推进：",
																latest.name,
																"（第 ",
																Math.max(...latest.chapters),
																" 章）"
															] })
														]
													});
												})()]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.card,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.row,
													style: {
														justifyContent: "space-between",
														flexWrap: "wrap"
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: panel_module_css_default.cardTitle,
														children: [
															"📋 作者复盘（最近 ",
															Math.min(6, chapters.filter((c) => c.authorReview !== void 0).length),
															" 章）"
														]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.row,
														children: [(() => {
															const missing = chapters.filter((c) => c.status !== "pending" && c.status !== "generating" && c.authorReview === void 0).length;
															return missing > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																disabled: busy,
																onClick: () => {
																	handleAuthorBackfillAll();
																},
																title: "对历史已写章节逐章补跑作者复盘（不重新生成正文，每章约 2000 token）",
																children: [
																	"↻ 补齐（",
																	missing,
																	"）"
																]
															});
														})(), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															onClick: () => {
																setActiveTab("reviews");
															},
															title: "查看按卷分组的全部复盘记录",
															children: "查看全部 →"
														})]
													})]
												}), (() => {
													const reviewed = chapters.filter((c) => c.authorReview !== void 0);
													if (reviewed.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.meta,
														children: "尚无作者复盘——生成/审稿后自动生成，或点「补齐」为已写章节补跑。"
													});
													const honored = reviewed.filter((c) => c.authorReview.hookHonored).length;
													const avg = Math.round(reviewed.reduce((s, c) => s + c.authorReview.endingHook, 0) / reviewed.length * 10) / 10;
													const last = reviewed[reviewed.length - 1];
													return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: panel_module_css_default.meta,
														children: [
															"钩子兑现 ",
															honored,
															"/",
															reviewed.length,
															" · 结尾钩子均分 ",
															avg,
															" · 最近：第 ",
															last.no,
															" 章（钩子",
															last.authorReview.hookHonored ? "✓" : "✗",
															" ",
															last.authorReview.endingHook,
															"/10）"
														]
													});
												})()]
											})]
										}),
										auditIssues !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.card,
											style: { borderColor: auditIssues.length > 0 ? "var(--nf-error)" : "var(--nf-success)" },
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												style: { justifyContent: "space-between" },
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: panel_module_css_default.cardTitle,
													children: ["🔍 全书质检", auditIssues.length === 0 ? "：未发现矛盾 🎉" : `：${auditIssues.length} 处疑似矛盾`]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
													onClick: () => {
														setAuditIssues(null);
													},
													children: "收起"
												})]
											}), auditIssues.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: {
													display: "flex",
													flexDirection: "column",
													gap: 6
												},
												children: auditIssues.map((issue, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AuditIssueRow, {
													issue,
													disabled: busy,
													onFix: () => {
														openWorkspace(issue.chapterNo, `按质检意见修订：${issue.item}（建议：${issue.suggestion}）`);
													}
												}, i))
											})]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.card,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.cardTitle,
												children: "待办队列"
											}), todos.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: "🎉 暂无待办，一切顺畅"
											}) : todos.map((todo, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TodoRow, {
												tone: todo.tone,
												title: todo.title,
												description: todo.description,
												actionLabel: todo.actionLabel,
												disabled: busy,
												onAction: todo.onClick
											}, i))]
										})
									] }),
									activeTab === "overview" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.card,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.row,
											style: { justifyContent: "space-between" },
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.cardTitle,
												children: tt("tab.overview")
											}), project !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: panel_module_css_default.meta,
													children: [
														tt("overview.bookName"),
														": ",
														project.bookName,
														" · ",
														project.outline.length,
														" 字",
														project.outlinePath !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [" · ", project.outlinePath] })
													]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: panel_module_css_default.button,
													disabled: busy,
													onClick: () => {
														handleToggleUpdateOutline();
													},
													children: updatingOutline ? "收起" : "更新大纲"
												})]
											})]
										}), project === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
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
										] }) : updatingOutline ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.meta,
												children: [
													"大纲是本书的「出生证明」。更新时请二选一：",
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "仅更新文本" }),
													"（保留设定/章节/正文全部进度），或",
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "重置项目" }),
													"（从新总纲重新开始，清空道藏/卷/章节/正文/暗线/资产/编年录，不可恢复）。"
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
												className: panel_module_css_default.textarea,
												value: outlineText,
												placeholder: "粘贴新版大纲文本…",
												onChange: (e) => {
													setOutlineText(e.target.value);
												},
												spellCheck: false
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
														disabled: busy || outlineText.length < 50,
														onClick: () => {
															handleSaveOutline();
														},
														children: "仅更新文本（保留进度）"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: `${panel_module_css_default.button} ${panel_module_css_default.buttonDanger}`,
														disabled: busy || outlineText.length < 50,
														onClick: () => {
															handleResetProject();
														},
														children: "重置项目并更新（清空进度）"
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: panel_module_css_default.meta,
														children: [outlineText.length, " 字"]
													})
												]
											})
										] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
											className: panel_module_css_default.outlineReadonly,
											children: project.outline
										})]
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
									activeTab === "blurb" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.card,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												style: { justifyContent: "space-between" },
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.cardTitle,
													children: "卷首语"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.row,
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
															disabled: busy || project === null,
															onClick: () => {
																handleBlurbGenerate();
															},
															children: "✨ AI 生成"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															disabled: busy || project === null || blurbDraft.trim() === "",
															onClick: () => {
																handleBlurbComplete();
															},
															children: "✍️ AI 补全"
														}),
														project?.blurb !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															disabled: busy || project === null,
															onClick: () => {
																if (window.confirm("重新生成会覆盖当前简介（可先复制保存），确定？")) handleBlurbGenerate();
															},
															children: "🔄 重新生成"
														})
													]
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: panel_module_css_default.input,
													style: {
														flex: 1,
														maxWidth: 320
													},
													placeholder: "书名",
													value: bookNameDraft,
													onChange: (e) => {
														setBookNameDraft(e.target.value);
													},
													onKeyDown: (e) => {
														if (e.key === "Enter") handleRename();
													}
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
													disabled: busy || bookNameDraft.trim() === "" || bookNameDraft.trim() === project?.bookName,
													onClick: () => {
														handleRename();
													},
													children: "💾 改书名"
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												style: {
													alignItems: "flex-start",
													gap: 14
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.coverPreview,
													children: coverDataUrl !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
														src: coverDataUrl,
														alt: "封面"
													}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.coverPlaceholder,
														children: "暂无封面"
													})
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "flex",
														flexDirection: "column",
														gap: 8
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.row,
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																disabled: busy || project === null,
																onClick: () => {
																	coverFileRef.current?.click();
																},
																children: "📤 上传封面"
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																ref: coverFileRef,
																type: "file",
																accept: "image/png,image/jpeg,image/webp",
																style: { display: "none" },
																onChange: (e) => {
																	handleCoverUpload(e.target.files?.[0]);
																	e.target.value = "";
																}
															}),
															coverDataUrl !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																disabled: busy,
																onClick: () => {
																	handleCoverRemove();
																},
																children: "🗑️ 移除"
															})
														]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.meta,
														children: "支持 PNG / JPG / WebP，建议 3:4 竖版；保存于输出目录 cover.*。"
													})]
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: "面向读者的作品门面（120-250 字）：突出核心卖点与开局钩子，不剧透。点击 ✨AI 生成全量生成；或先写几句再点 ✍️AI 补全续写完整；不满意可 🔄 重新生成。"
											}),
											project === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: "请先在大纲页导入大纲建立项目。"
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
												className: panel_module_css_default.textarea,
												style: { minHeight: 140 },
												placeholder: "点击 ✨AI 生成，或先写下开头几句，再点 ✍️AI 补全…",
												value: blurbDraft,
												onChange: (e) => {
													setBlurbDraft(e.target.value);
												},
												spellCheck: false
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
													disabled: busy || blurbDraft.trim() === "",
													onClick: () => {
														handleBlurbSave();
													},
													children: "💾 保存简介"
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: panel_module_css_default.meta,
													children: [
														blurbDraft.length,
														" 字 · 已保存：",
														project.blurb !== void 0 ? `${project.blurb.length} 字` : "无"
													]
												})]
											})] })
										]
									}),
									activeTab === "plan" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default.card,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												style: {
													justifyContent: "space-between",
													flexWrap: "wrap"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.cardTitle,
													children: tt("tab.plan")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.row,
													style: { flexWrap: "wrap" },
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
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															disabled: busy || doneCount === 0,
															onClick: () => {
																handleSensitiveScan();
															},
															title: tt("sensitive.hint"),
															children: ["🔞 ", tt("sensitive.scanAll")]
														})
													]
												})]
											})
										}),
										sensHits !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.card,
											style: { borderColor: sensHits.length > 0 ? "var(--nf-warn)" : "var(--nf-success)" },
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.row,
													style: {
														justifyContent: "space-between",
														flexWrap: "wrap"
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.cardTitle,
														children: sensHits.length === 0 ? tt("sensitive.clean", { n: sensScanned }) : tt("sensitive.hits", {
															n: sensHits.length,
															chapters: new Set(sensHits.map((h) => h.chapterNo)).size
														})
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
														onClick: () => {
															setSensHits(null);
														},
														children: "收起"
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.meta,
													children: tt("sensitive.hint")
												}),
												sensHits.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													style: {
														display: "flex",
														flexDirection: "column",
														gap: 4,
														maxHeight: 300,
														overflowY: "auto",
														fontSize: 12
													},
													children: sensHits.map((hit, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															display: "flex",
															gap: 8,
															alignItems: "flex-start",
															border: "1px solid var(--nf-border)",
															borderRadius: 6,
															padding: "4px 8px"
														},
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: panel_module_css_default.badge,
																style: {
																	borderColor: "var(--nf-warn)",
																	color: "var(--nf-warn)",
																	flex: "none"
																},
																children: hit.chapterNo > 0 ? `第${hit.chapterNo}章` : "文本"
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																className: panel_module_css_default.meta,
																style: { flex: 1 },
																children: [
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", {
																		style: { color: "var(--nf-error)" },
																		children: hit.word
																	}),
																	" ×",
																	hit.count,
																	" · [",
																	hit.category,
																	"]"
																]
															}),
															hit.chapterNo > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																disabled: busy,
																onClick: () => {
																	openWorkspace(hit.chapterNo, tt("sensitive.fixPrefill", {
																		word: hit.word,
																		category: hit.category
																	}));
																},
																children: tt("sensitive.goFix")
															})
														]
													}, i))
												})
											]
										}),
										chapters.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.card,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												style: {
													justifyContent: "space-between",
													flexWrap: "wrap"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.row,
													style: {
														flexWrap: "wrap",
														gap: 6
													},
													children: volumes !== void 0 && volumes.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${selectedVolume === "all" ? panel_module_css_default.buttonPrimary : ""}`,
														onClick: () => {
															setSelectedVolume("all");
														},
														children: "全部卷"
													}), volumes.map((v) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
														type: "button",
														className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${selectedVolume === v.no ? panel_module_css_default.buttonPrimary : ""}`,
														onClick: () => {
															setSelectedVolume(v.no);
														},
														title: `第${v.no}卷 · ${v.chapterStart}-${v.chapterEnd} 章`,
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
													}, v.no))] })
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
												children: chapterGroups.filter((g) => selectedVolume === "all" || g.no === selectedVolume).map((group) => {
													const collapsed = group.no !== 0 && collapsedVolumes.includes(group.no);
													const groupDone = group.chapters.filter((c) => c.status === "approved" || c.status === "written" || c.status === "rejected").length;
													return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.volumeGroup,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: panel_module_css_default.volumeGroupHeader,
															onClick: () => {
																if (group.no !== 0) setCollapsedVolumes((prev) => prev.includes(group.no) ? prev.filter((x) => x !== group.no) : [...prev, group.no]);
															},
															children: [
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	className: panel_module_css_default.volumeGroupToggle,
																	children: group.no !== 0 ? collapsed ? "▸" : "▾" : "📖"
																}),
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: group.title }),
																/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																	className: panel_module_css_default.meta,
																	children: [
																		"（",
																		group.chapters.length,
																		" 章 · 已完成 ",
																		groupDone,
																		"）"
																	]
																})
															]
														}), !collapsed && group.chapters.map((chapter) => {
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
																					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																						className: panel_module_css_default.meta,
																						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [tt("plan.beats"), ":"] })
																					}),
																					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																						className: panel_module_css_default.meta,
																						children: renderBeats(chapter.beats)
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
																					chapter.authorReview === void 0 && chapter.status !== "pending" && chapter.status !== "generating" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																						className: panel_module_css_default.row,
																						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																							type: "button",
																							className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																							disabled: busy,
																							onClick: () => {
																								handleAuthorBackfillChapter(chapter.no);
																							},
																							title: "对该章补跑一次作者复盘（读取已落盘正文，不重新生成）",
																							children: "📋 生成作者复盘"
																						})
																					}),
																					chapter.authorReview !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																						className: panel_module_css_default.reviewBox,
																						style: { borderColor: "color-mix(in srgb, var(--nf-info) 45%, transparent)" },
																						children: [
																							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																								className: panel_module_css_default.row,
																								style: { justifyContent: "space-between" },
																								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "📋 作者复盘" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																									style: { color: chapter.authorReview.hookHonored ? "var(--nf-success)" : "var(--nf-warn)" },
																									children: [
																										"钩子",
																										chapter.authorReview.hookHonored ? "已兑现 ✓" : "未兑现 ✗",
																										" · 结尾钩子 ",
																										chapter.authorReview.endingHook,
																										"/10"
																									]
																								})]
																							}),
																							chapter.authorReview.hookNote !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																								className: panel_module_css_default.meta,
																								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "钩子：" }), chapter.authorReview.hookNote]
																							}),
																							chapter.authorReview.plotlineProgress !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																								className: panel_module_css_default.meta,
																								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "推进：" }), chapter.authorReview.plotlineProgress]
																							}),
																							chapter.authorReview.continuity !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																								className: panel_module_css_default.meta,
																								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "衔接：" }), chapter.authorReview.continuity]
																							}),
																							chapter.authorReview.trend !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																								className: panel_module_css_default.meta,
																								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "趋势：" }), chapter.authorReview.trend]
																							})
																						]
																					}),
																					(chapter.status === "rejected" || chapter.status === "written" || chapter.status === "approved") && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																						style: {
																							display: "flex",
																							flexDirection: "column",
																							gap: 6
																						},
																						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																							className: panel_module_css_default.meta,
																							style: { fontWeight: 600 },
																							children: "润色 / 修订 — 在右上角打开工作区：左栏原文可直接选中文字做局部修订，右栏输入指令后预览，确认后再应用（未应用不改动原稿）"
																						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
																							className: panel_module_css_default.row,
																							children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
																								type: "button",
																								className: `${panel_module_css_default.button} ${panel_module_css_default.buttonPrimary}`,
																								disabled: busy || busyAny,
																								onClick: () => {
																									openWorkspace(chapter.no);
																								},
																								children: [
																									tt("plan.rewrite"),
																									" / ",
																									tt("plan.polish")
																								]
																							})
																						})]
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
																			chapter.status === "generating" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																				type: "button",
																				className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																				disabled: busy,
																				onClick: () => {
																					handleChapterReset(chapter.no);
																				},
																				title: "生成卡死/中断时可复位为待生成，重新生成",
																				children: "🔄 复位"
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
																			(chapter.status === "written" || chapter.status === "rejected") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																				type: "button",
																				className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																				disabled: busy || busyAny,
																				onClick: () => {
																					handleChapterApprove(chapter.no);
																				},
																				title: "作者行使最终决定权：直接通过（不重审，保留审稿记录，落盘保存）",
																				children: "✔ 直接通过"
																			}),
																			(chapter.status === "written" || chapter.status === "rejected" || chapter.status === "approved") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																				type: "button",
																				className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																				disabled: busy || busyAny,
																				onClick: () => {
																					openWorkspace(chapter.no);
																				},
																				title: "手动编辑正文 → AI 审查 → 保存",
																				children: "✏️ 编辑"
																			}),
																			(chapter.status === "written" || chapter.status === "rejected" || chapter.status === "approved") && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																				type: "button",
																				className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																				disabled: busy || busyAny,
																				onClick: () => {
																					openWorkspace(chapter.no);
																				},
																				children: tt("plan.polish")
																			}),
																			chapter.status === "rejected" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																				type: "button",
																				className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																				disabled: busy || busyAny,
																				onClick: () => {
																					openWorkspace(chapter.no);
																				},
																				title: "按审稿意见修订（自动带入意见）",
																				children: "按意见修订"
																			}),
																			chapter.status === "rejected" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																				type: "button",
																				className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																				disabled: busy || busyAny,
																				onClick: () => {
																					handleWriteChapter(chapter.no, true);
																				},
																				title: "整章重新生成",
																				children: "重新生成"
																			})
																		]
																	})
																]
															}, chapter.no);
														})]
													}, group.no);
												})
											})]
										})
									] }),
									activeTab === "reviews" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.card,
										style: {
											flex: 1,
											minHeight: 0
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												style: {
													justifyContent: "space-between",
													flexWrap: "wrap"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: panel_module_css_default.cardTitle,
													children: [
														"📋 复盘记录（",
														chapters.filter((c) => c.authorReview !== void 0).length,
														" 章已复盘）"
													]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.row,
													children: (() => {
														const missing = chapters.filter((c) => c.status !== "pending" && c.status !== "generating" && c.authorReview === void 0).length;
														return missing > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
															disabled: busy,
															onClick: () => {
																handleAuthorBackfillAll();
															},
															title: "对历史已写章节逐章补跑作者复盘",
															children: [
																"↻ 补齐缺失复盘（",
																missing,
																"）"
															]
														});
													})()
												})]
											}),
											(() => {
												const reviewed = chapters.filter((c) => c.authorReview !== void 0);
												if (reviewed.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.meta,
													children: "尚无作者复盘——生成/审稿后自动生成，或点「补齐缺失复盘」为已写章节补跑。"
												});
												const honored = reviewed.filter((c) => c.authorReview.hookHonored).length;
												const avg = Math.round(reviewed.reduce((s, c) => s + c.authorReview.endingHook, 0) / reviewed.length * 10) / 10;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: panel_module_css_default.meta,
													style: { fontWeight: 600 },
													children: [
														"钩子兑现 ",
														honored,
														"/",
														reviewed.length,
														" · 结尾钩子均分 ",
														avg,
														"/10"
													]
												});
											})(),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: {
													display: "flex",
													flexDirection: "column",
													gap: 10,
													overflowY: "auto",
													flex: 1,
													minHeight: 0
												},
												children: chapterGroups.map((group) => {
													const groupReviewed = group.chapters.filter((c) => c.authorReview !== void 0);
													if (groupReviewed.length === 0) return null;
													return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															display: "flex",
															flexDirection: "column",
															gap: 4
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: panel_module_css_default.row,
															style: {
																alignItems: "center",
																gap: 8
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", {
																style: { fontSize: 13 },
																children: group.title
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																className: panel_module_css_default.meta,
																children: [
																	"已复盘 ",
																	groupReviewed.length,
																	"/",
																	group.chapters.length,
																	" 章"
																]
															})]
														}), [...groupReviewed].reverse().map((c) => {
															const ar = c.authorReview;
															const expanded = expandedReviewChapter === c.no;
															return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: {
																	border: "1px solid var(--nf-border)",
																	borderRadius: 8,
																	overflow: "hidden"
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
																	type: "button",
																	style: {
																		width: "100%",
																		textAlign: "left",
																		border: "none",
																		background: "transparent",
																		cursor: "pointer",
																		padding: "6px 10px",
																		fontSize: 12,
																		display: "flex",
																		alignItems: "center",
																		gap: 6,
																		flexWrap: "wrap"
																	},
																	onClick: () => {
																		setExpandedReviewChapter(expanded ? null : c.no);
																	},
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																			style: { color: "var(--nf-text-3)" },
																			children: expanded ? "▾" : "▸"
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
																			"第",
																			c.no,
																			"章《",
																			c.title,
																			"》"
																		] }),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																			style: { color: ar.hookHonored ? "var(--nf-success)" : "var(--nf-warn)" },
																			children: ["钩子", ar.hookHonored ? "✓" : "✗"]
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																			style: { color: ar.endingHook >= 6 ? "var(--nf-success)" : "var(--nf-error)" },
																			children: [
																				"结尾钩子 ",
																				ar.endingHook,
																				"/10"
																			]
																		}),
																		ar.plotlineProgress !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																			className: panel_module_css_default.meta,
																			style: { marginLeft: 4 },
																			children: [ar.plotlineProgress.slice(0, 40), ar.plotlineProgress.length > 40 ? "…" : ""]
																		})
																	]
																}), expanded && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		padding: "4px 10px 8px",
																		fontSize: 12,
																		display: "flex",
																		flexDirection: "column",
																		gap: 3,
																		borderTop: "1px solid var(--nf-border)"
																	},
																	children: [
																		ar.hookNote !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																			className: panel_module_css_default.meta,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "钩子：" }), ar.hookNote]
																		}),
																		ar.plotlineProgress !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																			className: panel_module_css_default.meta,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "推进：" }), ar.plotlineProgress]
																		}),
																		ar.continuity !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																			className: panel_module_css_default.meta,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "衔接：" }), ar.continuity]
																		}),
																		ar.trend !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																			className: panel_module_css_default.meta,
																			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: "趋势：" }), ar.trend]
																		})
																	]
																})]
															}, c.no);
														})]
													}, group.no);
												})
											})
										]
									}),
									activeTab === "bible" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
												bible.worldRules.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														border: "1px solid var(--nf-border)",
														borderRadius: 10,
														padding: "8px 10px"
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: panel_module_css_default.row,
															style: { justifyContent: "space-between" },
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
																tt("bible.worldRules"),
																"（",
																bible.worldRules.length,
																"）"
															] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																onClick: () => {
																	setWorldRulesDraft(bible.worldRules.join("\n"));
																},
																children: "编辑"
															})]
														}),
														worldRulesDraft !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																display: "flex",
																flexDirection: "column",
																gap: 6,
																marginTop: 6
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
																className: panel_module_css_default.textarea,
																style: { minHeight: 120 },
																value: worldRulesDraft,
																onChange: (e) => {
																	setWorldRulesDraft(e.target.value);
																},
																placeholder: "每条规则一行…"
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: panel_module_css_default.row,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																	type: "button",
																	className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
																	disabled: busy,
																	onClick: () => {
																		handleSaveWorldRules();
																	},
																	children: "保存规则"
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																	type: "button",
																	className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
																	onClick: () => {
																		setWorldRulesDraft("");
																	},
																	children: "取消"
																})]
															})]
														}),
														worldRulesDraft === "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
															style: {
																margin: "4px 0 0",
																paddingLeft: 18,
																fontSize: 12
															},
															children: bible.worldRules.map((r, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: r }, i))
														})
													]
												}),
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
									}) }),
									activeTab === "world" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorldTab, {
										api,
										world: project?.world,
										onChanged: (w) => {
											setProject((prev) => prev === null ? prev : {
												...prev,
												world: w,
												updatedAt: (/* @__PURE__ */ new Date()).toISOString()
											});
											pushProgress(`大世界已保存：${w.realms.length} 境界 · ${w.regions.length} 区域 · ${w.factions.length} 势力`, "done");
										}
									}),
									activeTab === "roles" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.card,
										style: {
											flex: 1,
											minHeight: 0
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												style: {
													justifyContent: "space-between",
													flexWrap: "wrap"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: panel_module_css_default.cardTitle,
													children: [
														"👥 角色库（",
														(project?.roles ?? []).length,
														" 个）"
													]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.row,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
														disabled: busy || (project?.facts ?? []).length === 0,
														onClick: () => {
															handleCharactersRefresh();
														},
														title: "从编年录聚合各角色当前状态（境界/伤势/心境/出场统计），显示在每张卡上",
														children: "↻ 从编年录刷新状态"
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
														type: "button",
														className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
														disabled: busy || doneCount === 0,
														onClick: () => {
															handleRolesExtract();
														},
														title: "AI 扫描大纲/编年录/已写章节，提炼完整角色库（含女主/女配/反派定位）",
														children: "✨ 从全书提炼角色"
													})]
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: "角色库是全书角色主表：定位（女主/女配/配角/反派）、身份、关系网、成长线、知情度——生成与审稿都会按定位规格刻画互动。点「从编年录刷新状态」可在每张卡上显示角色当前状态。"
											}),
											roleCandidates !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "flex",
													flexDirection: "column",
													gap: 6,
													border: "1px solid var(--nf-info)",
													borderRadius: 12,
													padding: 10
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.row,
														style: {
															justifyContent: "space-between",
															flexWrap: "wrap"
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("b", { children: [
															"✨ AI 提炼候选（",
															roleCandidates.length,
															"）"
														] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															onClick: () => {
																setRoleCandidates(null);
															},
															children: "收起"
														})]
													}),
													roleCandidates.length === 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.meta,
														children: "未提炼到角色。"
													}),
													roleCandidates.map((r, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoleCandidateRow, {
														candidate: r,
														disabled: busy,
														onAdopt: () => {
															handleRoleAdopt(r);
														},
														onEdit: () => {
															setRoleDraft(r);
														}
													}, i))
												]
											}),
											roleDraft !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "flex",
													flexDirection: "column",
													gap: 8,
													border: "1px solid var(--nf-accent)",
													borderRadius: 12,
													padding: 10
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.row,
														style: { flexWrap: "wrap" },
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: panel_module_css_default.field,
																style: {
																	flex: 1,
																	minWidth: 140
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																	className: panel_module_css_default.fieldLabel,
																	children: "角色名"
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																	className: panel_module_css_default.input,
																	value: roleDraft.name,
																	onChange: (e) => {
																		setRoleDraft({
																			...roleDraft,
																			name: e.target.value
																		});
																	}
																})]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: panel_module_css_default.field,
																style: { flex: 1 },
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																	className: panel_module_css_default.fieldLabel,
																	children: "定位"
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
																	className: panel_module_css_default.input,
																	value: roleDraft.roleLabel,
																	onChange: (e) => {
																		setRoleDraft({
																			...roleDraft,
																			roleLabel: e.target.value
																		});
																	},
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "protagonist",
																			children: "主角"
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "female_lead",
																			children: "女主"
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "female_support",
																			children: "女配"
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "support",
																			children: "配角"
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "antagonist",
																			children: "反派"
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "extra",
																			children: "路人"
																		})
																	]
																})]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: panel_module_css_default.field,
																style: { flex: 2 },
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																	className: panel_module_css_default.fieldLabel,
																	children: "身份"
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																	className: panel_module_css_default.input,
																	value: roleDraft.identity,
																	onChange: (e) => {
																		setRoleDraft({
																			...roleDraft,
																			identity: e.target.value
																		});
																	}
																})]
															})
														]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.field,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
															className: panel_module_css_default.fieldLabel,
															children: "目标"
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
															className: panel_module_css_default.textarea,
															style: { minHeight: 44 },
															value: roleDraft.goals,
															onChange: (e) => {
																setRoleDraft({
																	...roleDraft,
																	goals: e.target.value
																});
															}
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.field,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
															className: panel_module_css_default.fieldLabel,
															children: "关系网（每行一条：角色名（关系））"
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
															className: panel_module_css_default.textarea,
															style: { minHeight: 44 },
															value: roleDraft.relations.join("\n"),
															onChange: (e) => {
																setRoleDraft({
																	...roleDraft,
																	relations: e.target.value.split("\n").map((l) => l.trim()).filter((l) => l !== "")
																});
															}
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.field,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
															className: panel_module_css_default.fieldLabel,
															children: "成长线（每行一条：阶段：说明）"
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
															className: panel_module_css_default.textarea,
															style: { minHeight: 44 },
															value: roleDraft.arc.join("\n"),
															onChange: (e) => {
																setRoleDraft({
																	...roleDraft,
																	arc: e.target.value.split("\n").map((l) => l.trim()).filter((l) => l !== "")
																});
															}
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.field,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
															className: panel_module_css_default.fieldLabel,
															children: "知情度（每行一条该角色知道的信息）"
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
															className: panel_module_css_default.textarea,
															style: { minHeight: 44 },
															value: roleDraft.knowledge.join("\n"),
															onChange: (e) => {
																setRoleDraft({
																	...roleDraft,
																	knowledge: e.target.value.split("\n").map((l) => l.trim()).filter((l) => l !== "")
																});
															}
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.row,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
															disabled: busy,
															onClick: () => {
																handleRoleSave();
															},
															children: "保存"
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															onClick: () => {
																setRoleDraft(null);
															},
															children: "取消"
														})]
													})
												]
											}),
											(project?.roles ?? []).length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: "角色库为空——点「✨ 从全书提炼角色」自动建立，或手动新增。"
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: {
													display: "flex",
													flexDirection: "column",
													gap: 6
												},
												children: (project?.roles ?? []).map((r) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RoleCard, {
													role: r,
													status: (project?.roleStatus ?? []).find((s) => s.name === r.name),
													disabled: busy,
													onEdit: () => {
														setRoleDraft(r);
													},
													onRemove: () => {
														handleRoleRemove(r.name);
													}
												}, r.name))
											})
										]
									}),
									activeTab === "assetsGenre" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssetsTab, {
										api,
										initialTab: "genre"
									}),
									activeTab === "assetsProgression" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssetsTab, {
										api,
										initialTab: "progression"
									}),
									activeTab === "assetsTemplates" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssetsTab, {
										api,
										initialTab: "templates"
									}),
									activeTab === "assetsRules" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssetsTab, {
										api,
										initialTab: "rules"
									}),
									activeTab === "assetsStyle" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssetsTab, {
										api,
										initialTab: "style"
									}),
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
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.field,
														style: { flex: 1 },
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																className: panel_module_css_default.fieldLabel,
																children: tt("settings.editorFontSize")
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
																className: panel_module_css_default.input,
																value: editorFontSize,
																onChange: (e) => {
																	changeEditorFontSize(Number(e.target.value));
																},
																children: [
																	12,
																	13,
																	14,
																	15,
																	16,
																	18,
																	20,
																	22,
																	24
																].map((v) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("option", {
																	value: v,
																	children: [v, "px"]
																}, v))
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: panel_module_css_default.meta,
																children: tt("settings.editorFontSizeHint")
															})
														]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
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
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.field,
														style: { flex: 1 },
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																className: panel_module_css_default.fieldLabel,
																children: tt("settings.autoAuthorReview")
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
																className: panel_module_css_default.input,
																value: configDraft.autoAuthorReview ? "1" : "0",
																onChange: (e) => {
																	setConfigDraft({
																		...configDraft,
																		autoAuthorReview: e.target.value === "1"
																	});
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																	value: "1",
																	children: "✓ 是"
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																	value: "0",
																	children: "✗ 否"
																})]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																className: panel_module_css_default.meta,
																children: tt("settings.autoAuthorReviewHint")
															})
														]
													})
												]
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
									}),
									activeTab === "settings" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.card,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.cardTitle,
											children: tt("settings.theme")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.row,
											style: {
												gap: 8,
												flexWrap: "wrap"
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
													type: "button",
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panelTheme === "liquid" ? panel_module_css_default.buttonPrimary : ""}`,
													onClick: () => {
														changePanelTheme("liquid");
													},
													title: "iOS 液态玻璃质感 · 绿色强调（当前默认）",
													children: ["🧊 ", tt("settings.themeLiquid")]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
													type: "button",
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panelTheme === "classic" ? panel_module_css_default.buttonPrimary : ""}`,
													onClick: () => {
														changePanelTheme("classic");
													},
													title: "经典 iOS 毛玻璃 · 蓝色强调",
													children: ["💠 ", tt("settings.themeClassic")]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
													type: "button",
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panelTheme === "neumorph" ? panel_module_css_default.buttonPrimary : ""}`,
													onClick: () => {
														changePanelTheme("neumorph");
													},
													title: "新拟物派 · 双阴影立体（仅浅色；深色下自动回退液态）",
													children: ["🔘 ", tt("settings.themeNeumorph")]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.meta,
													children: tt("settings.themeHint")
												})
											]
										})]
									}),
									activeTab === "facts" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.card,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.busyRow,
												style: { flexWrap: "wrap" },
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: panel_module_css_default.cardTitle,
													children: tt("facts.title", { n: (project?.facts ?? []).length })
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
													type: "button",
													className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
													disabled: busy || chapters.length === 0,
													onClick: () => {
														handleFactsBackfill();
													},
													title: "用 LLM 从历史章节正文重新抽取事实，补齐缺失的编年录条目",
													children: ["📥 ", tt("facts.backfill")]
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: tt("facts.hint")
											}),
											(project?.facts ?? []).length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: {
													display: "flex",
													flexDirection: "column",
													gap: 4,
													maxHeight: "60vh",
													overflowY: "auto",
													fontSize: 12
												},
												children: [...project?.facts ?? []].reverse().map((fact, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "flex",
														gap: 8,
														alignItems: "flex-start"
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														className: panel_module_css_default.badge,
														style: {
															borderColor: "var(--nf-text-3)",
															color: "var(--nf-text-3)",
															flex: "none",
															marginTop: 1
														},
														children: [
															"第 ",
															fact.chapterNo,
															" 章"
														]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.meta,
														children: fact.text
													})]
												}, i))
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: "暂无事实条目——写一章后会自动生成，或点击上方「回填」。"
											})
										]
									}),
									activeTab === "plotlines" && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.card,
										style: {
											flex: 1,
											minHeight: 0
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												className: panel_module_css_default.row,
												style: {
													justifyContent: "space-between",
													flexWrap: "wrap"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
													className: panel_module_css_default.cardTitle,
													children: [
														tt("tab.plotlines"),
														"（",
														project?.plotlines?.length ?? 0,
														"）"
													]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.row,
													style: { flexWrap: "wrap" },
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															disabled: busy || outlineText.length < 50,
															onClick: () => {
																handlePlotlineHealth();
															},
															title: "根据已写章节数与各线推进情况，判断是否需要新增剧情线、建议多少章后添加",
															children: "🩺 剧情健康检查"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															disabled: busy || outlineText.length < 50,
															onClick: () => {
																handlePlotlinePlan();
															},
															title: "AI 设计下一阶段剧情方案：未来 5-10 章方向 + 2-3 条建议新线",
															children: "✨ 设计剧情方案"
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															disabled: busy || outlineText.length < 50,
															onClick: () => {
																handlePlotlineSuggest();
															},
															title: "AI 根据大纲/卷计划/已写章节/编年录，提炼候选剧情线",
															children: "✨ AI 建议剧情线"
														}),
														plotlineDraft === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
															onClick: () => {
																setPlotlineDraft({
																	id: "",
																	name: "",
																	kind: "main",
																	goal: "",
																	progress: "",
																	status: "active"
																});
															},
															children: tt("plotlines.new")
														})
													]
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: tt("plotlines.hint")
											}),
											plotlineHealth !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlotlineHealthPanel, {
												report: plotlineHealth,
												disabled: busy,
												onPlan: () => {
													handlePlotlinePlan();
												},
												onClose: () => {
													setPlotlineHealth(null);
												}
											}),
											plotlinePlan !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlotlinePlanPanel, {
												plan: plotlinePlan,
												disabled: busy,
												onAdopt: (s) => {
													handlePlanAdopt(s);
												},
												onClose: () => {
													setPlotlinePlan(null);
												}
											}),
											plotlineSuggestions !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlotlineSuggestionPanel, {
												suggestions: plotlineSuggestions,
												disabled: busy,
												onAdopt: (s) => {
													handlePlotlineAdopt(s);
												},
												onClose: () => {
													setPlotlineSuggestions(null);
												}
											}),
											plotlineDraft !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													display: "flex",
													flexDirection: "column",
													gap: 8,
													border: "1px solid var(--nf-accent)",
													borderRadius: 12,
													padding: 10
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.row,
														style: { flexWrap: "wrap" },
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: panel_module_css_default.field,
																style: {
																	flex: 2,
																	minWidth: 160
																},
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																	className: panel_module_css_default.fieldLabel,
																	children: tt("plotlines.name")
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																	className: panel_module_css_default.input,
																	value: plotlineDraft.name,
																	onChange: (e) => {
																		setPlotlineDraft({
																			...plotlineDraft,
																			name: e.target.value
																		});
																	},
																	placeholder: "如：集齐古玉残片"
																})]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: panel_module_css_default.field,
																style: { flex: 1 },
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																	className: panel_module_css_default.fieldLabel,
																	children: tt("plotlines.kind")
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
																	className: panel_module_css_default.input,
																	value: plotlineDraft.kind,
																	onChange: (e) => {
																		setPlotlineDraft({
																			...plotlineDraft,
																			kind: e.target.value
																		});
																	},
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "main",
																			children: tt("plotlines.kindMain")
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "branch",
																			children: tt("plotlines.kindBranch")
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "character",
																			children: tt("plotlines.kindCharacter")
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "mystery",
																			children: tt("plotlines.kindMystery")
																		})
																	]
																})]
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																className: panel_module_css_default.field,
																style: { flex: 1 },
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
																	className: panel_module_css_default.fieldLabel,
																	children: tt("plotlines.status")
																}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
																	className: panel_module_css_default.input,
																	value: plotlineDraft.status,
																	onChange: (e) => {
																		setPlotlineDraft({
																			...plotlineDraft,
																			status: e.target.value
																		});
																	},
																	children: [
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "active",
																			children: tt("plotlines.statusActive")
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "paused",
																			children: tt("plotlines.statusPaused")
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "resolved",
																			children: tt("plotlines.statusResolved")
																		}),
																		/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																			value: "abandoned",
																			children: tt("plotlines.statusAbandoned")
																		})
																	]
																})]
															})
														]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.field,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
															className: panel_module_css_default.fieldLabel,
															children: tt("plotlines.goal")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
															className: panel_module_css_default.textarea,
															style: { minHeight: 48 },
															value: plotlineDraft.goal,
															onChange: (e) => {
																setPlotlineDraft({
																	...plotlineDraft,
																	goal: e.target.value
																});
															}
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.field,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
															className: panel_module_css_default.fieldLabel,
															children: tt("plotlines.progress")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
															className: panel_module_css_default.textarea,
															style: { minHeight: 40 },
															value: plotlineDraft.progress,
															onChange: (e) => {
																setPlotlineDraft({
																	...plotlineDraft,
																	progress: e.target.value
																});
															},
															placeholder: "如：已取得第二枚残片，正追踪第三枚线索"
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.row,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall} ${panel_module_css_default.buttonPrimary}`,
															disabled: busy,
															onClick: () => {
																handlePlotlineSave();
															},
															children: tt("plotlines.save")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
															onClick: () => {
																setPlotlineDraft(null);
															},
															children: tt("plotlines.cancel")
														})]
													})
												]
											}),
											(project?.plotlines ?? []).length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.meta,
												children: tt("plotlines.empty")
											}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: {
													display: "flex",
													flexDirection: "column",
													gap: 8,
													overflowY: "auto",
													flex: 1,
													minHeight: 0
												},
												children: (project?.plotlines ?? []).map((line) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlotlineCard, {
													line,
													disabled: busy,
													onRefresh: () => {
														handlePlotlineRefresh(line.id);
													},
													onEdit: () => {
														setPlotlineDraft({
															id: line.id,
															name: line.name,
															kind: line.kind,
															goal: line.goal,
															progress: line.progress,
															status: line.status
														});
													},
													onRemove: () => {
														handlePlotlineRemove(line.id);
													}
												}, line.id))
											})
										]
									})
								] })
							]
						})]
					})] }),
					assistantOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.assistantFloat,
						style: {
							left: assistantPos.x,
							top: assistantPos.y,
							width: assistantSize.w,
							height: assistantSize.h
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.assistantFloatHeader,
								onMouseDown: (e) => {
									e.preventDefault();
									dragState.current = {
										type: "move",
										target: "assistant",
										startX: e.clientX,
										startY: e.clientY,
										origX: assistantPos.x,
										origY: assistantPos.y,
										origW: assistantSize.w,
										origH: assistantSize.h
									};
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["💬 AI 助手 ", /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.meta,
									children: "（拖动标题栏移动 · 右下角拉大小）"
								})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.iconButton,
									title: "关闭",
									"aria-label": "关闭 AI 助手",
									onClick: () => {
										setAssistantOpen(false);
									},
									children: "×"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.assistantFloatBody,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AssistantTab, { api })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.assistantResize,
								onMouseDown: (e) => {
									e.preventDefault();
									e.stopPropagation();
									dragState.current = {
										type: "resize",
										target: "assistant",
										startX: e.clientX,
										startY: e.clientY,
										origX: assistantPos.x,
										origY: assistantPos.y,
										origW: assistantSize.w,
										origH: assistantSize.h
									};
								}
							})
						]
					}),
					progressOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.assistantFloat,
						style: {
							left: progressPos.x,
							top: progressPos.y,
							width: progressSize.w,
							height: progressSize.h
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.assistantFloatHeader,
								onMouseDown: (e) => {
									e.preventDefault();
									dragState.current = {
										type: "move",
										target: "progress",
										startX: e.clientX,
										startY: e.clientY,
										origX: progressPos.x,
										origY: progressPos.y,
										origW: progressSize.w,
										origH: progressSize.h
									};
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
									"📊 工作进度",
									busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: { color: "var(--nf-accent)" },
										children: " 🟢 任务进行中"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.meta,
										children: "（拖动标题栏移动 · 右下角拉大小）"
									})
								] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "flex",
										alignItems: "center",
										gap: 4
									},
									children: [progress.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: `${panel_module_css_default.button} ${panel_module_css_default.buttonSmall}`,
										onClick: () => {
											setProgress([]);
										},
										title: "清空活动记录",
										children: "清空"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.iconButton,
										title: "关闭",
										"aria-label": "关闭工作进度",
										onClick: () => {
											setProgressOpen(false);
										},
										children: "×"
									})]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.assistantFloatBody,
								style: {
									padding: 10,
									display: "flex",
									flexDirection: "column",
									gap: 8,
									overflow: "hidden"
								},
								children: [busy && (busyLabel !== "" || liveBar !== null) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										border: "1px solid var(--nf-accent)",
										borderRadius: 10,
										padding: "8px 12px",
										display: "flex",
										flexDirection: "column",
										gap: 5,
										background: "color-mix(in srgb, var(--nf-accent) 6%, transparent)"
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												fontSize: 12,
												fontWeight: 600,
												color: "var(--nf-accent)"
											},
											children: [
												"✍ ",
												busyLabel !== "" ? busyLabel : liveBar?.text ?? "任务进行中",
												"…"
											]
										}),
										liveBar?.ratio !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default.bigProgressBar,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												className: panel_module_css_default.bigProgressBarFill,
												style: { width: `${Math.round(liveBar.ratio * 100)}%` }
											})
										}),
										liveBar?.text !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.liveText,
											children: liveBar.text
										})
									]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.progress,
									style: {
										flex: 1,
										minHeight: 0,
										overflowY: "auto",
										border: "1px solid var(--nf-border)",
										borderRadius: 10,
										background: "var(--nf-bg-inset)",
										padding: 8,
										display: "flex",
										flexDirection: "column"
									},
									children: [progress.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											flex: 1,
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											justifyContent: "center",
											gap: 4,
											color: "var(--nf-text-3)",
											fontSize: 12,
											minHeight: 120
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: { fontSize: 22 },
												children: "📭"
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "暂无活动记录" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "生成、审稿等操作会显示在这里" })
										]
									}) : progress.map((line) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: line.kind === "done" ? panel_module_css_default.progressLineDone : line.kind === "error" ? panel_module_css_default.progressLineError : line.live === true ? panel_module_css_default.progressLineLive : panel_module_css_default.progressLine,
										children: [line.live === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.progressBar,
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: panel_module_css_default.progressBarFill,
												style: { width: `${Math.round((line.ratio ?? 0) * 100)}%` }
											})
										}), line.text]
									}, line.id)), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { ref: progressEndRef })]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.assistantResize,
								onMouseDown: (e) => {
									e.preventDefault();
									e.stopPropagation();
									dragState.current = {
										type: "resize",
										target: "progress",
										startX: e.clientX,
										startY: e.clientY,
										origX: progressPos.x,
										origY: progressPos.y,
										origW: progressSize.w,
										origH: progressSize.h
									};
								}
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