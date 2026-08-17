import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "schemastery";
import { exec } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { BlockAssembler, ReasoningEffortId, createAssistantMessage, createUserMessage } from "@deepseek-ai/dsh-llm";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
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
	/** 开书想法 → AI 补全大纲：输入一句话想法，生成 2-3 个可选大纲方案。 */
	outlineSuggest: "/api/dsh-novel-forge/outline/suggest",
	/** 拆书分析：对已写章节做结构/人物/文风/卖点四维体检（两阶段：源笔记→分节分析）。 */
	breakdown: "/api/dsh-novel-forge/breakdown",
	/** 漫剧分镜生成：章节 → 角色锚点 + 分镜表（可适配豆包/Seedance/SD）。 */
	storyboard: "/api/dsh-novel-forge/storyboard",
	/** 漫剧分集计划：读一卷 → 按故事弧线分集（高潮拆集/过渡并章）。 */
	storyboardPlan: "/api/dsh-novel-forge/storyboard/plan",
	config: "/api/dsh-novel-forge/config",
	openFolder: "/api/dsh-novel-forge/open-folder"
};
//#endregion
//#region src/docx.ts
/**
* docx outline extraction: a .docx is a zip whose word/document.xml holds the
* body text in <w:t> runs inside <w:p> paragraphs. We unzip with fflate and
* walk the XML with a tiny tokenizer — no heavyweight XML/DOM dependency.
*/
/** Decode the handful of XML entities docx bodies actually use. */
function decodeEntities(text) {
	return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
}
/**
* Extract plain text from a docx buffer: one line per <w:p> paragraph, with
* <w:tab>/<w:br> preserved as whitespace. Tables and nested structures are
* flattened in document order (their paragraphs are just <w:p> too).
* @param buffer - the raw .docx bytes.
* @returns the body text.
*/
function extractDocxText(buffer) {
	let files;
	try {
		files = unzipSync(buffer);
	} catch (error) {
		throw new Error(`not a valid docx (zip open failed): ${error.message}`);
	}
	const document = files["word/document.xml"];
	if (document === void 0) throw new Error("not a valid docx (word/document.xml missing)");
	const xml = strFromU8(document);
	const paragraphs = [];
	const parts = xml.split(/<w:p\b[^>]*>/);
	for (let i = 1; i < parts.length; i++) {
		const segment = parts[i];
		const runs = [];
		for (const match of segment.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g)) if (match[0].startsWith("<w:tab")) runs.push("	");
		else if (match[0].startsWith("<w:br")) runs.push("\n");
		else runs.push(decodeEntities(match[1] ?? ""));
		const line = runs.join("").replace(/\u00a0/g, " ").trimEnd();
		paragraphs.push(line);
	}
	const text = paragraphs.join("\n").replace(/\n{3,}/g, "\n\n").trim();
	if (text.length === 0) throw new Error("docx contains no extractable text");
	return text;
}
/**
* Read and extract a docx outline from disk.
* @param path - absolute path to the .docx file.
* @returns the extracted outline text.
*/
function readOutlineFromDocx(path) {
	let buffer;
	try {
		buffer = readFileSync(path);
	} catch (error) {
		throw new Error(`cannot read outline file "${path}": ${error.message}`);
	}
	return extractDocxText(new Uint8Array(buffer));
}
//#endregion
//#region src/assets.ts
/** 预置写法模板（来自 AI-Novel-Writing-Assistant 内置 DEFAULT_STYLE_TEMPLATES）。 */
const BUILTIN_STYLE_TEMPLATES = [
	{
		key: "power-up-escalation",
		name: "爽文递进推进流",
		description: "持续升级冲突和收益点，强化目标推进与爽点兑现。",
		category: "爽文流",
		applicableGenres: [
			"都市",
			"玄幻",
			"热血"
		],
		proseRules: [
			"围绕目标推进，尽快兑现局部收益；每段都要有目标推进或爽点兑现。",
			"保持明确因果和节奏抬升，场景单元按「目标→阻碍→压制→反转收益」推进。",
			"优先冲突和结果，少停留；段尾用钩子收束。"
		],
		dialogueRules: ["角色表达直接，情绪跟随胜负切换。", "对话承担推进与信息功能，但保留角色自己的语气差异。"],
		languageRules: ["句式清晰，减少无效分散信息。", "直接、明确，不做无谓铺垫。"],
		rhythmRules: ["快节奏，段落密度中等，动作先于解释。", "尽快兑现局部收益，避免拖沓。"],
		defaultAntiAiRuleKeys: [
			"禁止总结主题",
			"对话纯功能推进",
			"连续三段解释性叙事"
		]
	},
	{
		key: "bottom-loop-reality",
		name: "底层循环现实流",
		description: "通过碎片化生活与反复落空表现人物困境。",
		category: "现实流",
		applicableGenres: [
			"都市",
			"现实",
			"成长"
		],
		proseRules: [
			"以时间推进和现实落差构成叙事张力，结尾不解决核心困境。",
			"场景单元按「行为→落差→自我合理化」推进。",
			"以碎片化生活推进，不做总括式回顾。"
		],
		dialogueRules: ["人物情绪通过动作和嘴硬表达，允许短促口语化台词。", "对话保留生活杂音与无效信息。"],
		languageRules: ["语言粗粝、口语化，允许生活杂音与不完整句。", "句子变化度高，允许无意义细节。"],
		rhythmRules: ["段落密实，动作先于解释。", "中快节奏，允许碎片化流动。"],
		defaultAntiAiRuleKeys: [
			"禁止解释型心理描写",
			"禁止段尾升华",
			"鼓励无意义小动作",
			"鼓励现实落差",
			"鼓励嘴硬补偿"
		]
	},
	{
		key: "suspense-pressure",
		name: "悬疑压迫递增流",
		description: "通过信息遮蔽、细节异常和压力叠加制造不安感。",
		category: "悬疑流",
		applicableGenres: [
			"悬疑",
			"惊悚",
			"现实"
		],
		proseRules: [
			"以异常细节、信息差和节奏收束推动悬念层层加压。",
			"场景单元按「现场细节→异常→误判→新风险」推进。",
			"优先制造信息缺口和压迫氛围。"
		],
		dialogueRules: ["角色反应克制，恐惧通过反应显现。", "对话保留克制感，不解释恐惧来源。"],
		languageRules: ["细节精确，保留少量噪音增强现场感。", "克制、中等偏高句变化。"],
		rhythmRules: ["通过节奏收束和信息延迟制造压力。", "中速，段落密度中等偏高。"],
		defaultAntiAiRuleKeys: [
			"禁止解释型心理描写",
			"禁止总结主题",
			"段落长度过于整齐",
			"鼓励现实落差"
		]
	},
	{
		key: "emotional-tension",
		name: "情绪拉扯流",
		description: "通过错位表达、停顿和误读制造关系张力。",
		category: "情感流",
		applicableGenres: [
			"言情",
			"都市",
			"群像"
		],
		proseRules: [
			"人物不直说核心情绪，靠误读、停顿和反应推动关系变化。",
			"场景单元按「动作→言外之意→误读→回避」推进。",
			"以关系错位推进，而非直接说明。"
		],
		dialogueRules: ["情绪通过停顿、动作和言外之意体现。", "对话充满潜台词与试探。"],
		languageRules: ["语言自然，允许留白与停顿。", "句子变化度高，允许无意义细节。"],
		rhythmRules: ["给关系反应留空间，但避免空洞抒情。", "中慢节奏，段落密度中等。"],
		defaultAntiAiRuleKeys: [
			"禁止直接说教",
			"禁止段尾升华",
			"对话纯功能推进",
			"鼓励无意义小动作"
		]
	},
	{
		key: "ensemble-weave",
		name: "群像交织流",
		description: "以多人行动线和视角差异交织推进事件。",
		category: "群像流",
		applicableGenres: [
			"群像",
			"都市",
			"悬疑"
		],
		proseRules: ["多角色并行推进，但每个角色的表达和认知范围必须区分清楚。", "多线并进，但视角切换要受控。"],
		dialogueRules: ["不同角色口吻必须拉开差异，避免所有人说话一样。"],
		languageRules: ["保持角色差异，句式变化度高。", "减少无效分散信息。"],
		rhythmRules: ["多线交织但节奏不乱，平衡推进。", "动作先于解释。"],
		defaultAntiAiRuleKeys: [
			"对话纯功能推进",
			"句式重复率过高",
			"禁止总结主题"
		]
	},
	{
		key: "immersive-daily",
		name: "日常浸没流",
		description: "通过生活细节和细微情绪变化建立持续沉浸感。",
		category: "日常流",
		applicableGenres: [
			"日常",
			"治愈",
			"都市"
		],
		proseRules: ["重场景体验和关系温度，核心情绪通过场景自然流出。", "允许保留生活性动作和无效信息。"],
		dialogueRules: ["人物表达自然，不用高强度戏剧句。", "对话保留生活气息。"],
		languageRules: ["保留生活细节和杂音，不追求工整。", "口语化，句子变化中等偏高。"],
		rhythmRules: ["慢节奏沉浸，但避免空转。", "允许碎片化流动。"],
		defaultAntiAiRuleKeys: [
			"禁止段尾升华",
			"段落长度过于整齐",
			"鼓励无意义小动作"
		]
	},
	{
		key: "cold-professional",
		name: "冷峻专业流",
		description: "以专业事实和行业细节压住情绪，形成克制压力感。",
		category: "专业流",
		applicableGenres: [
			"职场",
			"现实",
			"悬疑"
		],
		proseRules: [
			"行业事实和程序细节优先，情绪不直说，信息密度高于抒情密度。",
			"场景单元按「事实→动作→专业判断→后果」推进。",
			"让专业事实承担叙事重量。"
		],
		dialogueRules: ["情绪藏在专业动作和事实选择里。", "对话以信息性表达为主，克制。"],
		languageRules: ["术语和事实优先，避免廉价金句。", "正式、克制的语言。"],
		rhythmRules: ["信息密度高，但不铺张解释。", "平衡节奏，段落密度中等偏高。"],
		defaultAntiAiRuleKeys: [
			"禁止直接说教",
			"禁止总结主题",
			"句式重复率过高"
		]
	},
	{
		key: "absurd-dark-humor",
		name: "荒诞黑色幽默流",
		description: "通过反差、冷感观察和荒诞细节制造黑色幽默。",
		category: "黑色幽默",
		applicableGenres: [
			"都市",
			"黑色幽默",
			"现实"
		],
		proseRules: [
			"用反差和荒诞细节放大现实困境，笑点和压迫感同时存在。",
			"场景单元按「现实细节→荒诞偏差→冷反应」推进。",
			"依赖反差和冷感观察，而非热闹吐槽。"
		],
		dialogueRules: ["情绪藏在冷反应和嘴硬里。", "台词冷面、口语化，允许自嘲与转移。"],
		languageRules: ["允许夹带荒诞杂质和冷幽默节奏。", "口语化，句子变化度高。"],
		rhythmRules: ["反差点要快落地，不要解释笑点。", "平衡节奏，段落密度中等偏高。"],
		defaultAntiAiRuleKeys: [
			"禁止解释型心理描写",
			"禁止段尾升华",
			"鼓励现实落差",
			"鼓励嘴硬补偿"
		]
	}
];
/** 内置全局反 AI 规则（来自 AI-Novel-Writing-Assistant 内置 DEFAULT_ANTI_AI_RULES）。 */
const BUILTIN_ANTI_AI_RULES = [
	{
		name: "禁止解释型心理描写",
		avoid: "直接使用\"他感到\"\"他意识到\"\"他明白了\"等句式解释人物心理。",
		fix: "把心理解释改成动作、语气、停顿、环境反应或结果。",
		detectPatterns: [
			"他感到",
			"她感到",
			"他意识到",
			"她意识到",
			"他明白了",
			"她明白了"
		],
		builtin: true
	},
	{
		name: "禁止段尾升华",
		avoid: "在段尾或收尾处用总结句升华主题（如\"生活就是\"\"命运总会\"\"说到底\"）。",
		fix: "删除升华句，回到具体动作、现场或悬而未决的处境。",
		detectPatterns: [
			"生活就是",
			"命运总会",
			"归根结底",
			"说到底",
			"这就是"
		],
		builtin: true
	},
	{
		name: "禁止总结主题",
		avoid: "把段落写成总结中心思想或提炼人生道理（如\"这说明\"\"这意味着\"）。",
		fix: "删掉主题总结，让信息通过事件和结果自然显现。",
		detectPatterns: [
			"这说明",
			"这意味着",
			"归根结底",
			"其实就是"
		],
		builtin: true
	},
	{
		name: "禁止直接说教",
		avoid: "作者替角色或读者做直接价值判断和说教（如\"我们都应该\"\"人总要学会\"）。",
		fix: "改成角色具体处境或对话，不做抽象说教。",
		detectPatterns: [
			"我们都应该",
			"人总要学会",
			"真正重要的是"
		],
		builtin: true
	},
	{
		name: "段落长度过于整齐",
		avoid: "段落长度和节奏过于平均，产生 AI 作文感。",
		fix: "打破段落长度均衡，让句子和段落有自然起伏。",
		detectPatterns: [],
		builtin: true
	},
	{
		name: "连续三段解释性叙事",
		avoid: "连续几段只有解释没有动作，削弱现场感。",
		fix: "插入动作、对话、环境反馈，减少连段说明。",
		detectPatterns: [],
		builtin: true
	},
	{
		name: "对话纯功能推进",
		avoid: "对话只有信息推进，没有人物语气和生活噪音（如\"告诉你\"\"我们现在要\"）。",
		fix: "补入停顿、绕弯、语气差异和无效信息。",
		detectPatterns: [
			"告诉你",
			"我们现在要",
			"接下来就"
		],
		builtin: true
	},
	{
		name: "句式重复率过高",
		avoid: "连续句式过于整齐（如\"首先\"\"然后\"\"接着\"\"最后\"），显得机械。",
		fix: "拉开句式长度和起句方式，打散结构。",
		detectPatterns: [
			"首先",
			"然后",
			"接着",
			"最后"
		],
		builtin: true
	},
	{
		name: "AI 高频套话",
		avoid: "滥用\"不禁\"\"仿佛\"\"一时间\"\"不由得\"\"顿时\"\"然而\"\"缓缓\"\"轻轻\"\"微微\"\"似乎\"\"终于\"等模式词及套路比喻。",
		fix: "用具体、有画面感的表达替换套话；每个比喻都应当是新造的。",
		detectPatterns: [
			"不禁",
			"仿佛",
			"一时间",
			"不由得",
			"顿时",
			"缓缓",
			"轻轻",
			"微微"
		],
		builtin: true
	},
	{
		name: "鼓励无意义小动作",
		avoid: "（鼓励类）全篇缺少真实但不推动主线的小动作，人物显得空洞。",
		fix: "补入挠头、点烟、抠包装、挪椅子等小动作，增加人味与生活感。",
		detectPatterns: [],
		builtin: true
	},
	{
		name: "鼓励现实落差",
		avoid: "（鼓励类）人物预期和现实结果完全一致，缺少落差。",
		fix: "补出人物预期与实际结果之间的差距，制造张力。",
		detectPatterns: [],
		builtin: true
	},
	{
		name: "鼓励嘴硬补偿",
		avoid: "（鼓励类）人物吃瘪后没有维持体面的反应。",
		fix: "给角色补一句嘴硬找补或自我合理化，保持人设温度。",
		detectPatterns: [],
		builtin: true
	}
];
/** 内置题材基底库（常用网文题材树，跨书复用）。 */
const BUILTIN_GENRE_LIBRARY = [
	{
		name: "仙侠修真",
		description: "以修仙境界、宗门斗争、法宝丹药为核心，读者期待从凡人到强者的成长与长生问道。",
		children: [
			{
				name: "凡人流",
				description: "资质平凡、步步为营，靠资源积累与心机博弈逆袭，强调真实感与代入感。",
				children: []
			},
			{
				name: "苟道流",
				description: "主角苟且发育、藏锋敛芒，坐收渔利，强调生存智慧与反差爽点。",
				children: []
			},
			{
				name: "争霸流",
				description: "宗门、王朝或大陆争锋，主角由弱到强整合势力，强调格局与权谋。",
				children: []
			}
		]
	},
	{
		name: "都市异能",
		description: "现代都市背景叠加超能力，读者期待隐藏身份、扮猪吃虎与日常反差。",
		children: [
			{
				name: "异能升级",
				description: "觉醒超能力后不断变强，隐藏于都市，遇敌碾压。",
				children: []
			},
			{
				name: "重生复仇",
				description: "重生回到过去，利用先知先觉改变命运、清算仇敌。",
				children: []
			},
			{
				name: "商业经营",
				description: "以超能力或见识经商扩张，建立商业帝国，强调经营爽感。",
				children: []
			}
		]
	},
	{
		name: "悬疑推理",
		description: "以谜题、案件与真相揭露为核心，读者期待线索层层展开与反转。",
		children: [
			{
				name: "本格推理",
				description: "公平线索、逻辑推演，读者可与主角一同解谜。",
				children: []
			},
			{
				name: "刑侦探案",
				description: "警察或侦探视角连续破案，案件串联主线，强调现实与人性。",
				children: []
			},
			{
				name: "无限流",
				description: "主角穿梭于不同副本世界解谜求生，副本之间累积成长。",
				children: []
			}
		]
	},
	{
		name: "玄幻奇幻",
		description: "异世界或架空大陆的冒险成长，读者期待宏大世界观、奇遇与战力突破。",
		children: [
			{
				name: "学院流",
				description: "入学修炼、同窗竞争、大赛扬名，强调青春感与阶梯式打脸。",
				children: []
			},
			{
				name: "废柴逆袭",
				description: "开局废柴受辱，觉醒金手指后一路逆袭打脸，强调反差与爽点。",
				children: []
			},
			{
				name: "诸天万界",
				description: "穿越诸天世界收集资源与能力，强调世界多样性与成长曲线。",
				children: []
			}
		]
	},
	{
		name: "历史军事",
		description: "以历史时代为背景的争霸、谋略或军旅故事，读者期待权谋博弈与时代质感。",
		children: [{
			name: "王朝争霸",
			description: "乱世崛起、招贤纳士、逐鹿天下，强调战略与人心。",
			children: []
		}, {
			name: "穿越种田",
			description: "穿越古代发展生产、经营家族，强调建设感与生活细节。",
			children: []
		}]
	},
	{
		name: "末世科幻",
		description: "末世危机或科幻设定下的生存与重建，读者期待资源管理、危机升级与人性考验。",
		children: [{
			name: "基地经营",
			description: "建立基地、收集资源、抵御危机，强调建设与扩张。",
			children: []
		}, {
			name: "进化觉醒",
			description: "末世异变中觉醒能力不断进化，强调战力成长与危机求生。",
			children: []
		}]
	}
];
/** 内置常用推进模式。 */
const BUILTIN_PROGRESSION_MODES = [
	{
		name: "升级变强",
		driver: "主角的实力、境界或能力持续增长，读者期待每次突破带来的碾压与认可。",
		readerExpectation: "每隔几章有一次明确的实力提升或打脸兑现；大境界突破要有仪式感。",
		payoffs: [
			"突破境界",
			"学会新技能",
			"越级战胜强敌",
			"当众打脸质疑者"
		],
		risks: [
			"升级重复套路",
			"战力膨胀失控",
			"无铺垫强行突破"
		],
		primary: false
	},
	{
		name: "经营扩张",
		driver: "主角的产业、势力或领地不断扩张，资源复利滚雪球。",
		readerExpectation: "经营投入有可感知的回报，扩张遇到新挑战并解决。",
		payoffs: [
			"新产业上线",
			"规模翻倍",
			"吞并对手",
			"资源闭环成型"
		],
		risks: [
			"过程枯燥",
			"扩张无阻力",
			"数值失衡"
		],
		primary: false
	},
	{
		name: "解谜揭露",
		driver: "主线谜团（身世、阴谋、世界观真相）持续牵引读者，每揭开一层又引出更深一层。",
		readerExpectation: "定期有真相碎片放出，回收旧伏笔、埋设新伏笔。",
		payoffs: [
			"伏笔回收",
			"身份揭露",
			"阴谋浮出水面",
			"反转打脸"
		],
		risks: [
			"谜题拖太久",
			"伏笔忘记回收",
			"反转生硬"
		],
		primary: false
	},
	{
		name: "渔翁得利",
		driver: "强敌相互厮杀，主角躲在暗处观察、收割，风险由他人承担、果实由主角获取。",
		readerExpectation: "冲突升级时主角以最小代价获取最大收益，且不暴露自身。",
		payoffs: [
			"坐收渔利",
			"捡漏宝物",
			"敌人两败俱伤",
			"信息差获利"
		],
		risks: [
			"重复套路",
			"收割太轻易",
			"主角全程无风险"
		],
		primary: false
	},
	{
		name: "关系拉扯",
		driver: "人物关系（知己、对手、师徒、情感线）的张力与变化持续推动剧情。",
		readerExpectation: "关系有进有退、有误会与和解，情绪起伏带动阅读欲。",
		payoffs: [
			"关系升温",
			"信任建立",
			"背叛与挽回",
			"并肩作战"
		],
		risks: [
			"情感线停滞",
			"工业糖精",
			"为虐而虐"
		],
		primary: false
	}
];
/** 默认（空）项目写作资产。 */
function emptyProjectAssets() {
	return {
		auxiliaryProgressions: [],
		antiAiRules: [],
		styleAssets: []
	};
}
/** 合并项目资产与内置库：返回「生效的反 AI 规则」（内置全局 + 项目自定义）。 */
function effectiveAntiAiRules(assets) {
	const custom = assets?.antiAiRules ?? [];
	const customNames = new Set(custom.map((r) => r.name));
	return [...BUILTIN_ANTI_AI_RULES.filter((r) => !customNames.has(r.name)), ...custom];
}
/** 把生效规则渲染成提示词块（压缩：avoid/fix 截断，省 token）。 */
function renderAntiAiRules(assets) {
	const rules = effectiveAntiAiRules(assets);
	if (rules.length === 0) return "";
	const clip = (value, max) => value.length > max ? value.slice(0, max) + "…" : value;
	return ["==================== 反 AI 规则（写作时必须遵守的表达边界） ====================", ...rules.map((r) => `- ${r.name}：避免——${clip(r.avoid, 90)}${r.fix !== "" ? `；修正——${clip(r.fix, 50)}` : ""}`)].join("\n");
}
/** 渲染题材与推进模式提示词块。 */
function renderGenreAndProgression(assets) {
	const sections = [];
	if (assets?.genre !== void 0) {
		sections.push("==================== 题材基底（本书的题材定位与读者期待） ====================");
		sections.push(`题材：${assets.genre.name}`);
		if (assets.genre.description !== "") sections.push(`读者期待：${assets.genre.description}`);
		const walk = (node, depth) => {
			for (const child of node.children) {
				sections.push(`${"  ".repeat(depth)}- ${child.name}：${child.description}`);
				walk(child, depth + 1);
			}
		};
		walk(assets.genre, 1);
	}
	const modes = [...assets?.primaryProgression !== void 0 ? [assets.primaryProgression] : [], ...assets?.auxiliaryProgressions ?? []];
	if (modes.length > 0) {
		sections.push("==================== 推进模式（读者为什么继续看） ====================");
		for (const mode of modes) {
			const tag = mode.primary ? "（主推进）" : "（辅助）";
			sections.push(`- 模式「${mode.name}」${tag}：驱动力——${mode.driver}`);
			sections.push(`  读者期待：${mode.readerExpectation}`);
			if (mode.payoffs.length > 0) sections.push(`  常见兑现：${mode.payoffs.join("、")}`);
			if (mode.risks.length > 0) sections.push(`  节奏风险（避免）：${mode.risks.join("、")}`);
		}
	}
	return sections.join("\n");
}
/** 渲染写法资产提示词块（规则去重，省 token）。 */
function renderStyleAssets(assets) {
	const styles = assets?.styleAssets ?? [];
	if (styles.length === 0) return "";
	const sections = ["==================== 写法资产（本书的叙事风格约束） ===================="];
	for (const style of styles) {
		sections.push(`【${style.name}】`);
		const unique = (rules) => [...new Set(rules)];
		if (style.proseRules.length > 0) sections.push("叙述与节奏：\n" + unique(style.proseRules).map((r) => `- ${r}`).join("\n"));
		if (style.dialogueRules.length > 0) sections.push("台词风格：\n" + unique(style.dialogueRules).map((r) => `- ${r}`).join("\n"));
		if (style.descriptionRules.length > 0) sections.push("描写与情绪：\n" + unique(style.descriptionRules).map((r) => `- ${r}`).join("\n"));
		if (style.boundaries.length > 0) sections.push("表达边界：\n" + unique(style.boundaries).map((r) => `- ${r}`).join("\n"));
	}
	return sections.join("\n");
}
/** 渲染全部写作资产提示词（供生成/规划/审稿注入）。 */
function renderAllAssets(assets) {
	return [
		renderGenreAndProgression(assets),
		renderStyleAssets(assets),
		renderAntiAiRules(assets)
	].filter((part) => part !== "").join("\n\n");
}
/** 写法引擎：从样本文本提取风格资产的系统提示词。 */
function styleEngineSystemPrompt() {
	return [
		"你是一位资深网文文风分析师。你会收到一段样本文本，请提炼出可复用的叙事风格规则，供后续章节保持同一种味道。",
		"要求：",
		"1. 从样本中归纳，不要泛泛而谈；每条规则都要能落到具体写法（句式、用词、视角、节奏、对话方式、描写密度）。",
		"2. 台词风格要说明角色说话的语气特征与常用表达方式。",
		"3. 表达边界要写明这段风格「不会怎么做」（如：不用华丽辞藻、不写长段心理独白、不用成语堆砌）。",
		"4. 输出必须是合法 JSON 对象，不要输出任何其他文字。",
		"JSON 结构：",
		"{\"proseRules\": [\"叙述视角与句式节奏规则\"], \"dialogueRules\": [\"台词风格规则\"], \"descriptionRules\": [\"描写密度与情绪表达规则\"], \"boundaries\": [\"表达边界\"]}"
	].join("\n");
}
//#endregion
//#region src/engine.ts
/**
* Novel engine — the host half's core: LLM-driven story-bible extraction,
* volume planning, chapter planning, chapter-by-chapter writing with
* auto-review + rewrite, polish (de-AI-ify), narrative summaries, foreshadow
* tracking, project persistence, and whole-book export. Pure Node (no
* web-server dependencies), so routes stay thin and logic is testable.
*/
/** Project state file name inside the output dir. */
const PROJECT_FILE = "novel-project.json";
/** Sanitize a file name: keep CJK/alphanumerics/space/dash/underscore. */
function safeFileName(name) {
	return name.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
}
/** Chapter output file name, e.g. 第001章_开篇.md */
function chapterFileName(chapter) {
	const title = safeFileName(chapter.title) || `第${chapter.no}章`;
	return `第${String(chapter.no).padStart(3, "0")}章_${title}.md`;
}
/** Infer a book name from the outline's first non-empty line. */
function inferBookName(outline) {
	return (outline.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "未命名小说").replace(/^《/, "").replace(/》.*$/, "").slice(0, 40);
}
/** Read the persisted project from the output dir (undefined when absent). */
function loadProject(outputDir) {
	const file = join(outputDir, PROJECT_FILE);
	if (!existsSync(file)) return void 0;
	try {
		let rawText = readFileSync(file, "utf8");
		if (rawText.charCodeAt(0) === 65279) rawText = rawText.slice(1);
		const raw = JSON.parse(rawText);
		if (typeof raw.outline !== "string" || !Array.isArray(raw.chapters)) return void 0;
		if (!Array.isArray(raw.foreshadows)) raw.foreshadows = [];
		if (raw.assets === void 0 || typeof raw.assets !== "object") raw.assets = emptyProjectAssets();
		if (!Array.isArray(raw.assets.antiAiRules)) raw.assets.antiAiRules = [];
		if (!Array.isArray(raw.assets.auxiliaryProgressions)) raw.assets.auxiliaryProgressions = [];
		if (!Array.isArray(raw.assets.styleAssets)) raw.assets.styleAssets = [];
		if (!Array.isArray(raw.facts)) raw.facts = [];
		if (!Array.isArray(raw.plotlines)) raw.plotlines = [];
		return raw;
	} catch {
		return;
	}
}
/** Persist the project state next to the chapters. */
function saveProject(outputDir, project) {
	mkdirSync(outputDir, { recursive: true });
	writeFileSync(join(outputDir, PROJECT_FILE), JSON.stringify(project, null, 2), "utf8");
}
/**
* 并发保护：长任务（章节计划生成/正文生成）在内存中持有旧快照，
* 期间其他请求可能修改了「易变字段」（道藏/角色库/剧情线/人物志存档/简介/封面）。
* 保存前用磁盘最新版本合并这些字段，避免旧快照覆盖新修改（曾导致角色卡丢失）。
* 注意：调用方若自己修改了这些字段，不要使用本函数。
*/
function mergeVolatileFromDisk(outputDir, project) {
	try {
		const disk = loadProject(outputDir);
		if (disk === void 0) return;
		project.bible = disk.bible;
		project.roles = disk.roles;
		project.plotlines = disk.plotlines;
		project.roleStatus = disk.roleStatus;
		project.blurb = disk.blurb;
		project.coverPath = disk.coverPath;
		project.facts = disk.facts;
		project.assets = disk.assets;
		project.world = disk.world;
		project.volumes = disk.volumes;
	} catch {}
}
/**
* 内置违禁词库（网文平台常见审查类别）。只做硬匹配提示，不代替人工判断。
* 词语刻意保持常见写法；作者可自行判断是否修改。
*/
const SENSITIVE_WORDS = [
	{
		word: "共匪",
		category: "政治"
	},
	{
		word: "独裁",
		category: "政治"
	},
	{
		word: "法轮",
		category: "政治"
	},
	{
		word: "六四",
		category: "政治"
	},
	{
		word: "天安门事件",
		category: "政治"
	},
	{
		word: "翻墙",
		category: "政治"
	},
	{
		word: "政治敏感",
		category: "政治"
	},
	{
		word: "乳沟",
		category: "擦边"
	},
	{
		word: "酥胸",
		category: "擦边"
	},
	{
		word: "淫荡",
		category: "擦边"
	},
	{
		word: "做爱",
		category: "擦边"
	},
	{
		word: "上床",
		category: "擦边"
	},
	{
		word: "裸体",
		category: "擦边"
	},
	{
		word: "一丝不挂",
		category: "擦边"
	},
	{
		word: "胴体",
		category: "擦边"
	},
	{
		word: "春药",
		category: "擦边"
	},
	{
		word: "催情",
		category: "擦边"
	},
	{
		word: "迷奸",
		category: "擦边"
	},
	{
		word: "强暴",
		category: "擦边"
	},
	{
		word: "轮奸",
		category: "擦边"
	},
	{
		word: "援交",
		category: "擦边"
	},
	{
		word: "嫖娼",
		category: "擦边"
	},
	{
		word: "卖淫",
		category: "擦边"
	},
	{
		word: "色情",
		category: "擦边"
	},
	{
		word: "情色",
		category: "擦边"
	},
	{
		word: "撸管",
		category: "擦边"
	},
	{
		word: "自慰",
		category: "擦边"
	},
	{
		word: "口交",
		category: "擦边"
	},
	{
		word: "打炮",
		category: "擦边"
	},
	{
		word: "约炮",
		category: "擦边"
	},
	{
		word: "一夜情",
		category: "擦边"
	},
	{
		word: "碎尸",
		category: "暴力"
	},
	{
		word: "分尸",
		category: "暴力"
	},
	{
		word: "凌迟",
		category: "暴力"
	},
	{
		word: "剥皮",
		category: "暴力"
	},
	{
		word: "开膛",
		category: "暴力"
	},
	{
		word: "剖腹",
		category: "暴力"
	},
	{
		word: "挖心",
		category: "暴力"
	},
	{
		word: "虐杀",
		category: "暴力"
	},
	{
		word: "凌辱",
		category: "暴力"
	},
	{
		word: "血腥",
		category: "暴力"
	},
	{
		word: "大屠杀",
		category: "暴力"
	},
	{
		word: "灭门",
		category: "暴力"
	},
	{
		word: "满门抄斩",
		category: "暴力"
	},
	{
		word: "腰斩",
		category: "暴力"
	},
	{
		word: "活埋",
		category: "暴力"
	},
	{
		word: "点天灯",
		category: "暴力"
	},
	{
		word: "傻逼",
		category: "辱骂"
	},
	{
		word: "傻B",
		category: "辱骂"
	},
	{
		word: "草泥马",
		category: "辱骂"
	},
	{
		word: "妈的",
		category: "辱骂"
	},
	{
		word: "尼玛",
		category: "辱骂"
	},
	{
		word: "去死",
		category: "辱骂"
	},
	{
		word: "废物",
		category: "辱骂"
	},
	{
		word: "垃圾",
		category: "辱骂"
	},
	{
		word: "人渣",
		category: "辱骂"
	},
	{
		word: "贱人",
		category: "辱骂"
	},
	{
		word: "婊子",
		category: "辱骂"
	},
	{
		word: "狗日的",
		category: "辱骂"
	},
	{
		word: "加微信",
		category: "广告"
	},
	{
		word: "加QQ",
		category: "广告"
	},
	{
		word: "微信公众号",
		category: "广告"
	},
	{
		word: "淘宝",
		category: "广告"
	},
	{
		word: "拼多多",
		category: "广告"
	},
	{
		word: "刷单",
		category: "广告"
	},
	{
		word: "充值返利",
		category: "广告"
	},
	{
		word: "扫码领",
		category: "广告"
	},
	{
		word: "加群领",
		category: "广告"
	},
	{
		word: "vx",
		category: "广告"
	},
	{
		word: "扣扣",
		category: "广告"
	},
	{
		word: "赌博",
		category: "其他"
	},
	{
		word: "赌场",
		category: "其他"
	},
	{
		word: "毒品",
		category: "其他"
	},
	{
		word: "冰毒",
		category: "其他"
	},
	{
		word: "摇头丸",
		category: "其他"
	},
	{
		word: "自杀方法",
		category: "其他"
	},
	{
		word: "邪教",
		category: "其他"
	},
	{
		word: "传销",
		category: "其他"
	},
	{
		word: "军火",
		category: "其他"
	},
	{
		word: "枪支",
		category: "其他"
	},
	{
		word: "管制刀具",
		category: "其他"
	}
];
/** 对一段文本做违禁词硬匹配，返回命中（词/类别/次数）。 */
function checkSensitiveText(text) {
	const hits = [];
	for (const entry of SENSITIVE_WORDS) {
		let count = 0;
		let idx = text.indexOf(entry.word);
		while (idx !== -1) {
			count++;
			idx = text.indexOf(entry.word, idx + entry.word.length);
		}
		if (count > 0) hits.push({
			word: entry.word,
			category: entry.category,
			count
		});
	}
	return hits;
}
/** List generated chapter files in the output dir (sorted). */
function listChapterFiles(outputDir) {
	if (!existsSync(outputDir)) return [];
	try {
		return readdirSync(outputDir).filter((name) => /^第\d+章_.*\.md$/.test(name) && !name.endsWith(".bak.md")).sort((a, b) => {
			return Number(/^第(\d+)章/.exec(a)?.[1] ?? 0) - Number(/^第(\d+)章/.exec(b)?.[1] ?? 0);
		});
	} catch {
		return [];
	}
}
/** Re-sync chapter status against files on disk (a file may exist without state). */
function syncProjectWithDisk(project, outputDir) {
	const files = /* @__PURE__ */ new Map();
	for (const file of listChapterFiles(outputDir)) {
		const no = Number(/^第(\d+)章/.exec(file)?.[1] ?? 0);
		if (no > 0) files.set(String(no), file);
	}
	for (const chapter of project.chapters) {
		const file = files.get(String(chapter.no));
		if (file !== void 0 && (chapter.status === "pending" || chapter.status === "generating")) {
			chapter.status = "written";
			chapter.file = file;
		}
	}
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
}
/** Read a chapter's markdown body from disk (undefined when missing). */
function readChapterFile(outputDir, chapter) {
	if (chapter.file === void 0) return void 0;
	const path = join(outputDir, chapter.file);
	if (!existsSync(path)) return void 0;
	return readFileSync(path, "utf8");
}
/** Create a fresh project from an outline. */
function createProject(outline, outlinePath) {
	const now = (/* @__PURE__ */ new Date()).toISOString();
	return {
		bookName: inferBookName(outline),
		outline,
		outlinePath,
		chapters: [],
		foreshadows: [],
		assets: emptyProjectAssets(),
		facts: [],
		createdAt: now,
		updatedAt: now
	};
}
/** One complete non-streaming LLM call. */
async function complete(ctx, config, options) {
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: options.user
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-novel-forge"
		}
	})];
	const request = {
		provider: config.provider,
		model: config.model,
		messages,
		system: options.system,
		maxTokens: options.maxTokens ?? config.maxTokens,
		temperature: options.temperature ?? .7
	};
	const assembler = new BlockAssembler();
	for await (const chunk of ctx.llm.stream(request)) assembler.push(chunk);
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") throw new Error(`LLM 调用失败（${finish.kind}）: ${finish.failure.message}`);
	if (finish.kind === "max-tokens") throw new Error("LLM 输出达到 maxTokens 上限，请增大配置后重试");
	const blocks = assembler.blocks();
	if (process.env.DSH_NOVEL_DEBUG === "1") console.error("[dsh-novel-forge] complete: finish=%j blocks=%j", JSON.stringify(finish), blocks.map((b) => `${b.type}:${"text" in b ? b.text.length : "?"}`));
	let text = blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (text === "") {
		const reasoning = blocks.filter((block) => block.type === "reasoning").map((block) => block.text).join("\n").trim();
		if (reasoning !== "") text = reasoning;
	}
	return text;
}
/**
* Parse a JSON value out of a model response. Multi-level tolerance because
* models are sloppy: prose around the JSON, ```json fences, a truncated tail,
* or raw newlines inside string values all defeat a single JSON.parse. We
* walk candidates from strictest to loosest.
*/
function parseJson(text, wantArray) {
	const candidates = [];
	const push = (value) => {
		if (value !== void 0 && value.trim() !== "") candidates.push(value.trim());
	};
	push(text);
	push(/```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1]);
	const opener = wantArray ? "[" : "{";
	const closer = wantArray ? "]" : "}";
	const start = text.indexOf(opener);
	const end = text.lastIndexOf(closer);
	if (start !== -1 && end > start) push(text.slice(start, end + 1));
	const trimmed = text.replace(new RegExp(`${closer}[\\s\\S]*$`), closer);
	push(trimmed);
	const start2 = trimmed.indexOf(opener);
	if (start2 !== -1) push(trimmed.slice(start2));
	const repair = (value) => {
		let out = "";
		let inString = false;
		for (let i = 0; i < value.length; i++) {
			const ch = value[i];
			if (inString) {
				if (ch === "\\") {
					out += ch + (value[i + 1] ?? "");
					i++;
					continue;
				}
				if (ch === "\"") {
					inString = false;
					out += ch;
					continue;
				}
				if (ch === "\n" || ch === "\r") {
					out += "\\n";
					continue;
				}
				out += ch;
			} else {
				if (ch === "\"") inString = true;
				out += ch;
			}
		}
		return out;
	};
	for (const candidate of candidates) for (const attempt of [candidate, repair(candidate)]) try {
		const value = JSON.parse(attempt);
		if (!wantArray || Array.isArray(value)) return value;
		if (typeof value === "object" && value !== null) for (const key of Object.keys(value)) {
			const inner = value[key];
			if (Array.isArray(inner)) return inner;
		}
	} catch {}
	const preview = text.length > 300 ? text.slice(0, 300) + "…" : text;
	throw new Error(`模型输出中未找到 JSON 数据。模型原始输出：${preview}`);
}
/** Parse a JSON array (chapters, volumes, issues...). */
function parseJsonArray(text) {
	const value = parseJson(text, true);
	return Array.isArray(value) ? value : [];
}
/** Parse a JSON object. */
function parseJsonObject(text) {
	const value = parseJson(text, false);
	if (typeof value !== "object" || value === null) throw new Error("模型输出不是 JSON 对象");
	return value;
}
/** System prompt for story-bible extraction. */
function bibleSystemPrompt() {
	return [
		"你是一位资深网文编辑兼设定架构师。你会收到一份小说大纲，请把它提炼成结构化的「设定圣经」(Story Bible)，供后续写作时严格引用。",
		"要求：",
		"1. 忠于大纲，不自行发明大纲之外的设定。",
		"2. 角色卡覆盖大纲明确出现的角色（主角必含），每个角色给出性格标签、目标、关键关系。",
		"3. 世界规则覆盖力量体系、金手指机制、势力、地理等所有硬性规则，逐条列出。",
		"4. 红线列出大纲中明确禁止的内容（如无后宫、不圣母、无无脑碾压等）。",
		"5. 风格列出叙事基调、节奏、POV 等写作风格要点。",
		"输出必须是合法 JSON 对象，不要输出任何其他文字或 Markdown 代码块标记。",
		"重要：所有字符串值内部不得包含换行符（不要用多行字符串），JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。",
		"JSON 结构：",
		"{\"genre\": \"题材与基调一句话\", \"worldRules\": [\"规则1\", \"规则2\", ...], \"characters\": [{\"name\": \"角色名\", \"role\": \"protagonist|supporting|antagonist|other\", \"traits\": [\"标签1\", ...], \"goals\": \"目标与动机\", \"relations\": \"关键关系\"}], \"redLines\": [\"红线1\", ...], \"style\": [\"风格1\", ...]}"
	].join("\n");
}
/** Extract the story bible from an outline. */
async function extractBible(ctx, config, outline) {
	const user = `请为下面这部小说提炼设定圣经：\n\n${outline}`;
	const raw = parseJsonObject(await complete(ctx, config, {
		system: bibleSystemPrompt(),
		user,
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 16e3)
	}));
	const strArray = (value) => Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim() !== "") : [];
	const characters = Array.isArray(raw.characters) ? raw.characters.filter((v) => typeof v === "object" && v !== null).map((entry) => ({
		name: typeof entry.name === "string" ? entry.name.trim() : "未命名",
		role: [
			"protagonist",
			"supporting",
			"antagonist",
			"other"
		].includes(entry.role) ? entry.role : "other",
		traits: strArray(entry.traits),
		goals: typeof entry.goals === "string" ? entry.goals : "",
		relations: typeof entry.relations === "string" ? entry.relations : "",
		knowledge: strArray(entry.knowledge)
	})).filter((card) => card.name !== "") : [];
	const bible = {
		genre: typeof raw.genre === "string" ? raw.genre : "",
		worldRules: strArray(raw.worldRules),
		characters,
		redLines: strArray(raw.redLines),
		style: strArray(raw.style),
		generatedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	if (bible.worldRules.length === 0 && bible.characters.length === 0 && bible.redLines.length === 0) throw new Error("道藏生成失败：模型没有返回有效内容");
	return bible;
}
/** System prompt for volume planning. */
function volumeSystemPrompt() {
	return [
		"你是一位资深网文总编。你会收到一份小说大纲，请把全书划分为若干「卷」（分卷），每卷有明确的剧情定位与起止章节。",
		"要求：",
		"1. 大纲已有分卷时，严格遵循大纲的分卷结构；没有时按剧情弧线合理划分（3-8 卷）。",
		"2. 卷定位一句话说明该卷的剧情重心。",
		"3. chapterStart/chapterEnd 给出该卷覆盖的章节区间（从 1 开始连续编号）。",
		"输出必须是合法 JSON 数组，不要输出任何其他文字：",
		"[{\"no\": 1, \"title\": \"卷名\", \"summary\": \"卷定位与剧情重心\", \"chapterStart\": 1, \"chapterEnd\": 80}]",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。"
	].join("\n");
}
/** Plan volumes from an outline. */
async function planVolumes(ctx, config, outline) {
	const user = `请为下面这部小说划分卷：\n\n${outline}`;
	const parsed = parseJsonArray(await complete(ctx, config, {
		system: volumeSystemPrompt(),
		user,
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const volumes = [];
	for (let i = 0; i < parsed.length; i++) {
		const entry = parsed[i];
		if (typeof entry !== "object" || entry === null) continue;
		const no = typeof entry.no === "number" ? entry.no : i + 1;
		const title = typeof entry.title === "string" ? entry.title.trim() : `第${no}卷`;
		const summary = typeof entry.summary === "string" ? entry.summary.trim() : "";
		const start = typeof entry.chapterStart === "number" ? entry.chapterStart : void 0;
		const end = typeof entry.chapterEnd === "number" ? entry.chapterEnd : void 0;
		volumes.push({
			no,
			title: title.slice(0, 40),
			summary: summary.slice(0, 300),
			chapterStart: start ?? 1,
			chapterEnd: end ?? 1
		});
	}
	if (volumes.length === 0) throw new Error("卷计划生成失败：模型没有返回有效卷");
	return volumes;
}
/** Assign a chapter to its volume by number. */
function volumeOf(chapterNo, volumes) {
	if (volumes === void 0 || volumes.length === 0) return 0;
	for (const volume of volumes) if (chapterNo >= volume.chapterStart && chapterNo <= volume.chapterEnd) return volume.no;
	return volumes[volumes.length - 1]?.no ?? 0;
}
/** The chapter-planning prompt template. */
function planSystemPrompt(volumes) {
	return [
		"你是一位资深中文网文策划编辑，擅长把小说大纲拆解为可执行的章节计划。",
		"你会收到一份小说大纲。请根据大纲的设定、主线与节奏，规划出一份章节计划。",
		"要求：",
		"1. 每章必须有明确的核心剧情推进（不能只是过渡或凑字数）。",
		"2. 章节之间要衔接自然，前章结尾为后章埋下钩子。",
		"3. 严格遵循大纲的人设、金手指规则、战力体系与世界观设定，不得自行发明冲突设定。",
		"4. 输出必须是合法的 JSON 数组，不要输出任何其他文字或 Markdown 代码块标记。",
		"5. 数组每个元素格式：{\"title\": \"章节标题（10字以内，有网文感）\", \"beats\": \"结构化剧情要点（150-250字，必须包含四段，段间用换行分隔）：\\n本章目标：本章要完成的核心推进；\\n剧情要点：主要情节的起承转合（2-4 句）；\\n爽点/钩子：本章的爽点兑现或情绪钩子；\\n结尾钩子：本章结尾为下一章埋下的悬念\"}",
		"重要：beats 字段内部必须使用 \\n 转义表示换行（JSON 字符串内不得有真实换行符），其余字符串值也不得包含真实换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程或推理内容写在输出里。",
		volumes !== void 0 && volumes.length > 0 ? ["\n全书分卷结构（规划章节时需落在对应卷内）："].concat(volumes.map((v) => `第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`)).join("\n") : ""
	].join("\n");
}
/** Build the writing system prompt (bible + outline + active foreshadows). */
function writeSystemPrompt(project) {
	const bible = project.bible;
	const sections = [];
	if (bible !== void 0) {
		sections.push("==================== 设定圣经（写作时严格遵守） ====================");
		if (bible.genre !== "") sections.push(`题材基调：${bible.genre}`);
		if (bible.worldRules.length > 0) sections.push("世界规则：\n" + bible.worldRules.map((r) => `- ${r}`).join("\n"));
		if (bible.characters.length > 0) {
			sections.push("角色卡：");
			for (const card of bible.characters) {
				const roleName = {
					protagonist: "主角",
					supporting: "配角",
					antagonist: "反派",
					other: "其他"
				}[card.role];
				sections.push(`- ${card.name}（${roleName}）：${card.traits.join("、")}${card.goals !== "" ? `；目标：${card.goals}` : ""}${card.relations !== "" ? `；关系：${card.relations}` : ""}`);
				if (Array.isArray(card.knowledge) && card.knowledge.length > 0) sections.push(`  已知信息（该角色知道的：${card.knowledge.join("；")}；未列出的信息该角色一律不知道，不得写其知晓或提及）`);
			}
		}
		const roleLib = project.roles ?? [];
		if (roleLib.length > 0) {
			const labelName = {
				protagonist: "主角",
				female_lead: "女主",
				female_support: "女配",
				support: "配角",
				antagonist: "反派",
				extra: "路人"
			};
			sections.push("角色库（出场角色按定位规格刻画互动）：");
			for (const r of roleLib) sections.push(`- ${r.name}（${labelName[r.roleLabel]}）：${r.identity}${r.relations.length > 0 ? `；关系：${r.relations.join("、")}` : ""}`);
		}
		if (bible.redLines.length > 0) sections.push("写作红线（违反即失败）：\n" + bible.redLines.map((r) => `- ${r}`).join("\n"));
		if (bible.style.length > 0) sections.push("风格要求：\n" + bible.style.map((r) => `- ${r}`).join("\n"));
	}
	const worldBlock = renderWorld(project.world);
	if (worldBlock !== "") sections.push(worldBlock);
	sections.push("==================== 全书大纲 ====================");
	const outlineBlock = project.outline.length > 6e3 ? project.outline.slice(0, 6e3) + "\n…（大纲过长已节选，完整内容见总纲页）" : project.outline;
	sections.push(outlineBlock);
	sections.push("==================== 大纲结束 ====================");
	const assetsBlock = renderAllAssets(project.assets);
	if (assetsBlock !== "") sections.push(assetsBlock);
	const active = project.foreshadows.filter((f) => f.status === "planted" || f.status === "progressing");
	if (active.length > 0) {
		sections.push("==================== 活跃伏笔（近期需推进或回收的线索） ====================");
		for (const f of active) sections.push(`- [${f.status === "planted" ? "已埋设" : "推进中"}] ${f.description}${f.targetChapter !== void 0 ? `（预计 ${f.targetChapter} 章回收）` : ""}`);
	}
	const lines = (project.plotlines ?? []).filter((l) => l.status === "active" || l.status === "paused");
	if (lines.length > 0) {
		const kindName = {
			main: "主线",
			branch: "支线",
			character: "人物线",
			mystery: "悬念线"
		};
		sections.push("==================== 剧情线（本章应推进至少一条活跃线） ====================");
		for (const l of lines) sections.push(`- [${kindName[l.kind]}${l.status === "paused" ? "·暂停中" : ""}] ${l.name}：${l.goal}${l.progress !== "" ? `（当前进度：${l.progress}）` : ""}`);
	}
	sections.push("");
	sections.push("写作硬性要求：");
	sections.push("1. 每章 3000-4000 字（按中文字符计），只输出章节正文，不要输出标题、章回名、作者的话或任何 Markdown 标记。");
	sections.push("2. 以主角视角展开，动作、对话、心理描写交替推进，禁止大段设定说明。");
	sections.push("3. 尊重大纲与设定圣经：人设不崩、金手指规则不自相矛盾、战力不随意膨胀。");
	sections.push("4. 章末留一个钩子（悬念、反转或新线索），吸引读者读下一章。");
	sections.push("5. 语言流畅自然，符合中文网文语感，避免翻译腔与病句。");
	return sections.join("\n");
}
/**
* Plan chapters from an outline (optionally for one volume).
*/
async function planChapters(ctx, config, project, chapterCount, volumeNo, outputDir) {
	const volume = project.volumes?.find((v) => v.no === volumeNo);
	const existing = project.chapters;
	const startNo = existing.length === 0 ? 1 : Math.max(...existing.map((c) => c.no)) + 1;
	const continuation = existing.length > 0;
	const latestFacts = continuation && Array.isArray(project.facts) ? project.facts.slice(-15).map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 150)}`).join("\n") : "";
	let prevTail = "";
	if (continuation) {
		const written = existing.filter((c) => c.status !== "pending");
		const last = written[written.length - 1];
		if (last !== void 0 && last.file !== void 0 && outputDir !== void 0) try {
			prevTail = readFileSync(join(outputDir, last.file), "utf8").replace(/^#.*$/m, "").trim().slice(-600);
		} catch {}
	}
	const outlineBlock = continuation ? (() => {
		const cut = project.outline.indexOf("七、关键剧情桥段");
		if (cut > 1500) return project.outline.slice(0, cut).trimEnd() + "\n（大纲后续剧情桥段与分卷细节从略；续写请以「上一章结尾原文」与「最新剧情状态」为剧情起点）";
		return project.outline.slice(0, 3e3) + "\n…（大纲过长已节选）";
	})() : project.outline;
	const user = [
		"请为下面这部小说规划章节。",
		volume !== void 0 ? `本次只规划第 ${volume.no} 卷《${volume.title}》的章节：\n${volume.summary}` : continuation ? `本书已有 ${existing.length} 章已规划/已写作（见下方「已有章节」）。请规划**后续**章节：从第 ${startNo} 章开始。` : "请规划全书开篇章节。",
		continuation ? "【续写硬性要求】已有章节的剧情不得重写或重复，章节标题也不得与已有章节重复。以下情节均已在已有章节中发生过，后续章节**绝对不得再次出现**：穿越、暴雨送餐、滴血认主/古玉认主、首次进入墟境、用废铁淬炼首件法器、绝境肉身入鼎洗炼（该机缘已用尽）、杀死白袍弟子与灰衣随从、藏尸水沟。" : "",
		prevTail !== "" ? `【上一章（第 ${startNo - 1} 章）结尾原文】第 ${startNo} 章必须紧接此状态继续，从新的事件写起，不得回顾重述：\n${prevTail}` : "",
		latestFacts !== "" ? `【最新剧情状态（本书编年录，第 ${startNo - 1} 章结尾的事实）】规划续写时必须以此为起点，时间线、人物状态与地点衔接一致：\n${latestFacts}` : "",
		continuation ? "已有章节：\n" + existing.map((c) => {
			const sm = c.summary !== void 0 && c.summary !== "" ? `（${c.summary.slice(0, 120)}）` : "";
			return `第${c.no}章《${c.title}》${sm}`;
		}).join("\n") : "",
		`全书大纲（设定参考，续写剧情不得与设定冲突）：\n${outlineBlock}`,
		"",
		`请规划 ${chapterCount} 章。输出 JSON 数组（不要输出其他文字）：`
	].join("\n");
	const parsed = parseJsonArray(await complete(ctx, config, {
		system: planSystemPrompt(project.volumes) + (continuation ? "\n重要：本次是**续写规划**——已有章节的剧情不得重写或重复，新章节标题不得与已有章节标题相同，新章节的剧情必须从上一章结尾自然接续（人物状态、时间线、地点衔接一致）。" : ""),
		user,
		temperature: .7,
		maxTokens: Math.max(config.maxTokens, 4e4)
	}));
	const chapters = [];
	const existingNos = new Set(existing.map((c) => c.no));
	const existingTitles = new Set(existing.map((c) => c.title));
	let cursor = startNo;
	for (const item of parsed) {
		if (chapters.length >= chapterCount) break;
		if (typeof item !== "object" || item === null) continue;
		const entry = item;
		const title = typeof entry.title === "string" ? entry.title.trim().slice(0, 30) : "";
		const beats = typeof entry.beats === "string" ? entry.beats.trim() : "";
		if (title === "" && beats === "") continue;
		if (title !== "" && existingTitles.has(title)) continue;
		while (existingNos.has(cursor)) cursor++;
		const no = cursor++;
		chapters.push({
			no,
			volume: volumeOf(no, project.volumes),
			title: title || `第${no}章`,
			beats,
			targetChars: config.chapterChars,
			status: "pending"
		});
	}
	if (chapters.length === 0) throw new Error("章节计划生成失败：模型没有返回有效章节");
	return chapters;
}
/** The review system prompt. */
function reviewSystemPrompt(project) {
	const bible = project.bible;
	const sections = [
		"你是一位严格的网文审稿编辑。你会收到一章正文以及本书的设定圣经与红线。",
		"请从以下维度审查本章：",
		"1. 人设一致性：角色行为是否符合角色卡（主角不圣母、不无脑、痞坏有分寸等）。",
		"2. 设定一致性：金手指规则、战力体系、世界观是否与设定圣经冲突。",
		"3. 红线检查：是否触犯写作红线（无后宫、无擦边、无无脑碾压等）。",
		"4. 文笔质量：语病、翻译腔、AI 套话（\"不禁\"\"仿佛\"\"一时间\"等高频词滥用）、流水账。",
		"5. 节奏与爽点：本章是否有推进、有钩子，是否拖沓灌水。",
		"6. 逻辑漏洞：前后矛盾、时间线错误、对话失真。",
		"7. 反 AI 规则：逐条核对下方「反 AI 规则」清单，命中即列为问题。",
		"输出必须是合法 JSON 对象，不要输出任何其他文字：",
		"{\"score\": 0-100的整数, \"verdict\": \"一句话总评\", \"issues\": [{\"severity\": \"high|medium|low\", \"item\": \"问题描述\", \"suggestion\": \"修改建议\"}]}",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	];
	const assetsBlock = renderAllAssets(project.assets);
	if (assetsBlock !== "") sections.push("\n" + assetsBlock);
	if (bible !== void 0) {
		sections.push("\n==================== 设定圣经 ====================");
		if (bible.worldRules.length > 0) sections.push("世界规则：\n" + bible.worldRules.map((r) => `- ${r}`).join("\n"));
		if (bible.characters.length > 0) {
			sections.push("角色卡：");
			for (const card of bible.characters) {
				sections.push(`- ${card.name}（${card.role}）：${card.traits.join("、")}`);
				if (Array.isArray(card.knowledge) && card.knowledge.length > 0) sections.push(`  该角色知道：${card.knowledge.join("；")}（未列出的信息该角色不知道）`);
			}
		}
		if (bible.redLines.length > 0) sections.push("红线：\n" + bible.redLines.map((r) => `- ${r}`).join("\n"));
	}
	return sections.join("\n");
}
/** Run the AI review on one chapter. */
async function reviewChapter(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 的正文文件不存在`);
	const user = [
		`本章标题：《${chapter.title}》`,
		`本章剧情要点：${chapter.beats}`,
		"==================== 章节正文 ====================",
		body.replace(/^#\s+.*$/m, "").trim()
	].join("\n");
	const raw = parseJsonObject(await complete(ctx, config, {
		system: reviewSystemPrompt(project),
		user,
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 16e3)
	}));
	const issues = Array.isArray(raw.issues) ? raw.issues.filter((v) => typeof v === "object" && v !== null).map((entry) => ({
		severity: [
			"high",
			"medium",
			"low"
		].includes(entry.severity) ? entry.severity : "medium",
		item: typeof entry.item === "string" ? entry.item : "",
		suggestion: typeof entry.suggestion === "string" ? entry.suggestion : ""
	})).filter((issue) => issue.item !== "") : [];
	const score = typeof raw.score === "number" ? Math.max(0, Math.min(100, Math.round(raw.score))) : 60;
	const report = {
		score,
		passed: score >= config.reviewPassScore,
		verdict: typeof raw.verdict === "string" ? raw.verdict.slice(0, 200) : "",
		issues,
		reviewedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
	chapter.review = report;
	chapter.status = report.passed ? "approved" : "rejected";
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	return report;
}
/**
* 审查「任意正文文本」（作者手动编辑后的草稿，不落盘）。
* 复用审稿提示词与红线/道藏/反AI规则；仅返回报告，不改文件不改状态。
*/
async function reviewChapterText(ctx, config, project, text, previousReport) {
	const user = [
		`书名：《${project.bookName}》`,
		previousReport !== void 0 ? "==================== 上一轮审稿意见（逐条核对是否已解决） ====================\n" + previousReport.issues.map((it, i) => `${i + 1}. [${it.severity}] ${it.item}${it.suggestion !== "" ? ` → ${it.suggestion}` : ""}`).join("\n") : "",
		previousReport !== void 0 ? "==================== 修订稿（上一轮审稿后按意见修订的正文） ====================" : "==================== 待审查正文 ====================",
		text.slice(0, 2e4)
	].join("\n");
	const raw = parseJsonObject(await complete(ctx, config, {
		system: previousReport !== void 0 ? verifySystemPrompt(project) : reviewSystemPrompt(project),
		user,
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 16e3)
	}));
	const issues = Array.isArray(raw.issues) ? raw.issues.filter((v) => typeof v === "object" && v !== null).map((entry) => ({
		severity: [
			"high",
			"medium",
			"low"
		].includes(entry.severity) ? entry.severity : "medium",
		item: typeof entry.item === "string" ? entry.item : "",
		suggestion: typeof entry.suggestion === "string" ? entry.suggestion : ""
	})).filter((issue) => issue.item !== "") : [];
	const score = typeof raw.score === "number" ? Math.max(0, Math.min(100, Math.round(raw.score))) : 60;
	let passed = score >= config.reviewPassScore;
	if (previousReport !== void 0) {
		const hasHigh = issues.some((i) => i.severity === "high");
		const prevHighResolved = previousReport.issues.filter((i) => i.severity === "high").every((p) => !issues.some((i) => i.item.includes(p.item.slice(0, 12))));
		passed = !hasHigh && prevHighResolved;
	}
	return {
		score,
		passed,
		verdict: typeof raw.verdict === "string" ? raw.verdict.slice(0, 200) : "",
		issues,
		reviewedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
/** 验证模式系统提示：修订后逐条核对原意见是否解决，只挑新增 high，不重复挑剔主观项。 */
function verifySystemPrompt(project) {
	return [
		"你是一位网文审稿验证员。作者已按上一轮审稿意见修订了本章，你需要验证修订效果。",
		"你的任务（严格按此执行）：",
		"1. 逐条核对「上一轮意见」中的每一条是否已在修订稿中解决——已解决的不再列出；未解决或部分解决的，按原严重度列出（item 需注明\"未解决：原意见 xxx\"）。",
		"2. 只挑修订【新引入】的 high 级问题（设定矛盾/逻辑硬伤/事实错误）——新引入的 medium/low 主观项（文笔/套话/节奏）不要列。",
		"3. 禁止重复挑剔上一轮已指出且本次已解决的主观项（如\"缓缓/微微\"等套话、错别字）——即使换个说法再提也不行。",
		"4. 严禁为了显得专业而新增\"换一批毛病\"式的意见；如果修订稿已解决全部 high 且无新增 high，输出 issues 为空数组。",
		"score 评分：按修订稿整体质量给 50-90 分（解决全部 high 且无新增 high 时给 70 以上）。",
		"verdict：一句话结论（如\"原 high 已解决，无新增高风险问题\"或\"仍有未解决的 high\"）。",
		"输出必须是合法 JSON 对象：{\"score\": 数字, \"verdict\": \"一句话\", \"issues\": [{\"severity\": \"high|medium|low\", \"item\": \"问题\", \"suggestion\": \"建议\"}]}",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。",
		`本书设定圣经（核对设定冲突用）：\n${project.bible !== void 0 ? JSON.stringify(project.bible).slice(0, 3e3) : "（无）"}`
	].join("\n");
}
/** Build the author-review system prompt (narrative structure, not prose). */
function authorReviewSystemPrompt() {
	return [
		"你是一位网文作者复盘助手。你会收到：本章正文、上一章结尾（钩子）、上一章作者复盘（如有）、活跃剧情线与编年录近期事实。",
		"请从叙事结构层面复盘本章（不评文笔，那是审稿的事）：",
		"1. hookHonored：上一章结尾的钩子/悬念是否在本章兑现或推进（true/false）。",
		"2. hookNote：钩子兑现情况一句话；未兑现时说明并给出\"建议在第几章补\"的建议。",
		"3. endingHook：本章结尾钩子强度，0-10 的整数（低于 6 说明结尾平淡，读者可能不想看下一章）。",
		"4. plotlineProgress：本章推进了哪条剧情线（主线/支线名），或\"无实质推进\"（连续无推进要提醒）。",
		"5. advancedLines：本章实际推进的剧情线名称数组——从「活跃剧情线」清单中选出推进了的线（名称必须与清单中的线名一字不差；没推进任何线则输出空数组）。",
		"6. continuity：与上一章结尾的衔接检查（人物位置/时间/伤势/资源/对话状态），发现问题要指出。",
		"7. trend：结合上一章复盘看近期节奏趋势（是否连续拖沓、爽点密度是否下降、是否需要调整）。",
		"输出必须是合法 JSON 对象，不要输出任何其他文字：",
		"{\"hookHonored\": true或false, \"hookNote\": \"一句话\", \"endingHook\": 0-10整数, \"plotlineProgress\": \"一句话\", \"advancedLines\": [\"线名\"], \"continuity\": \"一句话\", \"trend\": \"一句话\"}",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	].join("\n");
}
/** 作者复盘：对一章做叙事结构复盘（钩子兑现/结尾钩子/推进/连续性/趋势）。 */
async function authorReviewChapter(ctx, config, project, chapterNo, body, prevTail) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	const prevChapter = chapterNo > 1 ? project.chapters.find((c) => c.no === chapterNo - 1) : void 0;
	const lines = (project.plotlines ?? []).filter((l) => l.status === "active" || l.status === "paused");
	const facts = (project.facts ?? []).slice(-10);
	const user = [
		`书名：《${project.bookName}》`,
		chapter !== void 0 ? `本章：第 ${chapter.no} 章《${chapter.title}》` : `本章：第 ${chapterNo} 章`,
		prevTail !== "" ? `==================== 上一章（第 ${chapterNo - 1} 章）结尾（钩子） ====================\n${prevTail}` : "（本书第一章，无上一章钩子；hookHonored 视为 true，hookNote 写\"开篇无前置钩子\"）",
		prevChapter?.authorReview !== void 0 ? `==================== 上一章作者复盘 ====================\n${JSON.stringify(prevChapter.authorReview)}` : "",
		lines.length > 0 ? `==================== 活跃剧情线 ====================\n${lines.map((l) => `- [${l.kind}] ${l.name}：${l.goal}${l.progress !== "" ? `（${l.progress}）` : ""}`).join("\n")}` : "",
		facts.length > 0 ? `==================== 编年录近期事实 ====================\n${facts.map((f) => `[第${f.chapterNo}章] ${f.text}`).join("\n")}` : "",
		"==================== 本章正文 ====================",
		body.slice(0, 16e3),
		"",
		"只输出 JSON 对象。"
	].join("\n");
	const raw = parseJsonObject(await complete(ctx, config, {
		system: authorReviewSystemPrompt(),
		user,
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 4e3)
	}));
	const knownLineNames = new Set((project.plotlines ?? []).map((l) => l.name));
	const advancedLines = Array.isArray(raw.advancedLines) ? raw.advancedLines.filter((n) => typeof n === "string" && n.trim() !== "" && knownLineNames.has(n.trim())).map((n) => n.trim()) : [];
	return {
		hookHonored: raw.hookHonored === true,
		hookNote: typeof raw.hookNote === "string" ? raw.hookNote.slice(0, 200) : "",
		endingHook: typeof raw.endingHook === "number" ? Math.max(0, Math.min(10, Math.round(raw.endingHook))) : 5,
		plotlineProgress: typeof raw.plotlineProgress === "string" ? raw.plotlineProgress.slice(0, 200) : "",
		advancedLines,
		continuity: typeof raw.continuity === "string" ? raw.continuity.slice(0, 200) : "",
		trend: typeof raw.trend === "string" ? raw.trend.slice(0, 200) : "",
		reviewedAt: (/* @__PURE__ */ new Date()).toISOString()
	};
}
/** 复盘后自动关联：把本章号写入复盘标记推进的剧情线（按名称匹配，去重）。 */
function autoLinkPlotlines(project, chapterNo, advancedLines) {
	if (!Array.isArray(project.plotlines) || advancedLines.length === 0) return;
	for (const line of project.plotlines) if (advancedLines.includes(line.name) && !line.chapters.includes(chapterNo)) line.chapters.push(chapterNo);
}
/** AI 建议剧情线：基于大纲/卷计划/已写章节/编年录，提炼候选线。 */
async function suggestPlotlines(ctx, config, project) {
	const system = [
		"你是一位网文剧情架构师。根据本书的大纲、卷计划、已写章节标题与编年录，为作者提炼建议的剧情线（主线/支线/人物线/悬念线）。",
		"每条线要：名称简洁有力；目标写清楚这条线最终要完成什么；progress 写当前推进到哪（没有就空字符串）。",
		"建议 4-8 条，覆盖：1 条主线、1-2 条人物线、1-2 条悬念线、1-3 条支线。避免与大纲明显重复的废话线。",
		"输出必须是合法 JSON 数组，格式：[{\"name\": \"线名\", \"kind\": \"main|branch|character|mystery\", \"goal\": \"目标\", \"progress\": \"\"}]",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending");
	const raw = parseJsonArray(await complete(ctx, config, {
		system,
		user: [
			`书名：《${project.bookName}》`,
			`大纲（节选前 4000 字）：\n${project.outline.slice(0, 4e3)}`,
			project.volumes !== void 0 && project.volumes.length > 0 ? `卷计划：\n${project.volumes.map((v) => `第${v.no}卷《${v.title}》：${v.summary}`).join("\n")}` : "",
			written.length > 0 ? `已写章节：\n${written.map((c) => `第${c.no}章《${c.title}》${c.summary !== void 0 && c.summary !== "" ? `：${c.summary.slice(0, 80)}` : ""}`).join("\n")}` : "",
			(project.facts ?? []).length > 0 ? `编年录近期事实（最近 15 条）：\n${(project.facts ?? []).slice(-15).map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 100)}`).join("\n")}` : "",
			"只输出 JSON 数组。"
		].join("\n\n"),
		temperature: .6,
		maxTokens: Math.max(config.maxTokens, 4e3)
	}));
	const lines = [];
	const kinds = /* @__PURE__ */ new Set([
		"main",
		"branch",
		"character",
		"mystery"
	]);
	for (const entry of raw) {
		if (typeof entry !== "object" || entry === null) continue;
		const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 40) : "";
		if (name === "") continue;
		lines.push({
			id: "",
			name,
			kind: kinds.has(entry.kind) ? entry.kind : "branch",
			goal: typeof entry.goal === "string" ? entry.goal.trim().slice(0, 300) : "",
			progress: typeof entry.progress === "string" ? entry.progress.trim().slice(0, 300) : "",
			status: "active",
			chapters: [],
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
	return lines;
}
/** AI 刷新单条剧情线的进度：结合编年录与各章摘要分析该线推进到哪。 */
async function refreshPlotlineProgress(ctx, config, project, line) {
	const system = [
		"你是一位网文剧情线管理员。请根据「剧情线信息」与「本书已写章节摘要/编年录」，判断这条线目前推进到了哪一步。",
		"输出一句话（30-60 字）：这条线当前的状态、最近一次推进发生在第几章、下一步可能的方向。如果这条线还没开始推进，明确说\"尚未推进\"。",
		"输出必须是合法 JSON 对象：{\"progress\": \"一句话\"}",
		"重要：不要输出任何其他文字。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.summary !== void 0 && c.summary !== "");
	const raw = parseJsonObject(await complete(ctx, config, {
		system,
		user: [
			`剧情线：${line.name}（${line.kind}）`,
			`目标：${line.goal}`,
			`已知进度：${line.progress !== "" ? line.progress : "（无）"}`,
			`已关联章节：${line.chapters.length > 0 ? line.chapters.map((n) => `第${n}章`).join("、") : "（无）"}`,
			`章节摘要（最近 8 章）：\n${written.slice(-8).map((c) => `第${c.no}章《${c.title}》：${c.summary.slice(0, 120)}`).join("\n")}`,
			(project.facts ?? []).length > 0 ? `编年录近期事实（最近 15 条）：\n${(project.facts ?? []).slice(-15).map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 100)}`).join("\n")}` : "",
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 2e3)
	}));
	return typeof raw.progress === "string" ? raw.progress.trim().slice(0, 300) : "";
}
/** ✨ AI 从全书提炼角色库：大纲 + 道藏 + 编年录 + 章节摘要 → 结构化角色清单。 */
async function extractRoles(ctx, config, project) {
	const system = [
		"你是一位网文角色库管理员。请根据本书的大纲、设定、编年录与章节摘要，提炼完整的角色库。",
		"覆盖原则：所有在编年录/章节中实际出场或有名有姓的角色都应收录；无名的功能性人物（如\"矮胖姑娘\"）用其身份简称收录并标注。",
		"数量控制：最多输出 10 个角色，宁缺毋滥；路人级一次带过的不要收录。",
		"每个角色输出：",
		"1. name：角色名（或身份简称）。",
		"2. roleLabel：定位——protagonist=主角；female_lead=女主（唯一知己/感情线核心，无后宫前提下只此一位）；female_support=重要女配；support=普通配角；antagonist=反派；extra=路人/背景。",
		"3. identity：身份一句话（宗门/势力/血脉/职业）。",
		"4. traits：3-6 个性格标签。",
		"5. goals：目标与动机一句话。",
		"6. relations：关系网数组，格式[\"角色名（关系）\", ...]。",
		"7. arc：成长线数组，格式[\"阶段：说明\", ...]（如\"出场：祭品身份\"/\"转折：祭祀被中断脱身\"）。",
		"8. knowledge：该角色已经知道的关键信息（3-8 条），不知道的信息不要写进去。",
		"精简要求：identity 控制在 30 字内；traits 3-6 个短标签；goals 60 字内；relations 2-5 条；arc 2-4 条；knowledge 每条 40 字内。整体输出量要紧凑，避免冗长。",
		"重要：用户消息里列出的「已收录角色」绝不要再次输出——这些角色已经在角色库里，跳过它们，只提炼未收录的。",
		"输出必须是合法 JSON 数组，不要输出其他文字：[{\"name\":\"...\", \"roleLabel\":\"...\", \"identity\":\"...\", \"traits\":[...], \"goals\":\"...\", \"relations\":[...], \"arc\":[...], \"knowledge\":[...]}]",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	const existingRoles = project.roles ?? [];
	const raw = parseJsonArray(await complete(ctx, config, {
		system,
		user: [
			`书名：《${project.bookName}》`,
			existingRoles.length > 0 ? `已收录角色（跳过，不要输出）：${existingRoles.map((r) => r.name).join("、")}` : "",
			`大纲（节选前 3000 字）：\n${project.outline.slice(0, 3e3)}`,
			project.bible !== void 0 && project.bible.characters.length > 0 ? `已有角色卡（补充信息）：\n${project.bible.characters.map((c) => `- ${c.name}（${c.role}）：${c.traits.join("、")}${c.goals !== "" ? `；目标：${c.goals}` : ""}`).join("\n")}` : "",
			(project.facts ?? []).length > 0 ? `编年录（最近 60 条）：\n${(project.facts ?? []).slice(-60).map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 80)}`).join("\n")}` : "",
			written.length > 0 ? `已写章节标题（${written.length} 章）：\n${written.map((c) => `第${c.no}章《${c.title}》`).join("、")}` : "",
			"只输出 JSON 数组。"
		].join("\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 24e3)
	}));
	const labels = /* @__PURE__ */ new Set([
		"protagonist",
		"female_lead",
		"female_support",
		"support",
		"antagonist",
		"extra"
	]);
	const strArr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim() !== "") : [];
	const roles = [];
	for (const entry of raw) {
		if (typeof entry !== "object" || entry === null) continue;
		const name = typeof entry.name === "string" ? entry.name.trim().slice(0, 30) : "";
		if (name === "") continue;
		roles.push({
			name,
			roleLabel: labels.has(entry.roleLabel) ? entry.roleLabel : "support",
			identity: typeof entry.identity === "string" ? entry.identity.slice(0, 100) : "",
			traits: strArr(entry.traits).map((t) => t.slice(0, 20)).slice(0, 8),
			goals: typeof entry.goals === "string" ? entry.goals.slice(0, 200) : "",
			relations: strArr(entry.relations).map((r) => r.slice(0, 60)).slice(0, 10),
			arc: strArr(entry.arc).map((a) => a.slice(0, 120)).slice(0, 10),
			knowledge: strArr(entry.knowledge).map((k) => k.slice(0, 120)).slice(0, 12)
		});
	}
	return roles;
}
/**
* 为单个角色提炼「动漫形象描述词」：扫描该角色出场的已写章节正文，
* 截取含外貌描写的段落，交给 LLM 提炼中文描述 + 英文绘图标签。
*/
async function extractRoleVisual(ctx, config, project, outputDir, roleName) {
	const role = (project.roles ?? []).find((r) => r.name === roleName);
	if (role === void 0) throw new Error(`角色「${roleName}」不在角色库中`);
	const appearanceHints = /(发|眉|眼|眸|脸|肤|唇|身材|身高|衣|袍|裙|衫|靴|腰带|气质|模样|长相|容貌|披|束|扎|戴|佩|挂|绣|青|白|黑|红|蓝|紫|灰|银|金|少年|青年|少女|汉子|老者|中年|纤细|挺拔|瘦削|壮实|清秀|俊朗|英气|阴鸷|慈眉)/;
	const excerpts = [];
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating" && c.file !== void 0).slice(-60);
	for (const chapter of written) {
		const body = readChapterFile(outputDir, chapter);
		if (body === void 0) continue;
		const paras = body.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
		let perChapter = 0;
		for (const para of paras) {
			if (perChapter >= 2 || excerpts.length >= 12) break;
			if (!para.includes(roleName)) continue;
			if (appearanceHints.test(para) || excerpts.length < 4) {
				excerpts.push({
					no: chapter.no,
					text: para.slice(0, 220)
				});
				perChapter++;
			}
		}
		if (excerpts.length >= 12) break;
	}
	if (excerpts.length === 0) throw new Error(`正文中未找到「${roleName}」的出场描写（仅搜索最近 60 章），请确认角色名与正文一致`);
	const raw = parseJsonObject(await complete(ctx, config, {
		system: [
			"你是一位动漫角色设定师。根据网文正文中该角色的实际外貌描写，提炼「动漫形象描述词」，用于 AI 绘图（NovelAI / Stable Diffusion / Midjourney / 豆包等）生成一致的角色立绘。",
			"硬性要求（依据优先）：",
			"1. 发色/发型/瞳色/服装/气质/标志物必须来自提供的正文段落，不得凭空发明。",
			"2. 正文未明确写到的项目（如瞳色没写），用「未定」标注，不要编造。",
			"3. 服装优先取正文明确出现的（颜色+款式），多次出现取最常穿的组合。",
			"输出三个部分：",
			"- zh：中文外貌描述，一段连贯文字（60-150 字）：发色发型、瞳色、脸型气质、服装（颜色款式）、身材、标志性物件。",
			"- en：英文绘图标签，booru 风格、逗号分隔、小写，30-50 个标签：含性别（1boy/1girl）、发色、发型、瞳色、服装（如 chinese hanfu / daoist robe）、气质、背景无关项。不要输出负面提示词。",
			"- tags：中文关键标签数组，5-10 个（如 [\"黑发\",\"束发\",\"青色道袍\",\"清秀\",\"腰悬古玉\"]）。",
			"- source：说明依据（如\"第1章/第8章外貌描写；瞳色未明确\"）。",
			"输出必须是合法 JSON 对象：{\"zh\": \"...\", \"en\": \"...\", \"tags\": [...], \"source\": \"...\"}",
			"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
			"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
		].join("\n"),
		user: [
			`书名：《${project.bookName}》`,
			`目标角色：${role.name}（${role.identity}）`,
			role.traits.length > 0 ? `性格标签：${role.traits.join("、")}` : "",
			`正文出场描写（含外貌线索的段落）：`,
			...excerpts.map((e) => `[第${e.no}章] ${e.text}`),
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 4e3)
	}));
	const zh = typeof raw.zh === "string" ? raw.zh.trim().slice(0, 500) : "";
	const en = typeof raw.en === "string" ? raw.en.trim().slice(0, 1500) : "";
	const tags = Array.isArray(raw.tags) ? raw.tags.filter((t) => typeof t === "string" && t.trim() !== "").map((t) => t.trim().slice(0, 20)).slice(0, 12) : [];
	const source = typeof raw.source === "string" ? raw.source.trim().slice(0, 300) : "";
	if (zh === "" || en === "") throw new Error("形象描述提炼失败：LLM 未返回有效 JSON");
	return {
		zh,
		en,
		tags,
		source
	};
}
/**
* 开书想法 → AI 大纲：输入一句话想法，生成 2-3 个方向不同、可直接开书的完整大纲方案。
* @param count 本次生成几个（默认 3，最多 3）
* @param exclude 已暂留方案的剧情方向/卖点摘要（换批时避开，防止重复）
*/
async function suggestOutlines(ctx, config, idea, count = 3, exclude = []) {
	const n = Math.max(1, Math.min(3, Math.floor(count)));
	const parsed = parseJsonArray(await complete(ctx, config, {
		system: [
			"你是一位资深网文策划。作者只给了一句「想法」，你需要把它扩展成 2-3 个【方向差异明显】的完整小说大纲方案，供作者挑选。",
			"每个方案必须满足：",
			"1. bookName：书名（6 字以内，抓眼球、点题）。",
			"2. genre：题材（如 仙侠修真 / 都市异能 / 玄幻 / 悬疑）。",
			"3. sellingPoint：核心卖点一句话（金手指/爽点/差异化，40 字内）。",
			"4. outline：完整大纲文本（至少 800 字，可直接作为开书大纲），结构包含：书名与题材、金手指/核心设定、主角人设与动机、主线剧情走向（至少 5 个阶段）、关键配角与势力、卖点与爽点设计、预计分卷（3-5 卷）。",
			"方向差异要求：",
			"- 方案之间的金手指/剧情走向必须明显不同（如：苟道发育流 vs 随身老爷爷流 vs 群像争霸流），不能只是换书名。",
			"- 忠实于作者想法的核心要素，但允许在不同方向上进行合理演绎。",
			"- 不输出任何与已列「需避开的方向」雷同的方案。",
			"输出必须是合法 JSON 数组，只输出数组本身：",
			"[{\"id\": \"唯一id\", \"bookName\": \"...\", \"genre\": \"...\", \"sellingPoint\": \"...\", \"outline\": \"...\"}]",
			`本次只输出 ${n} 个方案。`,
			"重要：所有字符串值内部不得包含换行符（大纲内部分段请用「。\n」或「；」自然断句），JSON 必须在一段内完整结束。",
			"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
		].join("\n"),
		user: [
			`作者的想法：${idea}`,
			exclude.length > 0 ? `需避开的已暂留方案方向（新方案不得与之雷同）：\n${exclude.map((e, i) => `${i + 1}. ${e}`).join("\n")}` : "",
			`请生成 ${n} 个大纲方案。`,
			"只输出 JSON 数组。"
		].join("\n\n"),
		temperature: .85,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const candidates = [];
	for (const entry of parsed) {
		if (typeof entry !== "object" || entry === null) continue;
		const bookName = typeof entry.bookName === "string" ? entry.bookName.trim().slice(0, 30) : "";
		const outline = typeof entry.outline === "string" ? entry.outline.trim() : "";
		if (bookName === "" || outline.length < 300) continue;
		candidates.push({
			id: typeof entry.id === "string" && entry.id !== "" ? entry.id : `oc-${Date.now().toString(36)}-${candidates.length}`,
			bookName,
			genre: typeof entry.genre === "string" ? entry.genre.trim().slice(0, 20) : "",
			sellingPoint: typeof entry.sellingPoint === "string" ? entry.sellingPoint.trim().slice(0, 120) : "",
			outline
		});
	}
	if (candidates.length === 0) throw new Error("大纲方案生成失败：LLM 未返回有效 JSON（可重试）");
	return candidates.slice(0, n);
}
/** 拆书分析：对已写章节做结构/人物/文风/卖点四维体检。
*  两阶段管道（借鉴 AI-Novel-Writing-Assistant）：
*  ① 源片段笔记：每章抽取结构化笔记（剧情/人物/设定/写法/卖点/短板信号）
*  ② 分节分析：按维度各跑一次 LLM，输出可读分析稿 + 结构化数据 + 证据链。
*  @param scope 'recent'(默认最近20章) | 'volume:N' | 'all'
*  @param preset 'quick'(总览/剧情/人物/文风) | 'standard'(+卖点)
*  @param budgetTokens token 预算上限（超过即截断章节取样）。
*/
async function breakdownBook(ctx, config, project, outputDir, scope = "recent", preset = "quick", budgetTokens = 5e4) {
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating" && c.summary !== void 0 && c.summary !== "");
	let selected = written;
	if (scope === "recent") selected = written.slice(-20);
	else if (/^volume:\d+$/.test(scope)) {
		const v = Number(scope.slice(7));
		selected = written.filter((c) => c.volume === v);
	}
	if (selected.length === 0) throw new Error("没有可分析的已写章节（需要已生成并带摘要）");
	let budget = budgetTokens;
	const chunks = [];
	for (const c of selected.slice().reverse()) {
		const bodySlice = (readChapterFile(outputDir, c) ?? "").replace(/^#\s+.*$/m, "").trim().slice(0, 4e3);
		const est = Math.ceil((bodySlice.length + (c.summary?.length ?? 0)) / 4) + 400;
		if (est > budget && chunks.length > 0) break;
		chunks.unshift({
			no: c.no,
			title: c.title,
			summary: c.summary ?? "",
			body: bodySlice
		});
		budget -= est;
	}
	const notes = [];
	let usedTokens = 0;
	const noteSystem = [
		"你是中文网文拆书助手。把单章正文整理成结构化笔记，供后续章节级分析复用。",
		"只输出 JSON 对象：",
		"{\"summary\": \"1-2句\", \"plotPoints\": [\"...\"], \"characters\": [\"...\"], \"worldbuilding\": [\"...\"], \"styleTechniques\": [\"...\"], \"marketHighlights\": [\"...\"], \"weaknessSignals\": [\"...\"]}",
		"硬规则：只提取正文明确出现的信息；每数组最多 4 项；不要补写原文外的动机/意图；evidence 不在此阶段输出。",
		"重要：直接输出 JSON，不要输出其他文字；字符串内不含换行。"
	].join("\n");
	for (const ch of chunks) {
		const noteUser = [
			`第${ch.no}章《${ch.title}》`,
			"正文：",
			ch.body.slice(0, 3e3)
		].join("\n");
		try {
			const raw = parseJsonObject(await complete(ctx, config, {
				system: noteSystem,
				user: noteUser,
				temperature: .2,
				maxTokens: Math.max(config.maxTokens, 3e3)
			}));
			const pick = (k) => Array.isArray(raw[k]) ? raw[k].filter((x) => typeof x === "string" && x.trim() !== "").map((x) => x.trim().slice(0, 120)).slice(0, 4) : [];
			notes.push(`【第${ch.no}章《${ch.title}》】\n摘要：${typeof raw.summary === "string" ? raw.summary.slice(0, 200) : ""}\n剧情：${pick("plotPoints").join("；")}\n人物：${pick("characters").join("；")}\n设定：${pick("worldbuilding").join("；")}\n写法：${pick("styleTechniques").join("；")}\n卖点：${pick("marketHighlights").join("；")}\n短板信号：${pick("weaknessSignals").join("；") || "（无明显短板信号）"}`);
			usedTokens += 800;
		} catch {}
	}
	const sectionsConfig = [
		{
			key: "overview",
			title: "拆书总览",
			focus: "一句话定位、题材标签、整体优势与短板",
			system: [
				"你是资深中文网文拆书分析师，负责《拆书总览》小节。",
				"基于给定章节笔记做低风险综合判断，输出 JSON：{\"markdown\": \"可直接展示的分析稿（简体中文，先给结论再说明体现在哪、为何成立）\", \"structured\": {\"oneLinePositioning\": \"一句话定位\", \"genreTags\": [\"题材标签\"], \"sellingPointTags\": [\"卖点标签\"], \"strengths\": [\"整体优势\"], \"weaknesses\": [\"整体短板\"]}}",
				"硬规则：只基于笔记归纳；推断用「更偏向/可能」等谨慎措辞；证据不足写「材料不足」；不虚构原文细节。",
				"重要：直接输出 JSON，字符串内不含换行。"
			].join("\n")
		},
		{
			key: "plot",
			title: "剧情结构",
			focus: "主线梗概、阶段推进、冲突升级、节奏风险",
			system: [
				"你是资深中文网文拆书分析师，负责《剧情结构》小节。",
				"基于给定章节笔记分析，输出 JSON：{\"markdown\": \"分析稿（简体中文，先结论后依据）\", \"structured\": {\"mainlineSummary\": \"主线梗概\", \"phaseProgressions\": [\"阶段推进\"], \"escalationDesigns\": [\"冲突升级\"], \"paceRisks\": [\"节奏风险\"], \"reusablePatterns\": [\"可复用套路\"]}}",
				"硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。",
				"重要：直接输出 JSON，字符串内不含换行。"
			].join("\n")
		},
		{
			key: "character",
			title: "人物系统",
			focus: "主角定位、配角功能、关系网络、成长弧线、辨识度风险",
			system: [
				"你是资深中文网文拆书分析师，负责《人物系统》小节。",
				"基于给定章节笔记分析，输出 JSON：{\"markdown\": \"分析稿（简体中文，先结论后依据）\", \"structured\": {\"protagonistPositioning\": \"主角定位\", \"supportingFunctions\": [\"配角功能\"], \"relationshipNetwork\": [\"关系网络\"], \"growthArcs\": [\"成长弧线\"], \"clarityRisks\": [\"辨识度风险\"]}}",
				"硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。",
				"重要：直接输出 JSON，字符串内不含换行。"
			].join("\n")
		},
		{
			key: "style",
			title: "文风与技法",
			focus: "叙事视角、语言风格、描写方式、节奏控制、钩子设计、可复用写法",
			system: [
				"你是资深中文网文拆书分析师，负责《文风与技法》小节。",
				"基于给定章节笔记分析，输出 JSON：{\"markdown\": \"分析稿（简体中文，先结论后依据）\", \"structured\": {\"narrativePov\": \"叙事视角\", \"languageStyle\": \"语言风格\", \"dialoguePatterns\": [\"对话特征\"], \"rhythmControl\": [\"节奏控制\"], \"hookDesigns\": [\"钩子设计\"], \"reusableTechniques\": [\"可复用写法\"]}}",
				"硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。",
				"重要：直接输出 JSON，字符串内不含换行。"
			].join("\n")
		}
	];
	if (preset === "standard") sectionsConfig.push({
		key: "market",
		title: "商业化卖点",
		focus: "读者爽点、点击驱动、人物/题材卖点、商业化风险",
		system: [
			"你是资深中文网文拆书分析师，负责《商业化卖点》小节。",
			"基于给定章节笔记分析，输出 JSON：{\"markdown\": \"分析稿（简体中文，先结论后依据）\", \"structured\": {\"hookPoints\": [\"读者爽点\"], \"clickDrivers\": [\"点击驱动\"], \"characterSellingPoints\": [\"人物卖点\"], \"genreSellingPoints\": [\"题材卖点\"], \"commercialRisks\": [\"商业化风险\"]}}",
			"硬规则：只基于笔记归纳；推断谨慎措辞；不虚构。",
			"重要：直接输出 JSON，字符串内不含换行。"
		].join("\n")
	});
	const notesText = notes.join("\n\n");
	const sections = [];
	const evidence = [];
	for (const sec of sectionsConfig) try {
		const raw = parseJsonObject(await complete(ctx, config, {
			system: sec.system,
			user: `分析范围：${selected.length} 章（${scope === "all" ? "全书" : scope === "recent" ? "最近 20 章" : "指定卷"}）。\n\n章节笔记：\n${notesText}`,
			temperature: .3,
			maxTokens: Math.max(config.maxTokens, 6e3)
		}));
		sections.push({
			key: sec.key,
			title: sec.title,
			markdown: typeof raw.markdown === "string" ? raw.markdown.trim() : "（生成失败）",
			structured: typeof raw.structured === "object" && raw.structured !== null ? raw.structured : {}
		});
		usedTokens += 2e3;
	} catch {
		sections.push({
			key: sec.key,
			title: sec.title,
			markdown: "（本节生成失败，可重试）",
			structured: {}
		});
	}
	return {
		sections,
		evidence,
		chaptersScanned: chunks.length,
		usedTokens
	};
}
/**
* 漫剧分镜生成：把一章正文改编为短视频漫剧分镜（吸收 manga-script-master 方法论）。
* 产出：本集标题 + 赛道节奏说明 + 角色视觉锚点卡 + 分镜表（8-12 格）+ 结尾钩子。
* 角色锚点优先复用角色库 imagePrompt（无则从正文提炼）。
*/
async function generateStoryboard(ctx, config, project, outputDir, chapterNo, genre, platform, tool) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 尚未生成正文`);
	const roleCards = (project.roles ?? []).filter((r) => r.imagePrompt !== void 0 && (body.includes(r.name) || chapter.summary?.includes(r.name) === true)).map((r) => ({
		name: r.name,
		anchor: r.imagePrompt.zh.slice(0, 120),
		tags: r.imagePrompt.en.slice(0, 300)
	})).slice(0, 3);
	const raw = parseJsonObject(await complete(ctx, config, {
		system: [
			"你是一位精通短视频算法与 AIGC 的顶级漫剧导演。把给定的一章网文改编为高完播率的漫剧分镜。",
			"硬性要求：",
			"1. 前 3 秒必须有强冲突或视觉冲击（黄金开局）；每 10 秒至少一个小高潮；结尾必须有悬念钩子。",
			"2. 所有情感必须具象化为动作（不能写\"他很愤怒\"，要写\"他拳头砸碎桌角，碎片飞溅\"）。",
			"3. 台词每句 ≤15 字，用画面推进叙事。",
			"4. 总时长 60-120 秒，分镜 8-12 格，每格标注时间码、景别、转场/动效。",
			"5. 输出 JSON：",
			"{\"title\": \"本集标题（核心设定+冲突+悬念句式）\", \"pacingNote\": \"赛道判断与节奏说明（按爽文/甜宠/悬疑/搞笑模型）\", \"hook\": \"本集钩子一句话\", \"panels\": [{\"timecode\": \"0:00-0:03\", \"shot\": \"特写\", \"visual\": \"具象画面描述\", \"dialogue\": \"(情绪)台词\", \"transition\": \"硬切/闪白等\", \"prompt\": \"英文AI提示词：角色标签+表情+动作+场景+景别+光影+风格+9:16\"}], \"endingHook\": \"结尾钩子台词\"}",
			"6. 英文 prompt 里的角色标签必须复用提供的角色锚点标签；多角色同框用 left/right/foreground 分隔。",
			"7. 严禁在提示词里出现文字/水印（画面内字幕后期加）。",
			"重要：直接输出 JSON，字符串内不含换行。"
		].join("\n"),
		user: [
			`书名：《${project.bookName}》`,
			`章节：第 ${chapter.no} 章《${chapter.title}》`,
			chapter.summary !== void 0 ? `章节摘要：${chapter.summary}` : "",
			`目标平台：${platform}（默认抖音竖屏 9:16）`,
			`赛道：${genre !== "" ? genre : "（由你按内容判断：爽文/甜宠/悬疑/搞笑）"}`,
			`AI 工具：${tool}（影响提示词格式）`,
			roleCards.length > 0 ? `角色视觉锚点（英文标签全分镜强制复用）：\n${roleCards.map((r) => `- ${r.name}：${r.tags}`).join("\n")}` : "（无角色锚点卡，从正文提炼 1-2 个核心角色并给出标签）",
			"==================== 正文 ====================",
			body.replace(/^#\s+.*$/m, "").trim().slice(0, 6e3),
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .5,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const str = (v, fallback = "") => typeof v === "string" ? v.trim() : fallback;
	const panels = (Array.isArray(raw.panels) ? raw.panels.filter((p) => typeof p === "object" && p !== null) : []).map((p, i) => ({
		index: i + 1,
		timecode: str(p.timecode, `0:${String(i * 10).padStart(2, "0")}`),
		shot: str(p.shot, "中景"),
		visual: str(p.visual),
		dialogue: str(p.dialogue),
		transition: str(p.transition, "硬切"),
		prompt: str(p.prompt)
	})).filter((p) => p.visual !== "").slice(0, 12);
	return {
		title: str(raw.title, `第 ${chapter.no} 集`),
		pacingNote: str(raw.pacingNote, "（按内容判断赛道节奏）"),
		hook: str(raw.hook),
		characters: roleCards.map((r) => ({
			name: r.name,
			visualAnchor: r.anchor,
			tags: r.tags,
			expressions: []
		})),
		panels,
		endingHook: str(raw.endingHook)
	};
}
/**
* 漫剧分集计划：AI 通读一卷的章节标题+摘要+beats，按故事弧线把章节分组为漫剧集。
* 原则（吸收 manga-script 节奏模型）：高潮章单独成集、过渡章合并、断点选在钩子最强处。
*/
async function planStoryboardEpisodes(ctx, config, project, volumeNo, platform, maxEpisodes) {
	const volume = project.volumes?.find((v) => v.no === volumeNo);
	if (volume === void 0) throw new Error(`第 ${volumeNo} 卷不存在（卷计划未生成或卷号错误）`);
	const chapters = project.chapters.filter((c) => c.volume === volumeNo && c.status !== "pending" && c.status !== "generating").sort((a, b) => a.no - b.no);
	if (chapters.length === 0) throw new Error(`第 ${volumeNo} 卷没有已写章节`);
	const chapterBriefs = chapters.map((c) => {
		const beatsHead = (c.beats ?? "").split("\n")[0] ?? "";
		return `第${c.no}章《${c.title}》｜${beatsHead.slice(0, 60)}｜${(c.summary ?? "").slice(0, 100)}`;
	});
	const raw = parseJsonObject(await complete(ctx, config, {
		system: [
			"你是一位精通短视频算法与漫剧节奏的总导演。把给定的一卷网文改编为「漫剧分集计划」——不是按章分，而是按故事弧线分集。",
			"分集原则：",
			"1. 高潮章（大冲突/身份揭晓/大收获）单独成集或两章一集；过渡章（赶路/准备/日常）2-3 章合并为一集；支线穿插章并入相邻主线圈。",
			"2. 每集 60-120 秒 ≈ 1-2 章正文，但以\"叙事任务完整\"为准，不被章节号束缚。",
			"3. 断点选在钩子最强处：每集结尾必须留下让观众点下集的悬念。",
			"4. 全集数控制在 8 到上限之间（上限由输入给出），宁少勿碎。",
			"5. 卷的开局集要强（3 秒钩子），卷的结尾集要收束本卷弧线并埋下卷间钩子。",
			"输出 JSON：",
			"{\"strategy\": \"本卷漫剧化策略一句话（赛道判断+整体节奏安排）\", \"episodes\": [{\"title\": \"集标题（冲突+悬念句式）\", \"chapters\": [章号数组], \"narrativeJob\": \"这集讲什么、为什么这么分（1-2句）\", \"openingHook\": \"开头3秒钩子\", \"endingHook\": \"结尾钩子\"}]}",
			"硬性要求：episodes 按章号顺序排列且覆盖全部给定章节（不得遗漏）；chapters 数组必须连续（如 [81,82,83]）；每集 chapters 至少 1 章、最多 4 章；所有文字用简体中文。",
			"重要：直接输出 JSON，字符串内不含换行。"
		].join("\n"),
		user: [
			`书名：《${project.bookName}》`,
			`第 ${volumeNo} 卷《${volume.title}》（${volume.chapterStart}-${volume.chapterEnd} 章）`,
			`卷定位：${volume.summary}`,
			`目标平台：${platform}（竖屏 9:16）`,
			`本卷已写章节（${chapters.length} 章，按序）：\n${chapterBriefs.join("\n")}`,
			`全集数上限：${maxEpisodes}`,
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .4,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const episodesRaw = Array.isArray(raw.episodes) ? raw.episodes.filter((e) => typeof e === "object" && e !== null) : [];
	const str = (v, fallback = "") => typeof v === "string" ? v.trim() : fallback;
	const episodes = [];
	for (const e of episodesRaw) {
		const chaptersArr = Array.isArray(e.chapters) ? e.chapters.filter((n) => typeof n === "number" && Number.isInteger(n) && n > 0) : [];
		if (chaptersArr.length === 0) continue;
		episodes.push({
			index: episodes.length + 1,
			title: str(e.title, `第 ${episodes.length + 1} 集`),
			chapters: chaptersArr,
			narrativeJob: str(e.narrativeJob),
			openingHook: str(e.openingHook),
			endingHook: str(e.endingHook)
		});
	}
	if (episodes.length === 0) throw new Error("分集计划生成失败：LLM 未返回有效集数");
	return {
		strategy: str(raw.strategy, "（按内容判断赛道节奏）"),
		episodes,
		chaptersScanned: chapters.length
	};
}
/** 🩺 剧情健康检查：基于已写章节数/各线状态/编年录，判断是否需要新线及添加时机。 */
async function analyzePlotlineHealth(ctx, config, project) {
	const system = [
		"你是一位网文剧情架构师。请对本书的「剧情线体系」做健康检查，判断当前是否需要新增剧情线、应在多少章后添加。",
		"评估维度：各线最近推进到第几章（已写章节与关联章节的差值越大越危险）、各线状态、已写章节总数、卷计划当前进度、编年录近期事实。",
		"输出规则：",
		"1. verdict：一句话结论——\"需要新增线\" / \"暂不需要\" / \"再写 N 章后需要\"（N 给出具体章数）。",
		"2. timing：说明建议添加的时机（如：第 25 章前引入新支线，因为主线预计第 22 章告一段落）。",
		"3. reasons：3-5 条依据（引用具体数据：哪条线多少章没推进、已写章节数、卷进度等）。",
		"4. lines：对每条线给健康度——ok（近期推进过）/ warning（超过 5 章未推进）/ stale（超过 10 章未推进或悬置过久）。",
		"输出必须是合法 JSON 对象：{\"verdict\": \"...\", \"timing\": \"...\", \"reasons\": [\"...\"], \"lines\": [{\"name\": \"线名\", \"health\": \"ok|warning|stale\", \"note\": \"一句说明\"}]}",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	const lines = (project.plotlines ?? []).filter((l) => l.status === "active" || l.status === "paused");
	const raw = parseJsonObject(await complete(ctx, config, {
		system,
		user: [
			`书名：《${project.bookName}》`,
			`已写章节数：${written.length}（最新章号 ${written.length > 0 ? written[written.length - 1].no : 0}）`,
			project.volumes !== void 0 && project.volumes.length > 0 ? `卷计划：\n${project.volumes.map((v) => `第${v.no}卷《${v.title}》（${v.chapterStart}-${v.chapterEnd}）：${v.summary.slice(0, 60)}`).join("\n")}` : "",
			`剧情线（${lines.length} 条）：\n${lines.length > 0 ? lines.map((l) => `- [${l.kind}] ${l.name}｜目标：${l.goal}｜进度：${l.progress !== "" ? l.progress : "未推进"}｜最近关联章节：${l.chapters.length > 0 ? "第" + Math.max(...l.chapters) + "章" : "无"}`).join("\n") : "（暂无剧情线）"}`,
			(project.facts ?? []).length > 0 ? `编年录近期事实（最近 10 条）：\n${(project.facts ?? []).slice(-10).map((f) => `[第${f.chapterNo}章] ${f.text.slice(0, 80)}`).join("\n")}` : "",
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 3e3)
	}));
	const strArr = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim() !== "") : [];
	const lineArr = Array.isArray(raw.lines) ? raw.lines.filter((v) => typeof v === "object" && v !== null).map((entry) => ({
		name: typeof entry.name === "string" ? entry.name.slice(0, 40) : "",
		health: [
			"ok",
			"warning",
			"stale"
		].includes(entry.health) ? entry.health : "ok",
		note: typeof entry.note === "string" ? entry.note.slice(0, 150) : ""
	})).filter((x) => x.name !== "") : [];
	return {
		verdict: typeof raw.verdict === "string" ? raw.verdict.slice(0, 100) : "",
		timing: typeof raw.timing === "string" ? raw.timing.slice(0, 200) : "",
		reasons: strArr(raw.reasons).map((r) => r.slice(0, 200)),
		lines: lineArr
	};
}
/** ✨ AI 剧情方案：基于健康检查结果设计下一阶段方向与建议新线。 */
async function designPlotlinePlan(ctx, config, project, health) {
	const system = [
		"你是一位网文剧情架构师。请为本书设计「下一阶段的剧情方案」：给出未来 5-10 章的剧情方向，并建议 2-3 条值得新增的剧情线。",
		"要求：方向必须结合本书大纲/卷计划/现有线/编年录；新线要能落地（和当前主角处境、已有伏笔、下一阶段舞台相关），不得重复已有线。",
		"输出必须是合法 JSON 对象：{\"direction\": \"下一阶段方向 60-120 字\", \"suggestions\": [{\"name\": \"线名\", \"kind\": \"main|branch|character|mystery\", \"goal\": \"目标\", \"progress\": \"初始进度（可空）\"}]}",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。",
		"重要：直接输出 JSON 结果本身，不要把思考过程写在输出里。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	const raw = parseJsonObject(await complete(ctx, config, {
		system,
		user: [
			`书名：《${project.bookName}》`,
			health !== void 0 ? `健康检查结论：\n判定：${health.verdict}\n时机：${health.timing}\n依据：${health.reasons.join("；")}` : "",
			`大纲（节选前 3000 字）：\n${project.outline.slice(0, 3e3)}`,
			project.volumes !== void 0 && project.volumes.length > 0 ? `卷计划：\n${project.volumes.map((v) => `第${v.no}卷《${v.title}》：${v.summary.slice(0, 60)}`).join("\n")}` : "",
			`现有剧情线：\n${(project.plotlines ?? []).map((l) => `- [${l.kind}${l.status === "resolved" ? "·已完结" : ""}] ${l.name}：${l.goal}`).join("\n") || "（无）"}`,
			written.length > 0 ? `最近写的章节：\n${written.slice(-5).map((c) => `第${c.no}章《${c.title}》`).join("、")}` : "",
			"只输出 JSON 对象。"
		].join("\n\n"),
		temperature: .6,
		maxTokens: Math.max(config.maxTokens, 3e3)
	}));
	const suggestions = [];
	const kinds = /* @__PURE__ */ new Set([
		"main",
		"branch",
		"character",
		"mystery"
	]);
	if (Array.isArray(raw.suggestions)) for (const entry of raw.suggestions) {
		if (typeof entry !== "object" || entry === null) continue;
		const e = entry;
		const name = typeof e.name === "string" ? e.name.trim().slice(0, 40) : "";
		if (name === "") continue;
		suggestions.push({
			id: "",
			name,
			kind: kinds.has(e.kind) ? e.kind : "branch",
			goal: typeof e.goal === "string" ? e.goal.trim().slice(0, 300) : "",
			progress: typeof e.progress === "string" ? e.progress.trim().slice(0, 300) : "",
			status: "active",
			chapters: [],
			createdAt: (/* @__PURE__ */ new Date()).toISOString()
		});
	}
	return {
		direction: typeof raw.direction === "string" ? raw.direction.slice(0, 300) : "",
		suggestions
	};
}
/** Build the rewrite system prompt (fix review issues / instructions). */
function rewriteSystemPrompt(project) {
	return writeSystemPrompt(project) + "\n\n额外要求：你正在【修订】一章已写好的正文。保留原文中好的部分，只修改需要修改的地方，输出完整的新正文（不要只输出修改片段），字数与原文相当。";
}
/**
* Stream a chapter rewrite. With `target` (a passage of the body), only that
* passage's paragraph is rewritten and spliced back — everything else stays
* untouched (local revision). Without `target`, the whole chapter is
* rewritten. Yields delta text; persists when done.
*/
async function* rewriteChapterStream(ctx, config, project, outputDir, chapterNo, instructions, target) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 的正文文件不存在`);
	const reviewBlock = chapter.review !== void 0 ? "审稿意见：\n" + chapter.review.issues.map((i) => `[${i.severity}] ${i.item} → ${i.suggestion}`).join("\n") : "";
	const bodyText = body.replace(/^#\s+.*$/m, "").trim();
	let localTarget;
	if (target !== void 0 && target.trim() !== "") {
		const wanted = target.trim();
		const normalize = (value) => value.replace(/\s+/g, " ").replace(/[“”"'‘’]/g, "");
		const wantedFlat = normalize(wanted);
		const paragraphs = bodyText.split(/\n{2,}/);
		const idx = paragraphs.findIndex((p) => normalize(p).includes(wantedFlat));
		if (idx === -1) throw new Error(`在正文中未找到要修改的片段：「${wanted.slice(0, 40)}…」。请从正文中复制原文片段（无需整段，取片段即可）。`);
		localTarget = {
			paragraph: paragraphs[idx],
			before: paragraphs.slice(0, idx).join("\n\n"),
			after: paragraphs.slice(idx + 1).join("\n\n")
		};
	}
	const user = localTarget === void 0 ? [
		`请修订第 ${chapter.no} 章《${chapter.title}》。`,
		reviewBlock,
		instructions !== "" ? `本次修订重点：${instructions}` : "",
		"==================== 原正文 ====================",
		bodyText
	].filter((line) => line !== "").join("\n") : [
		`请修订第 ${chapter.no} 章《${chapter.title}》中的一个自然段。`,
		instructions !== "" ? `修改要求：${instructions}` : "",
		"==================== 需要修改的原文段落 ====================",
		localTarget.paragraph,
		"",
		"要求：",
		"1. 只输出修改后的【这一个段落】的完整新文本，不要输出任何说明、标题或 Markdown 标记。",
		"2. 保留该段的情节走向与角色口吻，只按修改要求调整。",
		"3. 段落长度与原文相当。"
	].filter((line) => line !== "").join("\n");
	const system = localTarget === void 0 ? rewriteSystemPrompt(project) : "你是一位中文网文润色师。你会收到一章中的一个段落，请按修改要求重写该段。只输出新段落文本。";
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: user
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-novel-forge"
		}
	})];
	const request = {
		provider: config.provider,
		model: config.model,
		messages,
		system,
		maxTokens: Math.max(config.maxTokens, 2e4),
		temperature: .7,
		reasoningEffort: ReasoningEffortId("off")
	};
	yield { frame: "start" };
	const assembler = new BlockAssembler();
	let streamError;
	for await (const chunk of ctx.llm.stream(request)) {
		assembler.push(chunk);
		if (chunk.type === "text-delta") yield {
			frame: "delta",
			text: chunk.text
		};
	}
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") streamError = /* @__PURE__ */ new Error(`修订失败（${finish.kind}）: ${finish.failure.message}`);
	else if (finish.kind === "max-tokens") streamError = /* @__PURE__ */ new Error("修订输出达到 maxTokens 上限，请增大配置后重试");
	const rewritten = assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (streamError !== void 0) throw streamError;
	if (rewritten.length < 20) throw new Error("修订结果过短，可能失败，请重试");
	let newBody;
	if (localTarget !== void 0) newBody = [
		localTarget.before,
		rewritten,
		localTarget.after
	].filter((part) => part !== "").join("\n\n");
	else newBody = rewritten;
	if (newBody.length < 100) throw new Error("修订结果过短，可能失败，请重试");
	chapter.pendingDraft = newBody;
	chapter.error = void 0;
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	yield {
		frame: "drafted",
		chars: newBody.length,
		draft: newBody
	};
}
/** The de-AI-ify polish system prompt (with project writing assets injected). */
function polishSystemPrompt(project) {
	const assetsBlock = renderAllAssets(project.assets);
	return [
		"你是一位中文网文润色师。你会收到一章正文，请做「去 AI 味」润色：",
		"1. 删除/替换 AI 高频套话与模式词：如\"不禁\"\"仿佛\"\"一时间\"\"不由得\"\"顿时\"\"然而\"\"缓缓\"\"轻轻\"\"微微\"\"默默\"\"似乎\"\"终于\"等滥用。",
		"2. 把书面翻译腔改成口语化的中文网文语感。",
		"3. 拆分过长的排比句与堆砌的修饰语。",
		"4. 保留全部情节、人物、对话内容不变，只改表达。",
		"5. 输出完整的新正文，不要输出任何说明文字或 Markdown 标记。",
		"6. 必须遵守下方「反 AI 规则」与「写法资产」的表达边界；写法资产要求保留的风格特征（句式、台词、节奏）不得在润色中丢失。",
		assetsBlock !== "" ? assetsBlock : ""
	].join("\n");
}
/** Stream a chapter polish (de-AI-ify). Draft-mode: the polished body lands
*  in `chapter.pendingDraft` and is only applied on draft/apply. */
async function* polishChapterStream(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 的正文文件不存在`);
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: body.replace(/^#\s+.*$/m, "").trim()
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-novel-forge"
		}
	})];
	const request = {
		provider: config.provider,
		model: config.model,
		messages,
		system: polishSystemPrompt(project),
		maxTokens: Math.max(config.maxTokens, 2e4),
		temperature: .5,
		reasoningEffort: ReasoningEffortId("off")
	};
	yield { frame: "start" };
	const assembler = new BlockAssembler();
	let streamError;
	for await (const chunk of ctx.llm.stream(request)) {
		assembler.push(chunk);
		if (chunk.type === "text-delta") yield {
			frame: "delta",
			text: chunk.text
		};
	}
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") streamError = /* @__PURE__ */ new Error(`润色失败（${finish.kind}）: ${finish.failure.message}`);
	else if (finish.kind === "max-tokens") streamError = /* @__PURE__ */ new Error("润色输出达到 maxTokens 上限");
	const newBody = assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (streamError !== void 0) throw streamError;
	if (newBody.length < 100) throw new Error("润色结果过短，可能失败，请重试");
	chapter.pendingDraft = newBody;
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	yield {
		frame: "drafted",
		chars: newBody.length,
		draft: newBody
	};
}
/** Generate one chapter (streaming). Yields progress frames; persists when done. */
async function* generateChapterStream(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	let continuity = "";
	const prev = project.chapters.find((c) => c.no === chapterNo - 1);
	if (prev?.file !== void 0) {
		const prevPath = join(outputDir, prev.file);
		if (existsSync(prevPath)) continuity = readFileSync(prevPath, "utf8").slice(-900);
	}
	const prevSummary = prev?.summary;
	const allFacts = project.facts ?? [];
	const recentFacts = allFacts.slice(-20).map((f) => f.text);
	const recentSet = new Set(recentFacts);
	const beatsText = chapter.beats;
	const roleNames = (project.roles ?? []).map((r) => r.name).filter((n) => typeof n === "string" && n !== "");
	const trigrams = (s) => {
		const out = /* @__PURE__ */ new Set();
		for (let i = 0; i + 3 <= s.length; i++) {
			const tri = s.slice(i, i + 3);
			if (tri.trim() !== "") out.add(tri);
		}
		return out;
	};
	const beatsTri = trigrams(beatsText);
	const beatRoles = roleNames.filter((n) => beatsText.includes(n));
	const relatedFacts = allFacts.map((f, idx) => {
		const head = f.text.slice(0, 80);
		let score = 0;
		for (const tri of trigrams(head)) if (beatsTri.has(tri)) score += 1;
		if (beatRoles.length > 0) {
			for (const n of beatRoles) if (head.includes(n)) score += 8;
		}
		score += Math.min(idx, 40) / 10;
		return {
			f,
			score
		};
	}).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 15).map((x) => `[第${x.f.chapterNo}章] ${x.f.text}`).filter((t) => !recentSet.has(t.slice(t.indexOf("]") + 2)));
	const foreshadowHints = (project.foreshadows ?? []).filter((f) => f.status === "planned" && f.targetChapter !== void 0 && f.targetChapter > 0).filter((f) => Math.abs(f.targetChapter - chapterNo) <= 12).map((f) => `- ${f.description.slice(0, 120)}${f.targetChapter !== void 0 ? `（计划回收于第 ${f.targetChapter} 章）` : ""}`);
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: [
				`现在写第 ${chapter.no} 章，标题《${chapter.title}》。`,
				`本章剧情要点：${chapter.beats}`,
				"",
				foreshadowHints.length > 0 ? `本章附近需顺势埋下以下暗线（自然带过，不喧宾夺主，1-2 句即可，但细节要可辨识、与描述吻合）：\n${foreshadowHints.join("\n")}` : "",
				recentFacts.length > 0 ? `本书已确立的事实（新写内容不得与之矛盾）：\n${recentFacts.join("\n")}` : "",
				relatedFacts.length > 0 ? `本章相关的既往事实（同样不得违背）：\n${relatedFacts.join("\n")}` : "",
				prevSummary !== void 0 && prevSummary !== "" ? `上一章摘要：${prevSummary}` : "",
				continuity !== "" ? `上一章结尾（用于衔接，不要复述）：\n${continuity}` : "这是第一章，注意开篇要有吸引力。",
				"",
				`请写 ${chapter.targetChars} 字左右的正文，只输出正文。`
			].filter((line) => line !== "").join("\n")
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-novel-forge"
		}
	})];
	const request = {
		provider: config.provider,
		model: config.model,
		messages,
		system: writeSystemPrompt(project),
		maxTokens: Math.max(config.maxTokens, 2e4),
		temperature: .85
	};
	yield { frame: "start" };
	const assembler = new BlockAssembler();
	let streamError;
	for await (const chunk of ctx.llm.stream(request)) {
		assembler.push(chunk);
		if (chunk.type === "text-delta") yield {
			frame: "delta",
			text: chunk.text
		};
	}
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") streamError = /* @__PURE__ */ new Error(`生成失败（${finish.kind}）: ${finish.failure.message}`);
	else if (finish.kind === "max-tokens") streamError = /* @__PURE__ */ new Error("达到 maxTokens 上限，正文可能不完整，请增大 maxTokens 后重试");
	const body = assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (streamError !== void 0) throw streamError;
	if (body.length < 100) throw new Error("生成内容过短，可能失败，请重试");
	const fileName = chapterFileName(chapter);
	mkdirSync(outputDir, { recursive: true });
	writeFileSync(join(outputDir, fileName), `# 第${chapter.no}章 ${chapter.title}\n\n${body}\n`, "utf8");
	chapter.status = "written";
	chapter.chars = body.length;
	chapter.file = fileName;
	chapter.error = void 0;
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	yield {
		frame: "done",
		file: fileName,
		chars: body.length
	};
}
/** Generate a chapter summary (narrative memory). */
async function summarizeChapter(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) throw new Error(`章节 ${chapterNo} 不在计划中`);
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) throw new Error(`章节 ${chapterNo} 的正文文件不存在`);
	chapter.summary = (await complete(ctx, config, {
		system: [
			"你是一位网文编辑。请为下面一章写一段 120-200 字的摘要，供后续章节写作时保持连贯性。",
			"摘要必须包含：本章发生的关键事件、主角状态变化（境界/资源/伤势/心境）、新增的伏笔或线索、角色关系变化。",
			"用客观陈述句，不要评价，不要剧透式感叹。只输出摘要正文。"
		].join("\n"),
		user: body.replace(/^#\s+.*$/m, "").trim(),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 4e3)
	})).slice(0, 500);
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	return chapter.summary;
}
/**
* 摘要 + 事实抽取合并为一次 LLM 调用（省一次调用与一次正文输入，
* 批量生成时整体开销约省 25%）。
* @returns 摘要与新增事实条数（失败返回空，调用方 best-effort）。
*/
async function summarizeAndExtractFacts(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) return {
		summary: "",
		factCount: 0
	};
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) return {
		summary: "",
		factCount: 0
	};
	const raw = parseJsonObject(await complete(ctx, config, {
		system: [
			"你是一位网文编辑。请为下面一章做两件事，输出合法 JSON 对象：",
			"{\"summary\": \"120-200字摘要，含关键事件/主角状态变化（境界资源伤势心境）/新增伏笔线索/角色关系变化，客观陈述不评价\", \"facts\": [\"已确立事实1\", \"…3-6条\"]}",
			"facts 指：本章明确写出的、对后续有约束力的事实——人物当前状态、重要关系变化、地点与时间线、已落地或新增的伏笔线索、关键道具去向。",
			"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
		].join("\n"),
		user: body.replace(/^#\s+.*$/m, "").trim(),
		temperature: .2,
		maxTokens: Math.max(config.maxTokens, 5e3)
	}));
	const summary = typeof raw.summary === "string" ? raw.summary.trim().slice(0, 500) : "";
	const factLines = Array.isArray(raw.facts) ? raw.facts.filter((v) => typeof v === "string" && v.trim().length > 8).map((v) => v.trim().slice(0, 140)) : [];
	if (summary !== "") chapter.summary = summary;
	const list = project.facts ?? [];
	for (const line of factLines.slice(0, 8)) list.push({
		chapterNo,
		text: line
	});
	project.facts = list.slice(-300);
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	return {
		summary,
		factCount: factLines.length
	};
}
/**
* 伏笔落地标记：检查刚生成的章节正文是否埋下了 planned 伏笔（关键词匹配），
* 命中则将该伏笔标记为 planted 并记录 plantedChapter——保证暗线管理页与正文同步。
* 纯关键词粗匹配，宁缺毋滥：仅处理「描述含可辨识关键词」的伏笔，无把握则不标。
*/
function markForeshadowPlanted(project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) return 0;
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) return 0;
	let marked = 0;
	for (const f of project.foreshadows ?? []) {
		if (f.status !== "planned") continue;
		if (f.plantedChapter !== void 0) continue;
		const quoted = f.description.match(/[「“『《]([^」”』》]{2,12})[」”』》]/g);
		const keywords = (quoted !== null ? quoted : []).map((q) => q.slice(1, -1)).filter((k) => k.length >= 2);
		const nearTarget = f.targetChapter !== void 0 && Math.abs(f.targetChapter - chapterNo) <= 12;
		if (keywords.length === 0 && !nearTarget) continue;
		const hit = keywords.length === 0 ? false : keywords.some((k) => body.includes(k));
		if (hit || keywords.length === 0 && nearTarget) {
			if (hit) {
				f.status = "planted";
				f.plantedChapter = chapterNo;
				marked++;
			}
		}
	}
	if (marked > 0) {
		project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
		saveProject(outputDir, project);
	}
	return marked;
}
/**
* 抽取本章「已确立事实」追加到事实库/时间线（最多 300 条，最新优先）。
* 事实注入后续章节生成提示词，保证人物状态/境界/资源/关系长期一致。
* @returns 新增事实条数（失败返回 0，调用方 best-effort）。
*/
async function extractFacts(ctx, config, project, outputDir, chapterNo) {
	const chapter = project.chapters.find((c) => c.no === chapterNo);
	if (chapter === void 0) return 0;
	const body = readChapterFile(outputDir, chapter);
	if (body === void 0) return 0;
	const lines = (await complete(ctx, config, {
		system: [
			"你是一位网文编辑。请从本章正文中抽取「已确立事实」，供后续章节保持一致。",
			"事实指：人物当前状态（境界/修为/伤势/资源/心境）、重要关系变化、地点与时间线、已落地或新增的伏笔线索、关键道具去向。",
			"要求：",
			"1. 只抽取本章明确写出的、对后续有约束力的内容；纯心理活动与无关细节不要。",
			"2. 每行一条事实，用客观陈述句，不含主观评价。",
			"3. 输出 3-6 条，每行一条，不要编号、不要前缀、不要解释。"
		].join("\n"),
		user: body.replace(/^#\s+.*$/m, "").trim(),
		temperature: .2,
		maxTokens: Math.max(config.maxTokens, 4e3)
	})).split("\n").map((line) => line.replace(/^[-*\d.\s]+/, "").trim()).filter((line) => line.length > 8).slice(0, 8);
	if (lines.length === 0) return 0;
	const facts = project.facts ?? [];
	for (const line of lines) facts.push({
		chapterNo,
		text: line.slice(0, 140)
	});
	project.facts = facts.slice(-300);
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveProject(outputDir, project);
	return lines.length;
}
const AUDIT_BATCH_SIZE = 10;
/** 单批质检：设定 + 事实库 + 该批章节节选 → 矛盾清单。 */
async function auditBatch(ctx, config, project, outputDir, batch) {
	const system = [
		"你是一位严谨的网文连续性审校编辑。你会收到一本小说的设定圣经、事实库和一批章节正文节选。",
		"请找出这批章节中的一致性矛盾，例如：",
		"- 人物状态冲突：境界/修为/伤势/资源在同一章内或跨章前后矛盾。",
		"- 设定违背：正文与世界观规则、金手指规则、写作红线冲突。",
		"- 时间线错乱：事件顺序、时间跨度、地点移动不合逻辑。",
		"- 细节穿帮：人名/地名/物品/数字前后不一致。",
		"要求：",
		"1. 只报告有实质证据的矛盾，不要泛泛而谈写作质量问题。",
		"2. 每条必须定位到具体章节号。",
		"3. 输出必须是合法 JSON 数组，格式：[{\"chapterNo\": 章节号, \"severity\": \"high|medium|low\", \"item\": \"矛盾描述\", \"suggestion\": \"修改建议\"}]",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
	].join("\n");
	const factsBlock = (project.facts ?? []).slice(-60).map((f) => `[第${f.chapterNo}章] ${f.text}`).join("\n");
	const chapterBlocks = batch.map((c) => {
		const excerpt = (readChapterFile(outputDir, c) ?? "").replace(/^#\s+.*$/m, "").trim().slice(0, 700);
		return `【第${c.no}章《${c.title}》】\n${excerpt}`;
	}).join("\n\n");
	const parsed = parseJsonArray(await complete(ctx, config, {
		system,
		user: [
			"请对以下小说做一致性质检。",
			project.bible !== void 0 ? "设定圣经：\n" + [
				project.bible.worldRules.length > 0 ? `世界规则：\n${project.bible.worldRules.map((r) => `- ${r}`).join("\n")}` : "",
				project.bible.redLines.length > 0 ? `写作红线：\n${project.bible.redLines.map((r) => `- ${r}`).join("\n")}` : "",
				project.bible.characters.length > 0 ? `角色：\n${project.bible.characters.map((ch) => `- ${ch.name}（${ch.traits.join("、")}）`).join("\n")}` : ""
			].filter((s) => s !== "").join("\n") : "",
			factsBlock !== "" ? `已确立事实库：\n${factsBlock}` : "",
			`正文节选（每章前 700 字）：\n${chapterBlocks}`,
			"只输出 JSON 数组。"
		].filter((s) => s !== "").join("\n\n"),
		temperature: .2,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const issues = [];
	for (const entry of parsed) {
		const item = typeof entry.item === "string" ? entry.item : "";
		if (item === "") continue;
		issues.push({
			chapterNo: Number(entry.chapterNo) || 0,
			severity: [
				"high",
				"medium",
				"low"
			].includes(entry.severity) ? entry.severity : "medium",
			item,
			suggestion: typeof entry.suggestion === "string" ? entry.suggestion : ""
		});
	}
	return issues;
}
/** 全书一致性质检：LLM 分批扫描已生成章节 + 设定 + 事实库，聚合矛盾清单。 */
async function auditBook(ctx, config, project, outputDir) {
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	if (written.length === 0) return [];
	const all = [];
	for (let i = 0; i < written.length; i += AUDIT_BATCH_SIZE) {
		const batch = written.slice(i, i + AUDIT_BATCH_SIZE);
		try {
			all.push(...await auditBatch(ctx, config, project, outputDir, batch));
		} catch {}
	}
	return all.slice(0, 50);
}
/** 小说简介：AI 生成或按已写开头补全（面向读者的作品门面）。 */
async function generateBlurb(ctx, config, project, partial = "") {
	const system = [
		"你是一位网文平台编辑，擅长写抓人的作品简介。",
		"要求：",
		"1. 120-250 字，突出核心卖点（金手指/题材/爽点/人设反差），用一两句抛出开局钩子。",
		"2. 不剧透结局与关键反转；语气贴合题材（热血/悬疑/轻松/虐心）。",
		"3. 中文，直接输出简介正文，不要 Markdown、不要引号包裹、不要「简介：」前缀。"
	].join("\n");
	const genreBlock = project.bible?.genre !== void 0 ? `题材：${project.bible.genre}` : "";
	const volumeBlock = (project.volumes ?? []).slice(0, 3).map((v) => v.title).join("、");
	return (await complete(ctx, config, {
		system,
		user: [
			`书名：《${project.bookName}》`,
			genreBlock,
			volumeBlock !== "" ? `卷结构：${volumeBlock}` : "",
			`已写章节数：${project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating").length}`,
			"大纲节选：\n" + project.outline.slice(0, 2500),
			partial.trim() !== "" ? `已有开头草稿（请保留其内容与语气，续写补全为完整简介）：\n${partial.trim()}` : "请全量生成一份完整简介。"
		].filter((s) => s !== "").join("\n\n"),
		temperature: .7,
		maxTokens: Math.max(config.maxTokens, 4e3)
	})).replace(/^["'「『]|["'」』]$/g, "").replace(/^简介[：:]\s*/, "").trim().slice(0, 600);
}
/**
* 组装全书上下文包（AI 助手 book_overview 工具）。
* 分片策略：章节要点默认只给最近 30 章（避免超长后爆上下文）；
* scope='full' 全量；scope=数字 只给该卷章节。
*/
function bookOverview(project, scope = "recent") {
	const s = [];
	s.push(`书名：${project.bookName}`);
	s.push(`【大纲全文】\n${project.outline}`);
	if (project.bible !== void 0) {
		const bible = project.bible;
		s.push("【设定圣经】");
		if (bible.genre !== "") s.push(`题材基调：${bible.genre}`);
		if (bible.worldRules.length > 0) s.push("世界规则：\n" + bible.worldRules.map((r) => `- ${r}`).join("\n"));
		if (bible.characters.length > 0) {
			s.push("角色卡：");
			for (const card of bible.characters) {
				const roleName = {
					protagonist: "主角",
					supporting: "配角",
					antagonist: "反派",
					other: "其他"
				}[card.role];
				s.push(`- ${card.name}（${roleName}）：${card.traits.join("、")}${card.goals !== "" ? `；目标：${card.goals}` : ""}${card.relations !== "" ? `；关系：${card.relations}` : ""}`);
			}
		}
		if (bible.redLines.length > 0) s.push("写作红线：\n" + bible.redLines.map((r) => `- ${r}`).join("\n"));
		if (bible.style.length > 0) s.push("风格要求：\n" + bible.style.map((r) => `- ${r}`).join("\n"));
	}
	const worldBlock = renderWorld(project.world);
	if (worldBlock !== "") s.push(worldBlock);
	if (project.volumes !== void 0 && project.volumes.length > 0) {
		s.push("【卷结构】");
		for (const v of project.volumes) s.push(`第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`);
	}
	if (project.chapters.length > 0) {
		const maxNo = project.chapters.reduce((m, c) => Math.max(m, c.no), 0);
		const shown = project.chapters.filter((c) => {
			if (scope === "full") return true;
			if (typeof scope === "number") return c.volume === scope;
			return c.no > Math.max(0, maxNo - 30);
		});
		const label = scope === "full" ? "全部章节（标题/状态/剧情要点/摘要）" : typeof scope === "number" ? `第 ${scope} 卷章节（标题/状态/剧情要点/摘要）` : `最近 ${shown.length} 章（标题/状态/剧情要点/摘要）`;
		s.push(`【${label}】`);
		const statusText = {
			pending: "待生成",
			generating: "生成中",
			written: "待审稿",
			reviewing: "审稿中",
			approved: "已通过",
			rejected: "待修订",
			error: "失败"
		};
		for (const c of shown) s.push(`第${c.no}章《${c.title}》[${statusText[c.status] ?? c.status}]${c.chars !== void 0 ? ` ${c.chars}字` : ""}\n剧情要点：${c.beats}\n摘要：${c.summary ?? "无"}`);
		if (scope !== "full" && project.chapters.length > shown.length) s.push(`（还有 ${project.chapters.length - shown.length} 章未列出，可用 scope=volume:N 查看指定卷）`);
	}
	if ((project.facts ?? []).length > 0) {
		s.push("【事实库（最近 40 条；更多用 facts_query 检索）】");
		for (const f of (project.facts ?? []).slice(-40)) s.push(`- [第${f.chapterNo}章] ${f.text}`);
	}
	if (project.foreshadows.length > 0) {
		s.push("【伏笔】");
		for (const f of project.foreshadows) s.push(`- [${f.status}] ${f.description}${f.targetChapter !== void 0 ? `（预计 ${f.targetChapter} 章回收）` : ""}`);
	}
	if (project.blurb !== void 0 && project.blurb !== "") s.push(`【小说简介】${project.blurb}`);
	return s.join("\n\n");
}
/**
* 影响分析：LLM 扫描全书（大纲/设定/大世界/事实库/已写章节），
* 定位一次改动波及的所有位置。助手在修改后主动调用，做连锁维护。
*/
async function analyzeImpact(ctx, config, project, outputDir, change) {
	const system = [
		"你是一位网文一致性审校。作者要做一处修改，请找出这次改动会波及的所有位置（设定、大纲、已写章节正文、事实库、简介中可能因此过时或矛盾的内容）。",
		"输出必须是合法 JSON 数组，格式：[{\"location\": \"位置（第N章/大纲/设定圣经-世界规则/大世界-境界/事实库/简介）\", \"quote\": \"原文片段（20-60字）\", \"suggestion\": \"修改建议\", \"kind\": \"must|optional|note\"}]",
		"kind 含义：must=必须同步改否则矛盾；optional=建议改（影响观感）；note=备注（如旧称保留为古称、或无需改但需知晓）。",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
	].join("\n");
	const written = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating");
	const base = [
		`要做的修改：${change}`,
		"以下为全书设定与规则要点（章节为分批节选）：",
		`大纲节选：\n${project.outline.slice(0, 2e3)}`,
		project.bible !== void 0 ? `道藏：${project.bible.worldRules.length} 条世界规则 / ${project.bible.redLines.length} 条红线 / 人物 ${project.bible.characters.map((c) => c.name).join("、")}` : "",
		(project.facts ?? []).length > 0 ? `编年录最近 40 条：\n${(project.facts ?? []).slice(-40).map((f) => `[第${f.chapterNo}章] ${f.text}`).join("\n")}` : ""
	].filter((s) => s !== "").join("\n\n");
	const items = [];
	const IMPACT_BATCH_SIZE = 8;
	for (let i = 0; i < written.length; i += IMPACT_BATCH_SIZE) {
		const batch = written.slice(i, i + IMPACT_BATCH_SIZE);
		const chapterBlock = batch.map((c) => {
			const excerpt = (readChapterFile(outputDir, c) ?? "").replace(/^#\s+.*$/m, "").trim().slice(0, 500);
			return `【第${c.no}章《${c.title}》】\n${excerpt}`;
		}).join("\n\n");
		const user = `${base}\n\n本批章节（第 ${batch[0].no}-${batch[batch.length - 1].no} 章）：\n${chapterBlock}\n\n只输出 JSON 数组。`;
		try {
			const text = await complete(ctx, config, {
				system,
				user,
				temperature: .2,
				maxTokens: Math.max(config.maxTokens, 12e3)
			});
			for (const entry of parseJsonArray(text)) {
				const quote = typeof entry.quote === "string" ? entry.quote.trim() : "";
				if (quote === "") continue;
				items.push({
					location: typeof entry.location === "string" ? entry.location : "未定位",
					quote: quote.slice(0, 120),
					suggestion: typeof entry.suggestion === "string" ? entry.suggestion : "",
					kind: entry.kind === "must" || entry.kind === "optional" || entry.kind === "note" ? entry.kind : "optional"
				});
			}
		} catch {}
	}
	return items.slice(0, 30);
}
/** 把大世界结构化数据渲染成提示词块（境界体系按顺序强约束）。 */
function renderWorld(world) {
	if (world === void 0) return "";
	const sections = ["==================== 大世界（结构化设定，写作时严格遵守） ===================="];
	if (world.realms.length > 0) {
		sections.push("境界体系（由低到高，不得随意跳级或自创境界）：");
		world.realms.forEach((realm, i) => {
			sections.push(`${i + 1}. ${realm.name}${realm.description !== "" ? ` — ${realm.description}` : ""}`);
		});
	}
	if (world.regions.length > 0) {
		sections.push("地理区域：");
		for (const region of world.regions) sections.push(`- ${region.name}${region.description !== "" ? `：${region.description}` : ""}${region.faction !== void 0 && region.faction !== "" ? `（势力：${region.faction}）` : ""}`);
	}
	if (world.factions.length > 0) {
		sections.push("势力分布：");
		for (const faction of world.factions) sections.push(`- ${faction.name}（${faction.kind}）${faction.description !== "" ? `：${faction.description}` : ""}${faction.region !== void 0 && faction.region !== "" ? `（驻地：${faction.region}）` : ""}`);
	}
	return sections.join("\n");
}
/** AI 提炼大世界：从大纲 + 设定圣经生成结构化境界体系/区域/势力。 */
async function extractWorld(ctx, config, project) {
	const system = [
		"你是一位网文世界观架构师。请根据小说大纲与设定圣经，提炼结构化「大世界」数据。",
		"输出必须是合法 JSON 对象：",
		"{\"realms\": [{\"name\": \"境界名\", \"description\": \"突破条件/寿命/标志等\"}], \"regions\": [{\"name\": \"区域名\", \"description\": \"描述\", \"faction\": \"关联势力名或空\"}], \"factions\": [{\"name\": \"势力名\", \"kind\": \"宗门/家族/王朝/组织等\", \"description\": \"描述\", \"region\": \"驻地区域或空\"}]}",
		"要求：",
		"1. realms 按由低到高顺序排列（修仙题材必须含完整境界链；无境界设定的题材可输出空数组）。",
		"2. 数量贴合大纲：realms 3-12 个，regions 2-10 个，factions 2-10 个。",
		"3. 内容严格来自大纲与设定圣经，不要凭空发明与大纲冲突的设定。",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
	].join("\n");
	const bibleBlock = project.bible !== void 0 ? [project.bible.genre !== "" ? `题材：${project.bible.genre}` : "", project.bible.worldRules.length > 0 ? `世界规则：\n${project.bible.worldRules.map((r) => `- ${r}`).join("\n")}` : ""].filter((s) => s !== "").join("\n") : "";
	const raw = parseJsonObject(await complete(ctx, config, {
		system,
		user: [
			"请为这部小说提炼大世界数据。",
			`书名：《${project.bookName}》`,
			bibleBlock !== "" ? bibleBlock : "",
			"大纲：\n" + project.outline.slice(0, 5e3),
			"只输出 JSON 对象。"
		].filter((s) => s !== "").join("\n\n"),
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const str = (value) => typeof value === "string" ? value.trim() : "";
	const objArray = (value) => Array.isArray(value) ? value.filter((v) => typeof v === "object" && v !== null) : [];
	return {
		realms: objArray(raw.realms).map((entry) => ({
			name: str(entry.name).slice(0, 20) || "未命名境界",
			description: str(entry.description).slice(0, 200)
		})).filter((r) => r.name !== "未命名境界" || r.description !== ""),
		regions: objArray(raw.regions).map((entry) => ({
			name: str(entry.name).slice(0, 30) || "未命名区域",
			description: str(entry.description).slice(0, 200),
			faction: str(entry.faction).slice(0, 30)
		})).filter((r) => r.name !== "未命名区域" || r.description !== ""),
		factions: objArray(raw.factions).map((entry) => ({
			name: str(entry.name).slice(0, 30) || "未命名势力",
			kind: str(entry.kind).slice(0, 20) || "组织",
			description: str(entry.description).slice(0, 200),
			region: str(entry.region).slice(0, 30)
		})).filter((f) => f.name !== "未命名势力" || f.description !== "")
	};
}
/**
* 事实库回填：对历史已生成章节批量抽取事实（无事实记录的旧章节）。
* @returns 回填的章节数。
*/
async function backfillFacts(ctx, config, project, outputDir) {
	const have = new Set((project.facts ?? []).map((f) => f.chapterNo));
	let filled = 0;
	for (const chapter of project.chapters) {
		if (chapter.status === "pending" || chapter.status === "generating") continue;
		if (chapter.file === void 0 || have.has(chapter.no)) continue;
		try {
			if (await extractFacts(ctx, config, project, outputDir, chapter.no) > 0) filled++;
		} catch {}
		have.add(chapter.no);
	}
	return filled;
}
/**
* 角色卡刷新：出场统计由服务端从正文精确计算（角色名出现过的章节数、
* 最近出现章节），LLM 只负责聚合「当前状态」一句话。
*/
async function refreshCharacters(ctx, config, project, outputDir) {
	const roster = (((project.roles ?? []).length > 0 ? project.roles : project.bible?.characters) ?? []).map((r) => ({
		name: r.name,
		traits: r.traits ?? [],
		role: r.roleLabel !== void 0 ? r.roleLabel : r.role ?? "other"
	}));
	const facts = project.facts ?? [];
	if (roster.length === 0 && facts.length === 0) return [];
	const stat = /* @__PURE__ */ new Map();
	const known = roster.map((card) => card.name);
	for (const chapter of project.chapters) {
		if (chapter.status === "pending" || chapter.status === "generating") continue;
		const body = readChapterFile(outputDir, chapter);
		if (body === void 0) continue;
		for (const name of known) if (body.includes(name)) {
			const entry = stat.get(name) ?? {
				chapters: /* @__PURE__ */ new Set(),
				last: 0
			};
			entry.chapters.add(chapter.no);
			if (chapter.no > entry.last) entry.last = chapter.no;
			stat.set(name, entry);
		}
	}
	let statuses = /* @__PURE__ */ new Map();
	if (facts.length > 0) {
		const system = [
			"你是一位网文角色档案管理员。请根据「角色名单」与「已确立事实库」，为每个角色输出「当前状态」一句话（境界/修为/伤势/资源/心境）。",
			"输出必须是合法 JSON 数组，格式：[{\"name\": \"角色名\", \"status\": \"当前状态一句话\"}]",
			"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
		].join("\n");
		const rosterBlock = roster.map((ch) => `- ${ch.name}（${ch.traits.join("、")}）`).join("\n");
		const factsBlock = facts.map((f) => `[第${f.chapterNo}章] ${f.text}`).join("\n");
		const user = [
			`角色名单：\n${rosterBlock}`,
			`已确立事实库（${facts.length} 条）：\n${factsBlock.slice(-6e3)}`,
			"只输出 JSON 数组。"
		].join("\n\n");
		try {
			const text = await complete(ctx, config, {
				system,
				user,
				temperature: .2,
				maxTokens: Math.max(config.maxTokens, 8e3)
			});
			for (const entry of parseJsonArray(text)) {
				const name = typeof entry.name === "string" ? entry.name : "";
				if (name !== "" && typeof entry.status === "string") statuses.set(name, entry.status);
			}
		} catch {}
	}
	const cards = [];
	const roleOf = (name) => roster.find((c) => c.name === name)?.role ?? "other";
	for (const card of roster) {
		const entry = stat.get(card.name);
		cards.push({
			name: card.name,
			role: card.role,
			status: statuses.get(card.name) ?? "",
			lastChapter: entry?.last ?? 0,
			appearances: entry?.chapters.size ?? 0
		});
	}
	for (const [name, entry] of stat) if (!cards.some((c) => c.name === name)) cards.push({
		name,
		role: roleOf(name),
		status: statuses.get(name) ?? "",
		lastChapter: entry.last,
		appearances: entry.chapters.size
	});
	return cards;
}
/** System prompt for foreshadow suggestions. */
function foreshadowSystemPrompt() {
	return [
		"你是一位网文伏笔设计师。你会收到大纲和已写的章节信息，请为小说建议 3-8 条值得埋设的伏笔。",
		"要求：",
		"1. 伏笔必须有明确的回收价值（推动主线、人物弧光、世界观揭秘）。",
		"2. 描述要具体，指出埋设章节与预计回收章节（可空缺）。",
		"3. 优先从大纲的暗线（如记忆代价、残片收集、身世谜团）中提炼。",
		"输出必须是合法 JSON 数组：",
		"[{\"description\": \"伏笔描述\", \"plantedChapter\": 章节号或null, \"targetChapter\": 章节号或null}]",
		"重要：所有字符串值内部不得包含换行符，JSON 必须在一段内完整结束。"
	].join("\n");
}
/** Suggest foreshadows from the outline + plan. */
async function suggestForeshadows(ctx, config, project) {
	const user = [
		"请为下面这部小说设计伏笔。",
		`大纲：\n${project.outline}`,
		`已规划章节数：${project.chapters.length}`
	].join("\n");
	const parsed = parseJsonArray(await complete(ctx, config, {
		system: foreshadowSystemPrompt(),
		user,
		temperature: .5,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const existing = new Set(project.foreshadows.map((f) => f.description));
	const created = [];
	for (const entry of parsed) {
		if (typeof entry !== "object" || entry === null) continue;
		const description = typeof entry.description === "string" ? entry.description.trim() : "";
		if (description === "" || existing.has(description)) continue;
		existing.add(description);
		created.push({
			id: `fs-${Date.now().toString(36)}-${created.length}`,
			description: description.slice(0, 200),
			plantedChapter: typeof entry.plantedChapter === "number" ? entry.plantedChapter : void 0,
			targetChapter: typeof entry.targetChapter === "number" ? entry.targetChapter : void 0,
			status: "planned"
		});
	}
	project.foreshadows.push(...created);
	project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	return created;
}
/**
* 写法引擎：从样本文本提取一份写法资产（叙事风格规则）。
* @returns 提取出的风格规则（未持久化，由调用方存入 project.assets）。
*/
async function extractStyleAsset(ctx, config, sampleText) {
	const user = `请分析下面这段样本文本，提炼其叙事风格规则：\n\n${sampleText}`;
	const raw = parseJsonObject(await complete(ctx, config, {
		system: styleEngineSystemPrompt(),
		user,
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 12e3)
	}));
	const strArray = (value) => Array.isArray(value) ? value.filter((v) => typeof v === "string" && v.trim() !== "") : [];
	const result = {
		proseRules: strArray(raw.proseRules),
		dialogueRules: strArray(raw.dialogueRules),
		descriptionRules: strArray(raw.descriptionRules),
		boundaries: strArray(raw.boundaries)
	};
	if (result.proseRules.length + result.dialogueRules.length + result.descriptionRules.length + result.boundaries.length === 0) throw new Error("写法提取失败：模型没有返回有效规则");
	return result;
}
/** Export the whole book as one txt/md file. */
function exportBook(outputDir, project, format) {
	const parts = [];
	if (format === "md") parts.push(`# ${project.bookName}\n`);
	else parts.push(project.bookName, "");
	const done = project.chapters.filter((c) => c.file !== void 0);
	for (const chapter of done) {
		const body = readChapterFile(outputDir, chapter) ?? "";
		if (format === "md") parts.push(`\n## 第${chapter.no}章 ${chapter.title}\n`, body.trim(), "");
		else parts.push("", `第${chapter.no}章 ${chapter.title}`, "", body.trim(), "");
	}
	const content = parts.join("\n");
	const ext = format === "md" ? "md" : "txt";
	const file = `《${safeFileName(project.bookName)}》全本.${ext}`;
	writeFileSync(join(outputDir, file), content, "utf8");
	return {
		file,
		chars: content.length,
		chapters: done.length
	};
}
//#endregion
//#region src/assistant.ts
/**
* AI assistant engine — a conversational editor over the novel project.
*
* The user talks to the assistant about plot, characters, settings; the
* assistant can reply in prose AND emit action directives that the host
* executes (rewrite a paragraph, edit the bible, regenerate a chapter,
* export the book, ...). Conversation history persists next to the project
* as NDJSON, so a reload keeps the thread.
*
* Action protocol: the model emits a line of the form
*   <dsh-action name="toolName">{jsonArgs}</dsh-action>
* anywhere in its reply. The host strips it, executes the tool, appends the
* result as a tool-role message, and continues the loop (bounded rounds).
*/
/** History file name inside the output dir. */
const ASSISTANT_HISTORY_FILE = "novel-assistant.jsonl";
/** Max tool-call rounds per user turn (safety bound). */
const MAX_TOOL_ROUNDS = 6;
/** Load the persisted conversation (empty when none). */
function loadAssistantHistory(outputDir) {
	const file = join(outputDir, ASSISTANT_HISTORY_FILE);
	if (!existsSync(file)) return [];
	const messages = [];
	try {
		for (const line of readFileSync(file, "utf8").split("\n")) {
			if (line.trim() === "") continue;
			try {
				const parsed = JSON.parse(line);
				if (typeof parsed.role === "string" && typeof parsed.content === "string") messages.push(parsed);
			} catch {}
		}
	} catch {}
	return messages;
}
/** Append one message to the persisted history. Tool payloads (e.g. full
*  outline / chapter text) are capped so the jsonl and later LLM context
*  don't grow unboundedly. */
function appendHistory(outputDir, message) {
	mkdirSync(outputDir, { recursive: true });
	const entry = message.role === "tool" && message.content.length > 4e3 ? {
		...message,
		content: message.content.slice(0, 4e3) + "\n…（已截断，如需完整内容请重新调用工具）"
	} : message;
	appendFileSync(join(outputDir, ASSISTANT_HISTORY_FILE), JSON.stringify(entry) + "\n", "utf8");
}
/** 清空助手对话记录（删除历史文件）。 */
function clearAssistantHistory(outputDir) {
	const file = join(outputDir, ASSISTANT_HISTORY_FILE);
	if (existsSync(file)) rmSync(file, { force: true });
}
/** Render the project snapshot the assistant sees. */
function renderProjectSnapshot(project) {
	const sections = [];
	sections.push(`书名：${project.bookName}`);
	sections.push(`总纲节选（如需全文用 outline_text 工具）：\n${project.outline.slice(0, 2500)}`);
	const assetNames = [];
	if (project.assets?.genre !== void 0) assetNames.push(`题材：${project.assets.genre.name}`);
	if (project.assets?.primaryProgression !== void 0) assetNames.push(`主推进：${project.assets.primaryProgression.name}`);
	if ((project.assets?.styleAssets?.length ?? 0) > 0) assetNames.push(`写法：${project.assets.styleAssets.map((s) => s.name).join("、")}`);
	if ((project.assets?.antiAiRules?.length ?? 0) > 0) assetNames.push(`文戒自定义：${project.assets.antiAiRules.map((r) => r.name).join("、")}`);
	if (assetNames.length > 0) sections.push(`【写作资产】${assetNames.join(" · ")}`);
	if (project.bible !== void 0) {
		const bible = project.bible;
		sections.push("【道藏】");
		if (bible.genre !== "") sections.push(`题材基调：${bible.genre}`);
		if (bible.worldRules.length > 0) sections.push("世界规则：\n" + bible.worldRules.map((r) => `- ${r}`).join("\n"));
		if (bible.characters.length > 0) {
			sections.push("角色卡：");
			for (const card of bible.characters) {
				const roleName = {
					protagonist: "主角",
					supporting: "配角",
					antagonist: "反派",
					other: "其他"
				}[card.role];
				sections.push(`- ${card.name}（${roleName}）：${card.traits.join("、")}${card.goals !== "" ? `；目标：${card.goals}` : ""}`);
			}
		}
		if (bible.redLines.length > 0) sections.push("写作红线：\n" + bible.redLines.map((r) => `- ${r}`).join("\n"));
	}
	if (project.world !== void 0) {
		const world = project.world;
		sections.push("【大世界】");
		if (world.realms.length > 0) sections.push("境界体系：" + world.realms.map((r, i) => `${i + 1}.${r.name}（${r.description.slice(0, 40)}）`).join(" → "));
		if (world.regions.length > 0) sections.push("区域：" + world.regions.map((r) => r.name).join("、"));
		if (world.factions.length > 0) sections.push("势力：" + world.factions.map((f) => `${f.name}（${f.kind}）`).join("、"));
	}
	if (project.volumes !== void 0 && project.volumes.length > 0) {
		sections.push("【卷结构】");
		for (const v of project.volumes) sections.push(`第${v.no}卷《${v.title}》：${v.summary}（章节 ${v.chapterStart}-${v.chapterEnd}）`);
	}
	if (project.chapters.length > 0) {
		const shown = project.chapters.slice(-30);
		sections.push(`【章节计划与进度（最近 ${shown.length} 章）】`);
		for (const c of shown) {
			const statusText = {
				pending: "待生成",
				generating: "生成中",
				written: "待审稿",
				reviewing: "审稿中",
				approved: "已通过",
				rejected: "待修订",
				error: "失败"
			}[c.status];
			sections.push(`第${c.no}章《${c.title}》[${statusText}]${c.chars !== void 0 ? ` ${c.chars}字` : ""}${c.summary !== void 0 && c.summary !== "" ? ` 摘要：${c.summary}` : ""}`);
		}
		if (project.chapters.length > shown.length) sections.push(`（还有 ${project.chapters.length - shown.length} 章未列出，可用 book_overview scope=volume:N 查看）`);
		const recent = project.chapters.filter((c) => c.status === "approved" || c.status === "written").slice(-2);
		if (recent.length > 0) {
			sections.push("【最近章节正文节选】");
			for (const c of recent) sections.push(`第${c.no}章《${c.title}》（节选，如需全文用 chapter_text）：${c.beats.slice(0, 300)}`);
		}
	}
	if (project.foreshadows.length > 0) {
		sections.push("【暗线】");
		for (const f of project.foreshadows) sections.push(`- [${f.status}] ${f.description}${f.targetChapter !== void 0 ? `（预计 ${f.targetChapter} 章回收）` : ""}`);
	}
	if ((project.facts ?? []).length > 0) {
		sections.push("【已确立编年录（最近 40 条，回答设定问题必须遵守）】");
		for (const f of (project.facts ?? []).slice(-40)) sections.push(`- [第${f.chapterNo}章] ${f.text}`);
	}
	if (project.blurb !== void 0 && project.blurb !== "") sections.push(`【卷首语】${project.blurb}`);
	return sections.join("\n");
}
/** The assistant system prompt. */
function assistantSystemPrompt(project) {
	return [
		"你是「编辑老师」——服务这本书作者的资深中文网文编辑。",
		"人设：二十年网文老编辑，懂套路、懂市场、懂节奏，说话直接但句句有用。",
		"座右铭：「书是你的，但坑我替你盯着。」",
		"职责边界：陪作者讨论剧情/人设/世界观/爽点节奏并落地修改、维护全书一致性；不闲聊、不彩虹屁、不无意义长篇大论。",
		"==================== 模块正式名称（回复作者时一律使用，禁止使用括号里的旧称） ====================",
		"总纲 = 总纲；道藏 = 道藏；暗线 = 暗线；卷首语 = 卷首语；编年录 = 编年录。",
		"==================== 当前项目快照 ====================",
		renderProjectSnapshot(project),
		"==================== 快照结束 ====================",
		"",
		"工作规则（严格遵守）：",
		"1. 全量知情：回答和修改必须基于项目真实数据，禁止编造书中不存在的设定。需要完整信息时，先调用 book_overview 获取全书上下文（总纲全文/道藏/大世界/编年录/全部章节要点/暗线/卷首语）；需要某章正文用 chapter_text。",
		"2. 修改流程：改前用一句话说明意图 → 执行工具 → 改后简要汇报。",
		"3. 连锁维护：改动可能波及其它位置（其它章节、设定、编年录、卷首语）时，执行后主动调用 impact_analysis 分析影响面，并把「必须同步」的项一并处理或明确提示作者逐项确认。",
		"4. 删除红线：删除章节、清空设定等破坏性操作必须等作者明确同意。",
		"5. 品质门槛：建议必须具体——指出问题在哪一章、哪一段、哪一句，并给出可落地的改法；禁止\"建议增强冲突\"这类空话。",
		"6. 设定忠诚：忠于总纲、道藏、大世界、编年录；发现书中已有内容与设定冲突时，主动指出并给修正方案。",
		"7. 中文回复，简洁有干货。",
		"",
		"可用工具：",
		"- book_overview：{\"scope\": \"recent|full|volume:2\"(可选，默认 recent)}。返回全书上下文包（总纲/道藏/大世界/章节要点/编年录/暗线/卷首语）。recent=最近30章；full=全部章节（书很长时慎用）；volume:N=只看第N卷。",
		"- facts_query：{\"keyword\": \"关键词\"}。从编年录按关键词检索相关事实（如灵石、境界名、人物名）。",
		"- impact_analysis：{\"change\": \"要做的修改描述\"}。分析这次改动会波及哪些位置，返回影响清单（定位到章节/设定/编年录）。",
		"- outline_text：无参数。返回当前总纲全文。",
		"- outline_replace：{\"old\": \"要替换的原文片段\", \"new\": \"新文本\"}。在总纲中替换一段文字（old 必须能在总纲中找到）。",
		"- bible_set_rule：{\"index\": 序号(0起), \"text\": \"新规则文本\"} 或 {\"append\": \"追加的规则\"}。修改道藏的世界规则。",
		"- bible_set_redline：同上，修改写作红线。",
		"- chapter_text：{\"no\": 章节号}。返回该章正文。",
		"- chapter_rewrite：{\"no\": 章节号, \"instructions\": \"修改要求\", \"target\": \"原文片段(可选，留空整章)\"}。按讨论结果修订章节；给了 target 只改该自然段。",
		"- chapter_generate：{\"no\": 章节号}。重新生成该章。",
		"- chapter_review：{\"no\": 章节号}。对该章执行 AI 审稿。",
		"- foreshadow_add：{\"description\": \"暗线描述\", \"targetChapter\": 预计回收章(可选)}。新增暗线。",
		"- foreshadow_update：{\"id\": \"暗线id\", \"status\": \"planned|planted|progressing|resolved|abandoned\"}。更新暗线状态。",
		"- export_txt：无参数。导出全本 TXT。",
		"- assets_status：无参数。查看本书当前写作资产（题材/推进模式/反AI规则/写法）。",
		"- assets_set_genre：{\"name\": \"题材名\", \"description\": \"题材说明(可选)\"}。设置本书题材基底。",
		"- assets_set_progression：{\"name\": \"模式名\", \"driver\": \"驱动力\", \"primary\": true/false}。设置主/辅助推进模式。",
		"- assets_add_rule：{\"name\": \"规则名(可选)\", \"avoid\": \"要避免的表达问题\", \"fix\": \"修正方向(可选)}。新增反 AI 规则。",
		"",
		"回答质量要求（非常重要）：",
		"- 具体：回答必须引用项目里的真实内容（人名、境界、章节、暗线、设定），禁止空泛套话。快照里没有的信息，先调用工具获取（chapter_text / outline_text）再回答。",
		"- 专业：给建议时说明理由，指出问题所在章节/段落，给出可直接落地的修改方案（改什么、怎么改）。",
		"- 主动：作者说\"改一下\"，主动调用对应工具执行，不要只给建议不动手；执行前用一句话说明意图，执行后简短汇报结果。",
		"- 忠于设定：以总纲、道藏、编年录为准，不得自相矛盾；发现问题（如剧情与设定冲突）主动指出。",
		"- 中文回复；文字量适中，别啰嗦。",
		"",
		"使用规则（非常重要）：",
		"- 写操作（chapter_generate / chapter_rewrite / chapter_review / outline_replace / bible_set_* / foreshadow_* / assets_set_* / export_txt）只有在作者明确要求时才能调用——例如作者说\"生成第 120 章\"\"把第 105 章结尾改一下\"\"帮我审一下第 88 章\"。作者只是提问、闲聊、查信息时，一律用文字回答，禁止调用任何写操作，也不要先斩后奏（如\"为了回答你，我先把第 X 章生成了\"）。",
		"- 当你想执行任何工具时，你的【整个回复】必须只包含动作指令标签，格式如下（不要有任何解释文字、不要用自然语言说\"我要去改\"，直接输出标签）：",
		"  正确示例：<dsh-action name=\"outline_replace\">{\"old\":\"要替换的原文\",\"new\":\"新文本\"}</dsh-action>",
		"  正确示例：<dsh-action name=\"chapter_text\">{\"no\":1}</dsh-action>",
		"  错误示例（绝对不要这样回复）：\"好的，我先看一下总纲，马上改。\" ← 这只是文字，不会执行任何操作",
		"  错误示例（绝对不要这样回复）：\"先拉完整上下文确认改动落地情况，避免继续空转。\" ← 没有动作标签，不会执行任何操作",
		"  错误示例（绝对不要这样回复）：\"现在处理暗线库，我先看当前列表定位 id。\" ← 没有动作标签，不会执行任何操作",
		"- 铁律：只要你想执行任何操作，你的【整个回复】必须只包含一个动作标签，禁止先说话、禁止解释\"我要做什么\"、禁止铺垫——直接输出标签。",
		"- 如果你收到「格式提示」（宿主说你没有输出动作标签）：你的下一条回复必须只输出动作标签，禁止再解释、禁止再道歉、禁止再描述计划。",
		"- 工具调用是自动的：你输出标签后，宿主会执行并把结果反馈给你，你再基于结果继续。",
		"- 每次回复最多调用 1 个动作；执行结果会反馈给你，你可以继续讨论或再调用。",
		"- 需要先看总纲/章节再决定怎么改？那就先输出一个 outline_text / chapter_text 的标签，等结果回来。",
		"- chapter_rewrite 的 target 参数：从章节正文中复制一小段（一句话或几句话即可），不要带换行、不要带引号，取连续文本片段。",
		"- 如果工具执行失败（例如片段未找到），根据错误信息修正参数后自动重试一次，不要直接放弃或让作者手动操作。",
		"- 修改前先向作者说明你要改什么、为什么；动作执行后简要汇报结果。",
		"- 涉及删除类操作（删除章节、清空设定）必须等作者明确同意。",
		"- 严格忠于道藏与总纲；不得自行发明与既有设定冲突的内容。",
		"- 用中文回复。"
	].join("\n");
}
/** Execute one action directive. Returns a text result (or throws). */
/**
* Execute one action directive as an async generator: yields live progress
* text (chapter text being generated/rewritten), then yields the final result
* string. Throws on failure.
*/
async function* executeAction(ctx, config, project, outputDir, name, args) {
	const str = (value) => typeof value === "string" ? value : "";
	const num = (value) => typeof value === "number" ? value : void 0;
	/** Forward live text deltas from a streaming chapter job (text only). */
	const forward = async function* (stream) {
		for await (const step of stream) if (step.frame === "delta") yield step.text;
	};
	switch (name) {
		case "book_overview": {
			const scopeArg = str(args.scope);
			return bookOverview(project, scopeArg === "full" ? "full" : /^volume:(\d+)$/.test(scopeArg) ? Number(scopeArg.slice(7)) : "recent");
		}
		case "facts_query": {
			const keyword = str(args.keyword).trim();
			if (keyword === "") throw new Error("facts_query 需要 keyword");
			const hits = (project.facts ?? []).filter((f) => f.text.includes(keyword)).slice(-30);
			if (hits.length === 0) return `编年录中未找到与「${keyword}」相关的事实记录。`;
			return `编年录中与「${keyword}」相关的事实（${hits.length} 条）：\n` + hits.map((f) => `- [第${f.chapterNo}章] ${f.text}`).join("\n");
		}
		case "impact_analysis": {
			const change = str(args.change);
			if (change === "") throw new Error("impact_analysis 需要 change（要做的修改描述）");
			const items = await analyzeImpact(ctx, config, project, outputDir, change);
			if (items.length === 0) return "影响分析：未发现需要同步修改的位置。";
			const lines = items.map((it, i) => `${i + 1}. [${it.location}]「${it.quote}」${it.suggestion !== "" ? ` → ${it.suggestion}` : ""}（${it.kind === "must" ? "必须同步" : it.kind === "optional" ? "建议" : "备注"}）`);
			return `影响分析：这次改动波及 ${items.length} 处——\n${lines.join("\n")}\n请据此提示作者逐项处理；章节内的修改可引导作者在工作区查看。`;
		}
		case "outline_text": return project.outline;
		case "outline_replace": {
			const old = str(args.old);
			const next = str(args.new);
			if (old === "" || !project.outline.includes(old)) throw new Error(`总纲中未找到片段「${old.slice(0, 40)}…」`);
			project.outline = project.outline.replace(old, next);
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `总纲已修改：替换了 ${old.length} 字符的片段。`;
		}
		case "bible_set_rule": {
			if (project.bible === void 0) throw new Error("尚无道藏，请先提炼");
			const index = num(args.index);
			if (index !== void 0) project.bible.worldRules[index] = str(args.text);
			else if (str(args.append) !== "") project.bible.worldRules.push(str(args.append));
			else throw new Error("bible_set_rule 需要 index+text 或 append");
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `世界规则已更新（当前 ${project.bible.worldRules.length} 条）。`;
		}
		case "bible_set_redline": {
			if (project.bible === void 0) throw new Error("尚无道藏，请先提炼");
			const index = num(args.index);
			if (index !== void 0) project.bible.redLines[index] = str(args.text);
			else if (str(args.append) !== "") project.bible.redLines.push(str(args.append));
			else throw new Error("bible_set_redline 需要 index+text 或 append");
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `写作红线已更新（当前 ${project.bible.redLines.length} 条）。`;
		}
		case "chapter_text": {
			const no = num(args.no);
			if (no === void 0) throw new Error("chapter_text 需要 no");
			const chapter = project.chapters.find((c) => c.no === no);
			if (chapter === void 0) throw new Error(`章节 ${no} 不存在`);
			const body = readChapterFile(outputDir, chapter);
			if (body === void 0) throw new Error(`章节 ${no} 尚未生成`);
			return body;
		}
		case "chapter_rewrite": {
			const no = num(args.no);
			if (no === void 0) throw new Error("chapter_rewrite 需要 no");
			const instructions = str(args.instructions);
			const target = str(args.target);
			for await (const chunk of forward(rewriteChapterStream(ctx, config, project, outputDir, no, instructions, target === "" ? void 0 : target))) yield chunk;
			const chapter = project.chapters.find((c) => c.no === no);
			const draft = chapter?.pendingDraft;
			if (chapter === void 0 || draft === void 0 || draft === "") throw new Error(`章节 ${no} 修订后没有产出草稿`);
			const fileName = chapterFileName(chapter);
			mkdirSync(outputDir, { recursive: true });
			writeFileSync(join(outputDir, fileName), `# 第${chapter.no}章 ${chapter.title}\n\n${draft}\n`, "utf8");
			chapter.pendingDraft = void 0;
			chapter.status = "written";
			chapter.chars = draft.length;
			chapter.file = fileName;
			chapter.review = void 0;
			chapter.error = void 0;
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			yield "（已采纳修订稿，正在生成章节摘要与编年录…）";
			try {
				await summarizeAndExtractFacts(ctx, config, project, outputDir, no);
			} catch {}
			yield "（正在 AI 审稿…）";
			const report = await reviewChapter(ctx, config, project, outputDir, no);
			return `章节 ${no} 已${target === "" ? "整章" : "局部"}修订完成（${project.chapters.find((c) => c.no === no)?.chars ?? "?"} 字）。重新审稿：${report.score} 分 — ${report.verdict}`;
		}
		case "chapter_generate": {
			const no = num(args.no);
			if (no === void 0) throw new Error("chapter_generate 需要 no");
			for await (const chunk of forward(generateChapterStream(ctx, config, project, outputDir, no))) yield chunk;
			yield "（正在生成章节摘要与编年录…）";
			try {
				await summarizeAndExtractFacts(ctx, config, project, outputDir, no);
			} catch {}
			yield "（正在 AI 审稿…）";
			const report = await reviewChapter(ctx, config, project, outputDir, no);
			return `章节 ${no} 已生成（${project.chapters.find((c) => c.no === no)?.chars ?? "?"} 字）。审稿：${report.score} 分 — ${report.verdict}`;
		}
		case "chapter_review": {
			const no = num(args.no);
			if (no === void 0) throw new Error("chapter_review 需要 no");
			const report = await reviewChapter(ctx, config, project, outputDir, no);
			const issues = report.issues.map((i) => `[${i.severity}] ${i.item} → ${i.suggestion}`).join("\n");
			return `章节 ${no} 审稿：${report.score} 分 — ${report.verdict}\n${issues}`;
		}
		case "foreshadow_add": {
			const description = str(args.description);
			if (description === "") throw new Error("foreshadow_add 需要 description");
			const targetChapter = num(args.targetChapter);
			project.foreshadows.push({
				id: `fs-${Date.now().toString(36)}`,
				description,
				targetChapter,
				status: "planned"
			});
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `已新增暗线：「${description.slice(0, 50)}」`;
		}
		case "foreshadow_update": {
			const id = str(args.id);
			const status = str(args.status);
			const target = project.foreshadows.find((f) => f.id === id);
			if (target === void 0) throw new Error(`暗线 ${id} 不存在`);
			if (![
				"planned",
				"planted",
				"progressing",
				"resolved",
				"abandoned"
			].includes(status)) throw new Error(`非法状态 ${status}`);
			target.status = status;
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `暗线已更新为 ${status}：「${target.description.slice(0, 50)}」`;
		}
		case "export_txt": {
			const result = exportBook(outputDir, project, "txt");
			return `已导出 TXT：${result.file}（${result.chars} 字，${result.chapters} 章）`;
		}
		case "assets_status": {
			const assets = project.assets;
			if (assets === void 0) return "本书尚未配置写作资产。";
			const parts = [];
			if (assets.genre !== void 0) parts.push(`题材：${assets.genre.name}`);
			if (assets.primaryProgression !== void 0) parts.push(`主推进：${assets.primaryProgression.name}`);
			if (assets.auxiliaryProgressions.length > 0) parts.push(`辅助推进：${assets.auxiliaryProgressions.map((m) => m.name).join("、")}`);
			if (assets.antiAiRules.length > 0) parts.push(`自定义反AI规则：${assets.antiAiRules.map((r) => r.name).join("、")}`);
			if (assets.styleAssets.length > 0) parts.push(`写法资产：${assets.styleAssets.map((s) => s.name).join("、")}`);
			return parts.length > 0 ? parts.join("\n") : "本书尚未配置写作资产。";
		}
		case "assets_set_genre": {
			const name = str(args.name);
			const description = str(args.description);
			if (name === "") throw new Error("assets_set_genre 需要 name");
			if (project.assets === void 0) project.assets = emptyProjectAssets();
			project.assets.genre = {
				name,
				description,
				children: []
			};
			project.assets.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `题材已设为「${name}」`;
		}
		case "assets_set_progression": {
			const name = str(args.name);
			const driver = str(args.driver);
			const primary = args.primary !== false;
			if (name === "") throw new Error("assets_set_progression 需要 name");
			if (project.assets === void 0) project.assets = emptyProjectAssets();
			const mode = {
				name,
				driver: driver !== "" ? driver : name,
				readerExpectation: str(args.readerExpectation),
				payoffs: Array.isArray(args.payoffs) ? args.payoffs.filter((v) => typeof v === "string") : [],
				risks: Array.isArray(args.risks) ? args.risks.filter((v) => typeof v === "string") : [],
				primary
			};
			if (primary) project.assets.primaryProgression = mode;
			else {
				if (project.assets.auxiliaryProgressions === void 0) project.assets.auxiliaryProgressions = [];
				project.assets.auxiliaryProgressions.push(mode);
			}
			project.assets.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `推进模式${primary ? "（主）" : "（辅助）"}已设置：「${name}」`;
		}
		case "assets_add_rule": {
			const name = str(args.name);
			const avoid = str(args.avoid);
			if (avoid === "") throw new Error("assets_add_rule 需要 avoid（要避免的表达问题）");
			if (project.assets === void 0) project.assets = emptyProjectAssets();
			if (project.assets.antiAiRules === void 0) project.assets.antiAiRules = [];
			project.assets.antiAiRules.push({
				name: name !== "" ? name : `自定义规则 ${project.assets.antiAiRules.length + 1}`,
				avoid,
				fix: str(args.fix)
			});
			project.assets.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `已新增反 AI 规则「${name !== "" ? name : avoid.slice(0, 20)}」`;
		}
		default: throw new Error(`未知工具 ${name}`);
	}
}
/** Extract the first action directive from a reply (tolerant to common tag misspellings). */
function extractAction(reply) {
	const match = /<([a-z_]*d[a-z]?sh?-action)\s+name="([^"]+)"\s*>([\s\S]*?)<\/\1>/.exec(reply);
	if (match === null) return void 0;
	const rawArgs = match[3]?.trim() ?? "";
	let args;
	try {
		args = rawArgs === "" ? {} : JSON.parse(rawArgs);
	} catch {
		throw new Error(`动作参数不是合法 JSON：${rawArgs.slice(0, 80)}`);
	}
	return {
		name: match[2] ?? "",
		args,
		index: match.index
	};
}
/** Render the recent history as LLM messages (skipping tool chatter in early rounds). */
function historyToMessages(history) {
	const recent = history.slice(-18);
	const messages = [];
	for (const entry of recent) if (entry.role === "user") messages.push(createUserMessage({
		content: [{
			type: "text",
			text: entry.content
		}],
		source: {
			kind: "plugin",
			plugin: "dsh-novel-forge"
		}
	}));
	else if (entry.role === "assistant") messages.push(createAssistantMessage({
		content: [{
			type: "text",
			text: entry.content
		}],
		source: {
			provider: "deepseek-official",
			model: "deepseek-v4-flash"
		}
	}));
	else if (entry.role === "tool") {
		const body = entry.content.length > 2e3 ? entry.content.slice(0, 2e3) + "\n…（结果过长已截断，需要完整内容请重新调用工具）" : entry.content;
		messages.push(createUserMessage({
			content: [{
				type: "text",
				text: `【工具 ${entry.tool ?? ""} 的执行结果】\n${body}`
			}],
			source: {
				kind: "plugin",
				plugin: "dsh-novel-forge"
			}
		}));
	}
	return messages;
}
/** One non-streaming LLM chat turn (used inside the tool loop). */
async function chatOnce(ctx, config, system, history) {
	const messages = historyToMessages(history);
	const last = messages[messages.length - 1];
	if (last?.role === "user" && Array.isArray(last.content)) {
		const blocks = last.content;
		const idx = blocks.findIndex((b) => b.type === "text");
		if (idx !== -1) {
			const textBlock = blocks[idx];
			const newBlocks = blocks.map((b, i) => i === idx ? {
				...textBlock,
				text: textBlock.text + "\n\n（回复格式提醒：如果你需要执行任何操作，你的回复必须【只包含】一个 <dsh-action name=\"工具名\">{\"参数\":值}</dsh-action> 标签，禁止先说话、禁止解释、禁止铺垫；如果你只是在回答或讨论，正常回复即可，不要输出标签。）"
			} : b);
			messages[messages.length - 1] = {
				...last,
				content: newBlocks
			};
		}
	}
	const request = {
		provider: config.provider,
		model: config.model,
		messages,
		system,
		maxTokens: Math.max(config.maxTokens, 16e3),
		temperature: .7
	};
	const assembler = new BlockAssembler();
	for await (const chunk of ctx.llm.stream(request)) assembler.push(chunk);
	const finish = assembler.finish;
	if (finish.kind === "error" || finish.kind === "aborted") throw new Error(`助手调用失败（${finish.kind}）: ${finish.failure.message}`);
	const blocks = assembler.blocks();
	let text = blocks.filter((block) => block.type === "text").map((block) => block.text).join("\n").trim();
	if (text === "") {
		const reasoning = blocks.filter((block) => block.type === "reasoning").map((block) => block.text).join("\n").trim();
		if (reasoning !== "") text = reasoning;
	}
	return text;
}
/** Run one user turn. Yields stream frames; persists history. */
async function* runAssistantTurn(ctx, config, project, outputDir, userMessage) {
	const history = loadAssistantHistory(outputDir);
	const system = assistantSystemPrompt(project);
	const userEntry = {
		role: "user",
		content: userMessage,
		ts: (/* @__PURE__ */ new Date()).toISOString()
	};
	history.push(userEntry);
	appendHistory(outputDir, userEntry);
	let round = 0;
	/** 已提示模型输出动作标签的次数（0 = 尚未提示；超过上限则按纯文字回复结束，防死循环）。 */
	let nudged = 0;
	const MAX_NUDGES = 6;
	/** 连续收到 hex 乱码回复的次数（≥2 次判定 LLM 侧异常，放弃本轮避免死循环）。 */
	let garbleCount = 0;
	const WRITE_TOOL_KEYS = {
		chapter_generate: /(生成|写第\s*\d+\s*章|写一[章篇]|新写|续写|接着写|继续写|开始写|写正文|写书|创作)/,
		chapter_rewrite: /(重写|改写|修订|修改|改一下|调整|替换|润色|优化|修正|完善|回炉|换一种|从头)/,
		chapter_review: /(审|检查|校验|点评|评估|把关|质量|怎么样|如何)/,
		outline_replace: /(大纲|总纲|简介)/,
		bible_set_rule: /(道藏|设定|规则|红线|世界|金手指)/,
		bible_set_redline: /(道藏|设定|红线)/,
		foreshadow_add: /(暗线|伏笔|埋)/,
		foreshadow_update: /(暗线|伏笔)/,
		export_txt: /(导出|打包|下载|txt)/,
		assets_set_genre: /(题材)/,
		assets_set_progression: /(推进)/,
		assets_add_rule: /(规则|文戒|反AI)/
	};
	/** 本轮已放行过写操作：后续写操作（生成→审稿→修订闭环）不再逐个拦截。 */
	let writeUnlocked = false;
	const guardWrite = (name, userMessage) => {
		if (writeUnlocked) return true;
		const key = WRITE_TOOL_KEYS[name];
		if (key === void 0) return true;
		const recentUsers = history.filter((m) => m.role === "user").slice(-2).map((m) => m.content).join("\n");
		if (key.test(recentUsers)) {
			writeUnlocked = true;
			return true;
		}
		return false;
	};
	for (;;) {
		if (round++ > 20) break;
		const reply = await chatOnce(ctx, config, system, history);
		if (reply.length > 120 && /^[0-9a-fA-F\s]+$/.test(reply.slice(0, 2e3))) {
			garbleCount++;
			if (garbleCount >= 2) {
				const garbleEntry = {
					role: "assistant",
					content: "（模型本次返回了异常编码内容，已忽略；请重新描述你的问题。）",
					ts: (/* @__PURE__ */ new Date()).toISOString()
				};
				history.push(garbleEntry);
				appendHistory(outputDir, garbleEntry);
				yield {
					frame: "delta",
					text: garbleEntry.content
				};
				return;
			}
			continue;
		}
		const action = extractAction(reply);
		if (action === void 0) {
			const intendsAction = /(改|修改|修订|重写|替换|调整|生成|新增|删除|导出|看看|查看|调出|读一下|加上|加一个|去掉|删掉|把.+改成|定位|处理|转轨|检查|确认|搜索|找一下|列一下|查一下|查一遍|查一查|再查|查查|核实|核对|清点|盘点|看一下|看下|继续)/.test(reply);
			const mentionsTarget = /(编年录|道藏|暗线|总纲|卷首语|章节|正文|规则|红线|伏笔|简介|大纲|事实|设定|世界|角色|人物|第\s*\d+\s*章)/.test(reply);
			const strayTag = /<[a-z_-]*action[^>]*>/.test(reply);
			if ((intendsAction || mentionsTarget || strayTag) && nudged < MAX_NUDGES) {
				const userWriteIntent = Object.values(WRITE_TOOL_KEYS).some((re) => re.test(userMessage));
				const nudge = nudged === 0 ? userWriteIntent ? "你的上一条回复表达了想操作项目的意图（或动作标签格式有误），因此没有执行任何操作。请直接输出动作标签来执行，格式必须为 <dsh-action name=\"工具名\">{\"参数\":值}</dsh-action>（注意拼写是 dsh-action，不是 dash-action；标签成对出现，参数为合法 JSON）。如果需要先看内容，先输出 outline_text 或 chapter_text 标签。" : "你刚才的回复看起来在讨论项目内容，但没有必要执行任何操作。如果用户只是在提问或闲聊，请直接以文字回答即可，不要输出动作标签，也不要自行调用任何写操作（生成/修订/删除等只有用户明确要求时才允许）。若确实需要先查看数据，最多使用只读工具（outline_text / chapter_text / book_overview / facts_query）。" : userWriteIntent ? `你第 ${nudged + 1} 次表达了操作意图但没有输出动作标签，因此仍未执行任何操作。铁律：你的【整个回复】现在必须只包含一个 <dsh-action> 标签（例如 <dsh-action name="chapter_text">{"no":1}</dsh-action>），禁止任何解释、铺垫或"我这就去"之类的文字。若你其实不打算执行任何操作，请明确回复「不执行」。` : `你第 ${nudged + 1} 次回复仍不需要执行操作。再次强调：用户没有要求修改，请直接给出文字回答（可以简短引用项目数据），不要输出动作标签。写操作只会在用户明确要求时被允许。`;
				nudged++;
				history.push({
					role: "tool",
					content: nudge,
					tool: "format-hint",
					ts: (/* @__PURE__ */ new Date()).toISOString()
				});
				appendHistory(outputDir, {
					role: "tool",
					content: nudge,
					tool: "format-hint",
					ts: (/* @__PURE__ */ new Date()).toISOString()
				});
				continue;
			}
			const assistantEntry = {
				role: "assistant",
				content: reply,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			};
			history.push(assistantEntry);
			appendHistory(outputDir, assistantEntry);
			yield {
				frame: "delta",
				text: reply
			};
			return;
		}
		const { name, args, index } = action;
		const prose = reply.slice(0, index).trim();
		if (!guardWrite(name, userMessage)) {
			const denied = `【操作被拒绝】${name} 是写操作（会修改正文/项目数据），但你当前的消息里没有明确要求执行该修改。如果需要，请明确说明（如「生成第 120 章」「把第 105 章结尾改一下」）。我不会擅自修改你的作品。`;
			history.push({
				role: "tool",
				content: denied,
				tool: name,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			appendHistory(outputDir, {
				role: "tool",
				content: denied,
				tool: name,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			yield {
				frame: "tool",
				name,
				status: "error",
				detail: denied
			};
			const assistantEntry = {
				role: "assistant",
				content: denied,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			};
			history.push(assistantEntry);
			appendHistory(outputDir, assistantEntry);
			yield {
				frame: "delta",
				text: denied
			};
			return;
		}
		yield {
			frame: "tool",
			name,
			status: "start"
		};
		let result;
		try {
			const iterator = executeAction(ctx, config, project, outputDir, name, args)[Symbol.asyncIterator]();
			result = "";
			for (;;) {
				const step = await iterator.next();
				if (step.done === true) {
					result = typeof step.value === "string" ? step.value : "";
					break;
				}
				const chunk = step.value;
				if (typeof chunk === "string" && chunk !== "") yield {
					frame: "toolDelta",
					name,
					text: chunk
				};
			}
			yield {
				frame: "tool",
				name,
				status: "done",
				detail: result.slice(0, 200)
			};
		} catch (error) {
			result = `执行失败：${error.message}`;
			yield {
				frame: "tool",
				name,
				status: "error",
				detail: error.message
			};
		}
		if (prose !== "") {
			history.push({
				role: "assistant",
				content: prose,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			appendHistory(outputDir, {
				role: "assistant",
				content: prose,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
		}
		history.push({
			role: "tool",
			content: result,
			tool: name,
			ts: (/* @__PURE__ */ new Date()).toISOString()
		});
		appendHistory(outputDir, {
			role: "tool",
			content: result,
			tool: name,
			ts: (/* @__PURE__ */ new Date()).toISOString()
		});
		round++;
		if (round >= MAX_TOOL_ROUNDS) {
			const message = `（已连续执行 ${round} 次修改操作，本轮停止。如需继续请再说。）`;
			history.push({
				role: "assistant",
				content: message,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			appendHistory(outputDir, {
				role: "assistant",
				content: message,
				ts: (/* @__PURE__ */ new Date()).toISOString()
			});
			yield {
				frame: "delta",
				text: message
			};
			return;
		}
	}
}
//#endregion
//#region src/bookshelf.ts
/**
* 书架（Bookshelf）— 多书管理：一本书记录一个独立输出目录。
* 状态持久化到 ~/.dsh/dsh-novel-forge-bookshelf.json（跟随 dsh 配置惯例）。
*/
/** 书架配置文件路径。 */
function bookshelfFile() {
	return join(homedir(), ".dsh", "dsh-novel-forge-bookshelf.json");
}
function defaultStore() {
	return {
		books: [],
		activeBookId: null
	};
}
/** 读取书架（无则返回空）。 */
function loadBookshelf() {
	const file = bookshelfFile();
	if (!existsSync(file)) return defaultStore();
	try {
		let raw = readFileSync(file, "utf8");
		if (raw.charCodeAt(0) === 65279) raw = raw.slice(1);
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed.books)) return defaultStore();
		return {
			books: parsed.books,
			activeBookId: parsed.activeBookId ?? null
		};
	} catch {
		return defaultStore();
	}
}
/** 持久化书架。 */
function saveBookshelf(store) {
	const file = bookshelfFile();
	mkdirSync(join(homedir(), ".dsh"), { recursive: true });
	writeFileSync(file, JSON.stringify(store, null, 2), "utf8");
}
/** 当前激活的书。 */
function activeBook(store) {
	return store.books.find((b) => b.id === store.activeBookId);
}
/** 书架快照（含每本书的进度摘要）。 */
function bookshelfSnapshot(store) {
	return {
		books: store.books.map((book) => {
			const project = loadProject(book.outputDir);
			const done = project === void 0 ? 0 : project.chapters.filter((c) => c.status === "approved" || c.status === "written" || c.status === "rejected").length;
			const hasCover = project?.coverPath !== void 0 && project.coverPath !== "" && existsSync(join(book.outputDir, project.coverPath));
			return {
				...book,
				done,
				total: project?.chapters.length ?? 0,
				hasProject: project !== void 0,
				hasCover,
				blurb: project?.blurb
			};
		}),
		activeBookId: store.activeBookId
	};
}
/** 新建一本书（自动成为当前书）。 */
function createBook(bookName, outputDir) {
	const store = loadBookshelf();
	const id = `book-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
	const now = (/* @__PURE__ */ new Date()).toISOString();
	const book = {
		id,
		bookName,
		outputDir,
		createdAt: now,
		updatedAt: now
	};
	store.books.push(book);
	store.activeBookId = id;
	saveBookshelf(store);
	return book;
}
/** 更新某本书的书名（开书向导导入大纲后书名以大纲首行为准）。 */
function renameBook(id, bookName) {
	const store = loadBookshelf();
	const book = store.books.find((b) => b.id === id);
	if (book === void 0) return false;
	book.bookName = bookName;
	book.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveBookshelf(store);
	return true;
}
/**
* 播种：书架为空时，把指定输出目录下已有的项目自动登记为第一本书。
* 兼容升级场景 —— 旧版插件直接在输出目录写项目，从未登记书架。
* @param outputDir - 候选输出目录（通常为 settings 的默认输出目录）。
* @returns 是否发生了播种。
*/
function seedBookshelfFromOutputDir(outputDir) {
	if (loadBookshelf().books.length > 0) return false;
	if (!existsSync(outputDir)) return false;
	const hasProject = existsSync(join(outputDir, "novel-project.json"));
	const hasChapters = existsSync(outputDir);
	if (!hasProject && !hasChapters) return false;
	createBook(loadProject(outputDir)?.bookName ?? outputDir.split(/[\\/]/).pop() ?? "未命名小说", outputDir);
	return true;
}
/** 激活一本书。 */
function activateBook(id) {
	const store = loadBookshelf();
	const book = store.books.find((b) => b.id === id);
	if (book === void 0) return void 0;
	store.activeBookId = id;
	book.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
	saveBookshelf(store);
	return book;
}
/** 移除一本书。 */
function removeBook(id) {
	const store = loadBookshelf();
	const idx = store.books.findIndex((b) => b.id === id);
	if (idx === -1) return false;
	store.books.splice(idx, 1);
	if (store.activeBookId === id) store.activeBookId = store.books[0]?.id ?? null;
	saveBookshelf(store);
	return true;
}
/** 当前书输出目录（无书架则 undefined，回退 settings）。 */
function activeBookOutputDir() {
	return activeBook(loadBookshelf())?.outputDir;
}
/** 默认输出目录推断：桌面/书名。 */
function defaultOutputDirFor(bookName) {
	const clean = bookName.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 40) || "未命名小说";
	return join(homedir(), "Desktop", clean);
}
//#endregion
//#region src/routes.ts
/** Cap on JSON request bodies (generous: cover images travel as base64). */
const MAX_JSON_BODY_BYTES = 16 * 1024 * 1024;
/** Loopback-only fence (mirrors the family plugins' pairing routes). */
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL(`http://${host}`);
	} catch {
		return false;
	}
	if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
/** One JSON response. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(payload);
}
/** Read a JSON request body. */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > MAX_JSON_BODY_BYTES) return void 0;
		chunks.push(buffer);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		return;
	}
}
/** Default chapter count for planning when the request omits it. */
const DEFAULT_PLAN_COUNT = 30;
/**
* Build every /api/dsh-novel-forge route.
* @param deps - context, config resolver, config patcher.
* @returns the route list.
*/
function makeRoutes(deps) {
	const { ctx, getConfig, patchConfig } = deps;
	/** Guard helper: fence + method check. */
	const guard = (req, res, method) => {
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, { error: "forbidden: loopback-only" });
			return false;
		}
		if (req.method !== method) {
			writeJson(res, 405, { error: `method not allowed (expected ${method})` });
			return false;
		}
		return true;
	};
	/** Load (and sync) the project, or respond 400. */
	const requireProject = (res) => {
		const config = getConfig();
		const project = loadProject(config.outputDir);
		if (project === void 0) {
			writeJson(res, 400, { error: "输出目录中没有项目，请先加载大纲" });
			return;
		}
		syncProjectWithDisk(project, config.outputDir);
		saveProject(config.outputDir, project);
		return project;
	};
	const statusRoute = {
		kind: "exact",
		path: NOVEL_API.status,
		handler: (req, res) => {
			if (!guard(req, res, "GET")) return;
			const config = getConfig();
			seedBookshelfFromOutputDir(config.outputDir);
			const project = loadProject(config.outputDir);
			if (project !== void 0) {
				const staleMs = 600 * 1e3;
				for (const c of project.chapters) if (c.status === "generating" && c.generatingAt !== void 0) {
					const started = new Date(c.generatingAt).getTime();
					if (Number.isFinite(started) && Date.now() - started > staleMs) {
						c.status = "pending";
						c.error = void 0;
						c.generatingAt = void 0;
					}
				}
				syncProjectWithDisk(project, config.outputDir);
				saveProject(config.outputDir, project);
			}
			writeJson(res, 200, {
				config,
				project: project !== void 0 ? {
					...project,
					facts: (project.facts ?? []).slice(-80)
				} : void 0,
				generatedFiles: listChapterFiles(config.outputDir)
			});
		}
	};
	const loadOutlineRoute = {
		kind: "exact",
		path: NOVEL_API.loadOutline,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const config = getConfig();
			try {
				let outline;
				let path;
				if (body?.text !== void 0 && body.text.trim() !== "") outline = body.text.trim();
				else {
					const target = body?.path?.trim() !== "" && body?.path !== void 0 ? body.path : config.outlinePath;
					outline = readOutlineFromDocx(target);
					path = target;
				}
				if (outline.length < 50) {
					writeJson(res, 400, { error: "大纲内容过短（<50 字符），请检查文件或直接粘贴大纲文本" });
					return;
				}
				writeJson(res, 200, {
					outline,
					bookName: createProject(outline).bookName,
					chars: outline.length,
					path
				});
			} catch (error) {
				writeJson(res, 400, { error: error.message });
			}
		}
	};
	const saveOutlineRoute = {
		kind: "exact",
		path: NOVEL_API.saveOutline,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const config = getConfig();
			const outline = body?.text ?? "";
			if (outline.trim().length < 50) {
				writeJson(res, 400, { error: "大纲内容过短（<50 字符）" });
				return;
			}
			let project = loadProject(config.outputDir);
			const now = (/* @__PURE__ */ new Date()).toISOString();
			if (project === void 0) project = createProject(outline);
			else {
				project.outline = outline;
				project.bookName = createProject(outline).bookName;
				project.updatedAt = now;
			}
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				bookName: project.bookName
			});
		}
	};
	const bibleRoute = {
		kind: "exact",
		path: NOVEL_API.bible,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const config = getConfig();
			const project = loadProject(config.outputDir);
			const outline = body?.outline?.trim() !== "" && body?.outline !== void 0 ? body.outline : project?.outline;
			if (outline === void 0 || outline.length < 50) {
				writeJson(res, 400, { error: "请先加载大纲" });
				return;
			}
			try {
				const bible = await extractBible(ctx, config, outline);
				const now = (/* @__PURE__ */ new Date()).toISOString();
				const next = project ?? createProject(outline);
				next.bible = bible;
				next.updatedAt = now;
				saveProject(config.outputDir, next);
				writeJson(res, 200, { bible });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const volumesRoute = {
		kind: "exact",
		path: NOVEL_API.volumes,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const config = getConfig();
			const project = loadProject(config.outputDir);
			const outline = body?.outline?.trim() !== "" && body?.outline !== void 0 ? body.outline : project?.outline;
			if (outline === void 0 || outline.length < 50) {
				writeJson(res, 400, { error: "请先加载大纲" });
				return;
			}
			try {
				const volumes = await planVolumes(ctx, config, outline);
				const now = (/* @__PURE__ */ new Date()).toISOString();
				const next = project ?? createProject(outline);
				next.volumes = volumes;
				next.updatedAt = now;
				saveProject(config.outputDir, next);
				writeJson(res, 200, { volumes });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const planRoute = {
		kind: "exact",
		path: NOVEL_API.plan,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			const config = getConfig();
			const project = loadProject(config.outputDir);
			const outline = body?.outline?.trim() !== "" && body?.outline !== void 0 ? body.outline : project?.outline;
			if (outline === void 0 || outline.length < 50) {
				writeJson(res, 400, { error: "请先加载大纲（或粘贴大纲文本）" });
				return;
			}
			const count = body?.chapterCount ?? DEFAULT_PLAN_COUNT;
			if (!Number.isInteger(count) || count < 1 || count > 200) {
				writeJson(res, 400, { error: "chapterCount 须为 1-200 的整数" });
				return;
			}
			try {
				const next = project ?? createProject(outline);
				const chapters = await planChapters(ctx, config, next, count, body?.volume, config.outputDir);
				mergeVolatileFromDisk(config.outputDir, next);
				next.chapters.push(...chapters);
				next.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, next);
				writeJson(res, 200, {
					chapters,
					volumes: next.volumes
				});
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const generateRoute = {
		kind: "exact",
		path: NOVEL_API.generate,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			const rawNo = body?.chapterNo;
			if (!Number.isInteger(rawNo) || rawNo === void 0 || rawNo < 1) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const no = rawNo;
			const chapter = project.chapters.find((c) => c.no === no);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${no} 不在计划中` });
				return;
			}
			if (chapter.status === "generating") {
				writeJson(res, 409, { error: `章节 ${no} 正在生成中` });
				return;
			}
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				"x-accel-buffering": "no",
				"referrer-policy": "no-referrer"
			});
			chapter.status = "generating";
			chapter.error = void 0;
			chapter.generatingAt = (/* @__PURE__ */ new Date()).toISOString();
			mergeVolatileFromDisk(config.outputDir, project);
			saveProject(config.outputDir, project);
			const send = (frame) => {
				res.write(JSON.stringify(frame) + "\n");
			};
			try {
				send({
					type: "start",
					no,
					title: chapter.title
				});
				for await (const step of generateChapterStream(ctx, config, project, config.outputDir, no)) if (step.frame === "delta") send({
					type: "delta",
					text: step.text
				});
				else if (step.frame === "done") send({
					type: "done",
					no,
					file: step.file,
					chars: step.chars,
					title: chapter.title
				});
				try {
					await summarizeAndExtractFacts(ctx, config, project, config.outputDir, no);
				} catch (error) {
					console.warn("[dsh-novel-forge] summary/facts failed:", error.message);
				}
				try {
					const marked = markForeshadowPlanted(project, config.outputDir, no);
					if (marked > 0) console.log(`[dsh-novel-forge] 第${no}章已埋伏笔 ${marked} 条`);
				} catch (error) {
					console.warn("[dsh-novel-forge] markForeshadowPlanted failed:", error.message);
				}
				if (!(body?.skipReview === true) && (config.autoReview ?? true)) send({
					type: "review",
					no,
					report: await reviewChapter(ctx, config, project, config.outputDir, no)
				});
				else {
					chapter.status = "approved";
					mergeVolatileFromDisk(config.outputDir, project);
					saveProject(config.outputDir, project);
				}
				if (config.autoAuthorReview ?? true) try {
					const currentBody = readChapterFile(config.outputDir, chapter);
					let prevTail = "";
					if (no > 1) {
						const prev = project.chapters.find((c) => c.no === no - 1);
						if (prev !== void 0) prevTail = (readChapterFile(config.outputDir, prev) ?? "").replace(/^#.*$/m, "").trim().slice(-600);
					}
					if (currentBody !== void 0) {
						const review = await authorReviewChapter(ctx, config, project, no, currentBody, prevTail);
						chapter.authorReview = review;
						if (review.advancedLines !== void 0) autoLinkPlotlines(project, no, review.advancedLines);
						mergeVolatileFromDisk(config.outputDir, project);
						saveProject(config.outputDir, project);
						send({
							type: "author-review",
							no,
							review
						});
					}
				} catch (error) {
					console.warn("[dsh-novel-forge] author review failed:", error.message);
				}
				res.end();
			} catch (error) {
				chapter.status = "error";
				chapter.error = error.message;
				mergeVolatileFromDisk(config.outputDir, project);
				saveProject(config.outputDir, project);
				if (!res.writableEnded) {
					send({
						type: "error",
						no,
						message: error.message
					});
					res.end();
				}
			}
		}
	};
	const reviewRoute = {
		kind: "exact",
		path: NOVEL_API.review,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const no = body.chapterNo;
			try {
				writeJson(res, 200, { report: await reviewChapter(ctx, config, project, config.outputDir, no) });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const rewriteRoute = {
		kind: "exact",
		path: NOVEL_API.rewrite,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const no = body.chapterNo;
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				"x-accel-buffering": "no",
				"referrer-policy": "no-referrer"
			});
			const send = (frame) => {
				res.write(JSON.stringify(frame) + "\n");
			};
			try {
				for await (const step of rewriteChapterStream(ctx, config, project, config.outputDir, no, body?.instructions ?? "", body?.target)) if (step.frame === "delta") send({
					type: "delta",
					text: step.text
				});
				else if (step.frame === "drafted") send({
					type: "drafted",
					no,
					chars: step.chars,
					draft: step.draft
				});
				res.end();
			} catch (error) {
				if (!res.writableEnded) {
					send({
						type: "error",
						no,
						message: error.message
					});
					res.end();
				}
			}
		}
	};
	const polishRoute = {
		kind: "exact",
		path: NOVEL_API.polish,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const no = body.chapterNo;
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				"x-accel-buffering": "no",
				"referrer-policy": "no-referrer"
			});
			const send = (frame) => {
				res.write(JSON.stringify(frame) + "\n");
			};
			try {
				for await (const step of polishChapterStream(ctx, config, project, config.outputDir, no)) if (step.frame === "delta") send({
					type: "delta",
					text: step.text
				});
				else if (step.frame === "drafted") send({
					type: "drafted",
					no,
					chars: step.chars,
					draft: step.draft
				});
				res.end();
			} catch (error) {
				if (!res.writableEnded) {
					send({
						type: "error",
						no,
						message: error.message
					});
					res.end();
				}
			}
		}
	};
	/** 采纳待确认草稿：覆盖正文文件 + 状态回 written + 清空草稿。 */
	const draftApplyRoute = {
		kind: "exact",
		path: NOVEL_API.draftApply,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === body.chapterNo);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${body.chapterNo} 不在计划中` });
				return;
			}
			if (chapter.pendingDraft === void 0 || chapter.pendingDraft === "") {
				writeJson(res, 400, { error: `章节 ${chapter.no} 没有待确认的草稿` });
				return;
			}
			const draft = chapter.pendingDraft;
			const fileName = chapterFileName(chapter);
			mkdirSync(config.outputDir, { recursive: true });
			const targetPath = join(config.outputDir, fileName);
			if (existsSync(targetPath)) copyFileSync(targetPath, join(config.outputDir, `${fileName.replace(/\.md$/, "")}.bak.md`));
			writeFileSync(targetPath, `# 第${chapter.no}章 ${chapter.title}\n\n${draft}\n`, "utf8");
			chapter.pendingDraft = void 0;
			chapter.chars = draft.length;
			chapter.file = fileName;
			const carried = body?.report;
			if (carried !== void 0 && typeof carried.score === "number") {
				chapter.review = carried;
				chapter.status = carried.passed ? "approved" : "rejected";
			} else {
				chapter.status = "written";
				chapter.review = void 0;
			}
			chapter.error = void 0;
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				chars: draft.length,
				file: fileName,
				markdown: draft
			});
		}
	};
	/** 放弃待确认草稿：保留原稿，仅清空草稿字段。 */
	const draftDiscardRoute = {
		kind: "exact",
		path: NOVEL_API.draftDiscard,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === body.chapterNo);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${body.chapterNo} 不在计划中` });
				return;
			}
			if (chapter.pendingDraft !== void 0) {
				chapter.pendingDraft = void 0;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
			}
			writeJson(res, 200, { ok: true });
		}
	};
	const summaryRoute = {
		kind: "exact",
		path: NOVEL_API.summary,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			try {
				writeJson(res, 200, { summary: await summarizeChapter(ctx, config, project, config.outputDir, body.chapterNo) });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const foreshadowRoute = {
		kind: "exact",
		path: NOVEL_API.foreshadow,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			try {
				if (body?.suggest === true) {
					const created = await suggestForeshadows(ctx, config, project);
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, { foreshadows: created });
					return;
				}
				if (body?.id !== void 0) {
					const target = project.foreshadows.find((f) => f.id === body.id);
					if (target === void 0) {
						writeJson(res, 404, { error: `伏笔 ${body.id} 不存在` });
						return;
					}
					if (body.description !== void 0) target.description = body.description;
					if (body.plantedChapter !== void 0) target.plantedChapter = body.plantedChapter;
					if (body.targetChapter !== void 0) target.targetChapter = body.targetChapter;
					if (body.status !== void 0) target.status = body.status;
					if (body.resolvedNote !== void 0) target.resolvedNote = body.resolvedNote;
				} else {
					const description = body?.description?.trim();
					if (description === void 0 || description === "") {
						writeJson(res, 400, { error: "description 必填" });
						return;
					}
					project.foreshadows.push({
						id: `fs-${Date.now().toString(36)}`,
						description,
						plantedChapter: body?.plantedChapter,
						targetChapter: body?.targetChapter,
						status: body?.status ?? "planned"
					});
				}
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { foreshadows: project.foreshadows });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const exportRoute = {
		kind: "exact",
		path: NOVEL_API.exportBook,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const format = (await readJsonBody(req))?.format === "md" ? "md" : "txt";
			try {
				writeJson(res, 200, { ...exportBook(config.outputDir, project, format) });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const chapterRoute = {
		kind: "exact",
		path: NOVEL_API.chapter,
		handler: async (req, res) => {
			if (!guard(req, res, "GET")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const url = new URL(req.url ?? "/", "http://localhost");
			const rawNo = Number(url.searchParams.get("no") ?? "0");
			if (!Number.isInteger(rawNo) || rawNo < 1) {
				writeJson(res, 400, { error: "no 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === rawNo);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${rawNo} 不在计划中` });
				return;
			}
			const markdown = readChapterFile(config.outputDir, chapter);
			if (markdown === void 0) {
				writeJson(res, 404, { error: `章节 ${rawNo} 尚未生成` });
				return;
			}
			writeJson(res, 200, {
				no: chapter.no,
				title: chapter.title,
				markdown
			});
		}
	};
	/** 审查手动编辑的正文（不落盘，返回审稿报告）。 */
	const chapterCheckRoute = {
		kind: "exact",
		path: NOVEL_API.chapterCheck,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			const text = body?.text?.trim() ?? "";
			if (text.length < 50) {
				writeJson(res, 400, { error: "正文过短（<50 字），请先编辑内容" });
				return;
			}
			try {
				writeJson(res, 200, { report: await reviewChapterText(ctx, config, project, text, body?.previousReport) });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 保存手动编辑的正文（自动备份 .bak，状态回 written）。 */
	const chapterSaveRoute = {
		kind: "exact",
		path: NOVEL_API.chapterSave,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (!Number.isInteger(body?.chapterNo)) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === body.chapterNo);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${body.chapterNo} 不在计划中` });
				return;
			}
			const text = body?.text?.trim() ?? "";
			if (text.length < 50) {
				writeJson(res, 400, { error: "正文过短（<50 字），未保存" });
				return;
			}
			const fileName = chapterFileName(chapter);
			mkdirSync(config.outputDir, { recursive: true });
			const targetPath = join(config.outputDir, fileName);
			if (existsSync(targetPath)) copyFileSync(targetPath, join(config.outputDir, `${fileName.replace(/\.md$/, "")}.bak.md`));
			writeFileSync(targetPath, `# 第${chapter.no}章 ${chapter.title}\n\n${text}\n`, "utf8");
			chapter.status = "written";
			chapter.chars = text.length;
			chapter.file = fileName;
			chapter.pendingDraft = void 0;
			let report;
			const carried = body?.report;
			if (carried !== void 0 && typeof carried.score === "number") {
				report = carried;
				chapter.review = report;
				chapter.status = report.passed ? "approved" : "rejected";
			} else report = await reviewChapter(ctx, config, project, config.outputDir, chapter.no);
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				chars: text.length,
				file: fileName,
				report
			});
		}
	};
	const assistantRoute = {
		kind: "exact",
		path: NOVEL_API.assistant,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const message = (await readJsonBody(req))?.message?.trim();
			if (message === void 0 || message === "") {
				writeJson(res, 400, { error: "消息不能为空" });
				return;
			}
			res.writeHead(200, {
				"content-type": "application/x-ndjson; charset=utf-8",
				"cache-control": "no-cache",
				"x-accel-buffering": "no",
				"referrer-policy": "no-referrer"
			});
			const send = (frame) => {
				res.write(JSON.stringify(frame) + "\n");
			};
			try {
				for await (const step of runAssistantTurn(ctx, config, project, config.outputDir, message)) if (step.frame === "delta") send({
					type: "delta",
					text: step.text
				});
				else if (step.frame === "tool") send({
					type: "tool",
					name: step.name,
					status: step.status,
					detail: step.detail
				});
				else if (step.frame === "toolDelta") send({
					type: "toolDelta",
					name: step.name,
					text: step.text
				});
				send({ type: "done" });
				res.end();
			} catch (error) {
				if (!res.writableEnded) {
					send({
						type: "error",
						message: error.message
					});
					res.end();
				}
			}
		}
	};
	const assistantHistoryRoute = {
		kind: "exact",
		path: NOVEL_API.assistantHistory,
		handler: (req, res) => {
			if (!guard(req, res, "GET")) return;
			writeJson(res, 200, { messages: loadAssistantHistory(getConfig().outputDir) });
		}
	};
	/** 清空助手对话记录。 */
	const assistantClearRoute = {
		kind: "exact",
		path: NOVEL_API.assistantClear,
		handler: (req, res) => {
			if (!guard(req, res, "POST")) return;
			clearAssistantHistory(getConfig().outputDir);
			writeJson(res, 200, { ok: true });
		}
	};
	const assetsRoute = {
		kind: "exact",
		path: NOVEL_API.assets,
		handler: async (req, res) => {
			if (req.method !== "GET" && req.method !== "POST") {
				writeJson(res, 405, { error: "method not allowed (expected GET or POST)" });
				return;
			}
			if (!isLoopbackRequest(req)) {
				writeJson(res, 403, { error: "forbidden: loopback-only" });
				return;
			}
			const config = getConfig();
			const project = loadProject(config.outputDir);
			const projectAssets = project?.assets ?? emptyProjectAssets();
			if (req.method === "POST") {
				const body = await readJsonBody(req);
				if (body === void 0) {
					writeJson(res, 400, { error: "无效的 JSON" });
					return;
				}
				if (project === void 0) {
					writeJson(res, 400, { error: "请先加载大纲创建项目" });
					return;
				}
				if (body.genre !== void 0) projectAssets.genre = body.genre;
				if (body.primaryProgression !== void 0) projectAssets.primaryProgression = body.primaryProgression;
				if (body.auxiliaryProgressions !== void 0) projectAssets.auxiliaryProgressions = body.auxiliaryProgressions;
				if (body.antiAiRules !== void 0) projectAssets.antiAiRules = body.antiAiRules;
				if (body.styleAssets !== void 0) projectAssets.styleAssets = body.styleAssets;
				projectAssets.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				project.assets = projectAssets;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
			}
			writeJson(res, 200, {
				projectAssets,
				genreLibrary: BUILTIN_GENRE_LIBRARY,
				antiAiLibrary: BUILTIN_ANTI_AI_RULES,
				styleTemplates: BUILTIN_STYLE_TEMPLATES,
				progressionLibrary: BUILTIN_PROGRESSION_MODES
			});
		}
	};
	const styleEngineRoute = {
		kind: "exact",
		path: NOVEL_API.styleEngine,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = loadProject(config.outputDir);
			const body = await readJsonBody(req);
			const sample = body?.sampleText?.trim();
			if (sample === void 0 || sample.length < 50) {
				writeJson(res, 400, { error: "样本文本过短（<50 字符），请粘贴一段能代表目标风格的文字" });
				return;
			}
			try {
				const rules = await extractStyleAsset(ctx, config, sample);
				const styleAsset = {
					name: (body?.name?.trim() !== "" && body?.name !== void 0 ? body.name : `风格资产 ${Date.now().toString(36)}`).slice(0, 40),
					...rules,
					sourceText: sample.slice(0, 3e3),
					createdAt: (/* @__PURE__ */ new Date()).toISOString()
				};
				if (project !== void 0) {
					project.assets ??= emptyProjectAssets();
					project.assets.styleAssets ??= [];
					project.assets.styleAssets.push(styleAsset);
					project.assets.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
				}
				writeJson(res, 200, { styleAsset });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	const bookshelfRoute = {
		kind: "exact",
		path: NOVEL_API.bookshelf,
		handler: async (req, res) => {
			if (req.method === "GET") {
				if (!isLoopbackRequest(req)) {
					writeJson(res, 403, { error: "forbidden: loopback-only" });
					return;
				}
				seedBookshelfFromOutputDir(getConfig().outputDir);
				writeJson(res, 200, bookshelfSnapshot(loadBookshelf()));
				return;
			}
			if (req.method === "POST") {
				if (!isLoopbackRequest(req)) {
					writeJson(res, 403, { error: "forbidden: loopback-only" });
					return;
				}
				const body = await readJsonBody(req);
				const bookName = body?.bookName?.trim();
				if (bookName === void 0 || bookName === "") {
					writeJson(res, 400, { error: "bookName 不能为空" });
					return;
				}
				const outputDir = body?.outputDir?.trim() !== "" && body?.outputDir !== void 0 ? body.outputDir : defaultOutputDirFor(bookName);
				const book = createBook(bookName, outputDir);
				const outline = body?.outline?.trim();
				if (outline !== void 0 && outline.length >= 50) {
					const project = createProject(outline);
					saveProject(outputDir, project);
					renameBook(book.id, project.bookName);
				}
				writeJson(res, 200, bookshelfSnapshot(loadBookshelf()));
				return;
			}
			writeJson(res, 405, { error: "method not allowed (expected GET or POST)" });
		}
	};
	/** 重置项目：清空设定/卷/章节计划/正文/伏笔/资产/事实库（可携带新大纲）。 */
	const resetRoute = {
		kind: "exact",
		path: NOVEL_API.reset,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = loadProject(config.outputDir);
			if (project === void 0) {
				writeJson(res, 400, { error: "输出目录中没有项目，无需重置" });
				return;
			}
			const outline = (await readJsonBody(req))?.outline?.trim();
			if (outline !== void 0 && outline.length >= 50) {
				project.outline = outline;
				project.bookName = createProject(outline).bookName;
			}
			project.bible = void 0;
			project.volumes = void 0;
			project.chapters = [];
			project.foreshadows = [];
			project.assets = emptyProjectAssets();
			project.facts = [];
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				bookName: project.bookName
			});
		}
	};
	const bookshelfActivateRoute = {
		kind: "exact",
		path: "/api/dsh-novel-forge/bookshelf/activate",
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body?.id === void 0 || body.id === "") {
				writeJson(res, 400, { error: "id 不能为空" });
				return;
			}
			if (activateBook(body.id) === void 0) {
				writeJson(res, 404, { error: `书 ${body.id} 不存在` });
				return;
			}
			writeJson(res, 200, bookshelfSnapshot(loadBookshelf()));
		}
	};
	const bookshelfRemoveRoute = {
		kind: "exact",
		path: "/api/dsh-novel-forge/bookshelf/remove",
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const body = await readJsonBody(req);
			if (body?.id === void 0 || body.id === "") {
				writeJson(res, 400, { error: "id 不能为空" });
				return;
			}
			if (!removeBook(body.id)) {
				writeJson(res, 404, { error: `书 ${body.id} 不存在` });
				return;
			}
			writeJson(res, 200, bookshelfSnapshot(loadBookshelf()));
		}
	};
	/** 全书一致性质检。 */
	const auditRoute = {
		kind: "exact",
		path: NOVEL_API.audit,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			try {
				writeJson(res, 200, {
					issues: await auditBook(ctx, config, project, config.outputDir),
					auditedChapters: project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating").length,
					auditedAt: (/* @__PURE__ */ new Date()).toISOString()
				});
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 角色卡刷新（出场统计精确化 + LLM 聚合状态）。 */
	const charactersRefreshRoute = {
		kind: "exact",
		path: NOVEL_API.charactersRefresh,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			try {
				const cards = await refreshCharacters(ctx, config, project, config.outputDir);
				project.roleStatus = cards;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { cards });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 事实库回填：对历史已生成章节批量抽取事实。 */
	const factsBackfillRoute = {
		kind: "exact",
		path: NOVEL_API.factsBackfill,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			try {
				writeJson(res, 200, {
					ok: true,
					filled: await backfillFacts(ctx, config, project, config.outputDir)
				});
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 设定圣经局部修补（世界观规则/红线/风格）。 */
	const biblePatchRoute = {
		kind: "exact",
		path: NOVEL_API.biblePatch,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			if (project.bible === void 0) {
				writeJson(res, 400, { error: "尚未生成道藏，请先生成" });
				return;
			}
			const body = await readJsonBody(req);
			if (Array.isArray(body?.worldRules)) project.bible.worldRules = body.worldRules.filter((r) => r.trim() !== "");
			if (Array.isArray(body?.redLines)) project.bible.redLines = body.redLines.filter((r) => r.trim() !== "");
			if (Array.isArray(body?.style)) project.bible.style = body.style.filter((r) => r.trim() !== "");
			if (Array.isArray(body?.characters)) project.bible.characters = body.characters.filter((c) => c !== void 0 && c !== null && typeof c.name === "string" && c.name.trim() !== "").map((c) => ({
				name: c.name.trim(),
				role: [
					"protagonist",
					"supporting",
					"antagonist",
					"other"
				].includes(c.role) ? c.role : "other",
				traits: Array.isArray(c.traits) ? c.traits.filter((t) => typeof t === "string" && t.trim() !== "") : [],
				goals: typeof c.goals === "string" ? c.goals : "",
				relations: typeof c.relations === "string" ? c.relations : "",
				knowledge: Array.isArray(c.knowledge) ? c.knowledge.filter((k) => typeof k === "string" && k.trim() !== "") : void 0
			}));
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, { bible: project.bible });
		}
	};
	/** 小说简介：AI 生成/补全，或手动保存。 */
	const blurbRoute = {
		kind: "exact",
		path: NOVEL_API.blurb,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			try {
				if (body?.action === "save") {
					const text = body.text?.trim() ?? "";
					project.blurb = text;
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, { blurb: text });
					return;
				}
				const partial = body?.partial?.trim() ?? "";
				const blurb = await generateBlurb(ctx, config, project, partial);
				project.blurb = blurb;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { blurb });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 封面：GET 读取（dataUrl）；POST 上传（base64）或移除。 */
	const coverRoute = {
		kind: "exact",
		path: NOVEL_API.cover,
		handler: async (req, res) => {
			const config = getConfig();
			if (req.method === "GET") {
				if (!isLoopbackRequest(req)) {
					writeJson(res, 403, { error: "forbidden: loopback-only" });
					return;
				}
				const dirParam = new URL(req.url ?? "/", "http://localhost").searchParams.get("dir");
				const targetDir = dirParam !== null && dirParam !== "" ? dirParam : config.outputDir;
				const coverPath = loadProject(targetDir)?.coverPath;
				if (coverPath === void 0 || coverPath === "") {
					writeJson(res, 200, { dataUrl: null });
					return;
				}
				const file = join(targetDir, coverPath);
				if (!existsSync(file)) {
					writeJson(res, 200, { dataUrl: null });
					return;
				}
				writeJson(res, 200, { dataUrl: `data:${coverPath.toLowerCase().endsWith(".png") ? "image/png" : coverPath.toLowerCase().endsWith(".jpg") || coverPath.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : coverPath.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png"};base64,${readFileSync(file).toString("base64")}` });
				return;
			}
			if (req.method === "POST") {
				if (!guard(req, res, "POST")) return;
				const project = requireProject(res);
				if (project === void 0) return;
				const body = await readJsonBody(req);
				try {
					if (body?.action === "remove") {
						if (project.coverPath !== void 0 && project.coverPath !== "") {
							const oldFile = join(config.outputDir, project.coverPath);
							if (existsSync(oldFile)) rmSync(oldFile, { force: true });
						}
						project.coverPath = void 0;
						project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
						saveProject(config.outputDir, project);
						writeJson(res, 200, {
							ok: true,
							coverPath: null
						});
						return;
					}
					const dataUrl = body?.dataUrl ?? "";
					const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/s.exec(dataUrl);
					if (match === null) {
						writeJson(res, 400, { error: "封面须为 PNG/JPEG/WebP 的 base64 data URL" });
						return;
					}
					const mime = match[1];
					const fileName = `cover.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
					const targetPath = join(config.outputDir, fileName);
					const oldPath = project.coverPath;
					mkdirSync(config.outputDir, { recursive: true });
					writeFileSync(targetPath, Buffer.from(match[2], "base64"));
					if (oldPath !== void 0 && oldPath !== "" && oldPath !== fileName) {
						const oldFile = join(config.outputDir, oldPath);
						if (existsSync(oldFile)) rmSync(oldFile, { force: true });
					}
					project.coverPath = fileName;
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, {
						ok: true,
						coverPath: fileName
					});
				} catch (error) {
					writeJson(res, 500, { error: error.message });
				}
				return;
			}
			writeJson(res, 405, { error: "method not allowed (expected GET or POST)" });
		}
	};
	/** 大世界：AI 提炼或手动保存（境界体系/区域/势力）。 */
	const worldRoute = {
		kind: "exact",
		path: NOVEL_API.world,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			try {
				if (body?.action === "save" && body.world !== void 0) {
					project.world = {
						realms: Array.isArray(body.world.realms) ? body.world.realms : [],
						regions: Array.isArray(body.world.regions) ? body.world.regions : [],
						factions: Array.isArray(body.world.factions) ? body.world.factions : []
					};
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, { world: project.world });
					return;
				}
				const world = await extractWorld(ctx, config, project);
				project.world = world;
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { world });
			} catch (error) {
				writeJson(res, 500, { error: error.message });
			}
		}
	};
	/** 重命名当前书：同步项目 bookName 与书架条目。 */
	const renameRoute = {
		kind: "exact",
		path: NOVEL_API.rename,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const bookName = (await readJsonBody(req))?.bookName?.trim();
			if (bookName === void 0 || bookName === "") {
				writeJson(res, 400, { error: "书名不能为空" });
				return;
			}
			project.bookName = bookName.slice(0, 60);
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			const store = loadBookshelf();
			if (store.activeBookId !== null) renameBook(store.activeBookId, project.bookName);
			writeJson(res, 200, { bookName: project.bookName });
		}
	};
	/** 剧情线管理：增删改 + 关联章节（主线/支线/人物线/悬念线）。 */
	const plotlinesRoute = {
		kind: "exact",
		path: NOVEL_API.plotlines,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (project.plotlines === void 0) project.plotlines = [];
			const op = body?.op;
			if (op === "add" && body?.line !== void 0) {
				const line = body.line;
				project.plotlines.push({
					id: line.id !== "" ? line.id : `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					name: line.name.slice(0, 40),
					kind: line.kind,
					goal: line.goal.slice(0, 300),
					progress: line.progress.slice(0, 300),
					status: line.status,
					chapters: Array.isArray(line.chapters) ? line.chapters.filter((n) => typeof n === "number") : [],
					createdAt: line.createdAt !== "" ? line.createdAt : (/* @__PURE__ */ new Date()).toISOString()
				});
			} else if (op === "update" && body?.line !== void 0 && body.line.id !== "") {
				const idx = project.plotlines.findIndex((l) => l.id === body.line.id);
				if (idx !== -1) {
					const line = body.line;
					project.plotlines[idx] = {
						...project.plotlines[idx],
						name: line.name.slice(0, 40),
						kind: line.kind,
						goal: line.goal.slice(0, 300),
						progress: line.progress.slice(0, 300),
						status: line.status
					};
				}
			} else if (op === "remove" && body?.id !== void 0) project.plotlines = project.plotlines.filter((l) => l.id !== body.id);
			else if (op === "link" && body?.id !== void 0 && typeof body.chapterNo === "number" && body.chapterNo > 0) {
				const line = project.plotlines.find((l) => l.id === body.id);
				if (line !== void 0 && !line.chapters.includes(body.chapterNo)) {
					line.chapters.push(body.chapterNo);
					if (line.status === "active" && line.progress === "") line.progress = `推进至第 ${body.chapterNo} 章`;
				}
			} else if (op === "suggest") try {
				const suggestions = await suggestPlotlines(ctx, config, project);
				writeJson(res, 200, {
					plotlines: project.plotlines,
					suggestions
				});
				return;
			} catch (error) {
				writeJson(res, 500, { error: `AI 建议失败：${error.message}` });
				return;
			}
			else if (op === "refresh" && body?.id !== void 0) {
				const line = project.plotlines.find((l) => l.id === body.id);
				if (line === void 0) {
					writeJson(res, 404, { error: "剧情线不存在" });
					return;
				}
				try {
					line.progress = await refreshPlotlineProgress(ctx, config, project, line);
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, { plotlines: project.plotlines });
					return;
				} catch (error) {
					writeJson(res, 500, { error: `刷新进度失败：${error.message}` });
					return;
				}
			} else if (op === "health") try {
				const health = await analyzePlotlineHealth(ctx, config, project);
				writeJson(res, 200, {
					plotlines: project.plotlines,
					health
				});
				return;
			} catch (error) {
				writeJson(res, 500, { error: `健康检查失败：${error.message}` });
				return;
			}
			else if (op === "plan") try {
				const health = await analyzePlotlineHealth(ctx, config, project);
				const plan = await designPlotlinePlan(ctx, config, project, health);
				writeJson(res, 200, {
					plotlines: project.plotlines,
					health,
					plan
				});
				return;
			} catch (error) {
				writeJson(res, 500, { error: `剧情方案生成失败：${error.message}` });
				return;
			}
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, { plotlines: project.plotlines });
		}
	};
	/** 敏感词检查：指定章节 / 任意文本 / 全书已写章节。 */
	const sensitiveRoute = {
		kind: "exact",
		path: NOVEL_API.sensitiveCheck,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			const hits = [];
			let scanned = 0;
			if (body?.text !== void 0) for (const hit of checkSensitiveText(body.text)) hits.push({
				chapterNo: 0,
				word: hit.word,
				category: hit.category,
				count: hit.count
			});
			else if (typeof body?.chapterNo === "number") {
				const chapter = project.chapters.find((c) => c.no === body.chapterNo);
				if (chapter !== void 0) {
					const text = readChapterFile(config.outputDir, chapter);
					if (text !== void 0) {
						scanned = 1;
						for (const hit of checkSensitiveText(text)) hits.push({
							chapterNo: chapter.no,
							word: hit.word,
							category: hit.category,
							count: hit.count
						});
					}
				}
			} else if (body?.all === true) for (const chapter of project.chapters) {
				if (chapter.status === "pending" || chapter.status === "generating") continue;
				const text = readChapterFile(config.outputDir, chapter);
				if (text === void 0) continue;
				scanned++;
				for (const hit of checkSensitiveText(text)) hits.push({
					chapterNo: chapter.no,
					word: hit.word,
					category: hit.category,
					count: hit.count
				});
			}
			else {
				writeJson(res, 400, { error: "请提供 chapterNo / text / all 之一" });
				return;
			}
			writeJson(res, 200, {
				hits,
				scannedChapters: scanned
			});
		}
	};
	/** 角色库：AI 提炼 / 采纳 / 更新 / 删除。 */
	const rolesRoute = {
		kind: "exact",
		path: NOVEL_API.roles,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const body = await readJsonBody(req);
			if (project.roles === void 0) project.roles = [];
			const op = body?.op;
			if (op === "extract") try {
				const candidates = await extractRoles(ctx, config, project);
				writeJson(res, 200, {
					roles: project.roles,
					candidates
				});
				return;
			} catch (error) {
				writeJson(res, 500, { error: `角色提炼失败：${error.message}` });
				return;
			}
			else if ((op === "adopt" || op === "update") && body?.role !== void 0) {
				const r = body.role;
				const idx = project.roles.findIndex((x) => x.name === r.name);
				if (idx === -1) project.roles.push(r);
				else project.roles[idx] = r;
			} else if (op === "remove" && body?.name !== void 0) project.roles = project.roles.filter((x) => x.name !== body.name);
			else if (op === "visual") {
				const name = body?.name?.trim();
				if (name === void 0 || name === "") {
					writeJson(res, 400, { error: "name（角色名）必填" });
					return;
				}
				try {
					const visual = await extractRoleVisual(ctx, config, project, config.outputDir, name);
					const role = project.roles.find((r) => r.name === name);
					if (role !== void 0) role.imagePrompt = visual;
					project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
					saveProject(config.outputDir, project);
					writeJson(res, 200, {
						roles: project.roles,
						visual
					});
					return;
				} catch (error) {
					writeJson(res, 500, { error: `形象提炼失败：${error.message}` });
					return;
				}
			} else {
				writeJson(res, 400, { error: "未知的 roles op" });
				return;
			}
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, { roles: project.roles });
		}
	};
	/** 章节复位：generating 卡死 → pending（可重新生成）。 */
	const chapterResetRoute = {
		kind: "exact",
		path: NOVEL_API.chapterReset,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const no = (await readJsonBody(req))?.chapterNo;
			if (!Number.isInteger(no) || no === void 0 || no < 1) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === no);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${no} 不在计划中` });
				return;
			}
			chapter.status = "pending";
			chapter.error = void 0;
			chapter.generatingAt = void 0;
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				no
			});
		}
	};
	/** 章节直接通过：作者行使最终决定权（不重审，保留审稿记录）。 */
	const chapterApproveRoute = {
		kind: "exact",
		path: NOVEL_API.chapterApprove,
		handler: async (req, res) => {
			if (!guard(req, res, "POST")) return;
			const config = getConfig();
			const project = requireProject(res);
			if (project === void 0) return;
			const no = (await readJsonBody(req))?.chapterNo;
			if (!Number.isInteger(no) || no === void 0 || no < 1) {
				writeJson(res, 400, { error: "chapterNo 须为正整数" });
				return;
			}
			const chapter = project.chapters.find((c) => c.no === no);
			if (chapter === void 0) {
				writeJson(res, 404, { error: `章节 ${no} 不在计划中` });
				return;
			}
			chapter.status = "approved";
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				no
			});
		}
	};
	return [
		statusRoute,
		loadOutlineRoute,
		saveOutlineRoute,
		bibleRoute,
		volumesRoute,
		planRoute,
		generateRoute,
		reviewRoute,
		rewriteRoute,
		polishRoute,
		draftApplyRoute,
		draftDiscardRoute,
		summaryRoute,
		foreshadowRoute,
		exportRoute,
		chapterRoute,
		chapterCheckRoute,
		chapterSaveRoute,
		assetsRoute,
		styleEngineRoute,
		assistantRoute,
		assistantHistoryRoute,
		assistantClearRoute,
		bookshelfRoute,
		bookshelfActivateRoute,
		bookshelfRemoveRoute,
		resetRoute,
		auditRoute,
		charactersRefreshRoute,
		factsBackfillRoute,
		biblePatchRoute,
		blurbRoute,
		coverRoute,
		worldRoute,
		renameRoute,
		plotlinesRoute,
		rolesRoute,
		sensitiveRoute,
		{
			kind: "exact",
			path: NOVEL_API.reviewBackfill,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const config = getConfig();
				const project = requireProject(res);
				if (project === void 0) return;
				const body = await readJsonBody(req);
				/** 对一章执行作者复盘（读取已落盘正文，不改变章节状态/正文）。 */
				const runOne = async (chapter) => {
					const currentBody = readChapterFile(config.outputDir, chapter);
					if (currentBody === void 0) throw new Error(`章节 ${chapter.no} 的正文文件不存在`);
					let prevTail = "";
					if (chapter.no > 1) {
						const prev = project.chapters.find((c) => c.no === chapter.no - 1);
						if (prev !== void 0) prevTail = (readChapterFile(config.outputDir, prev) ?? "").replace(/^#.*$/m, "").trim().slice(-600);
					}
					return authorReviewChapter(ctx, config, project, chapter.no, currentBody, prevTail);
				};
				if (typeof body?.chapterNo === "number" && body.chapterNo > 0) {
					const chapter = project.chapters.find((c) => c.no === body.chapterNo);
					if (chapter === void 0) {
						writeJson(res, 404, { error: `章节 ${body.chapterNo} 不在计划中` });
						return;
					}
					if (chapter.status === "pending") {
						writeJson(res, 400, { error: "该章尚未生成正文，无法复盘" });
						return;
					}
					try {
						const review = await runOne(chapter);
						chapter.authorReview = review;
						if (review.advancedLines !== void 0) autoLinkPlotlines(project, chapter.no, review.advancedLines);
						project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
						saveProject(config.outputDir, project);
						writeJson(res, 200, {
							no: chapter.no,
							review
						});
						return;
					} catch (error) {
						writeJson(res, 500, { error: error.message });
						return;
					}
				}
				const missing = project.chapters.filter((c) => c.status !== "pending" && c.status !== "generating" && c.authorReview === void 0);
				if (missing.length === 0) {
					writeJson(res, 200, { count: 0 });
					return;
				}
				res.writeHead(200, {
					"content-type": "application/x-ndjson; charset=utf-8",
					"cache-control": "no-cache",
					"referrer-policy": "no-referrer"
				});
				const send = (frame) => {
					res.write(JSON.stringify(frame) + "\n");
				};
				let done = 0;
				for (const chapter of missing) try {
					const review = await runOne(chapter);
					chapter.authorReview = review;
					if (review.advancedLines !== void 0) autoLinkPlotlines(project, chapter.no, review.advancedLines);
					done++;
					saveProject(config.outputDir, project);
					send({
						type: "author-review",
						no: chapter.no,
						review
					});
				} catch (error) {
					console.warn(`[dsh-novel-forge] author backfill ch.${chapter.no} failed:`, error.message);
				}
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				send({
					type: "author-backfill-done",
					count: done
				});
				res.end();
			}
		},
		chapterResetRoute,
		chapterApproveRoute,
		{
			kind: "exact",
			path: NOVEL_API.config,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const body = await readJsonBody(req);
				if (body === void 0) {
					writeJson(res, 400, { error: "无效的配置 JSON" });
					return;
				}
				try {
					writeJson(res, 200, { config: await patchConfig(body) });
				} catch (error) {
					writeJson(res, 400, { error: error.message });
				}
			}
		},
		{
			kind: "exact",
			path: NOVEL_API.openFolder,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const dir = getConfig().outputDir;
				exec(`explorer "${dir.replace(/"/g, "")}"`, (error) => {
					if (error) writeJson(res, 500, {
						ok: false,
						error: error.message
					});
					else writeJson(res, 200, { ok: true });
				});
			}
		},
		{
			kind: "exact",
			path: NOVEL_API.outlineSuggest,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const config = getConfig();
				const body = await readJsonBody(req);
				const idea = body?.idea?.trim() ?? "";
				if (idea.length < 50) {
					writeJson(res, 400, { error: "想法太短（<50 字），请多写一两句：主角是谁、什么世界、想要什么爽点" });
					return;
				}
				const count = body?.count !== void 0 ? Math.max(1, Math.min(3, Math.floor(body.count))) : 3;
				const exclude = Array.isArray(body?.exclude) ? body.exclude.filter((e) => typeof e === "string" && e.trim() !== "").map((e) => e.trim().slice(0, 200)) : [];
				try {
					writeJson(res, 200, { candidates: await suggestOutlines(ctx, config, idea, count, exclude) });
				} catch (error) {
					writeJson(res, 500, { error: `大纲方案生成失败：${error.message}` });
				}
			}
		},
		{
			kind: "exact",
			path: NOVEL_API.breakdown,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const config = getConfig();
				const project = requireProject(res);
				if (project === void 0) return;
				const body = await readJsonBody(req);
				try {
					writeJson(res, 200, await breakdownBook(ctx, config, project, config.outputDir, body?.scope ?? "recent", body?.preset ?? "quick", body?.budgetTokens ?? 5e4));
				} catch (error) {
					writeJson(res, 500, { error: `拆书分析失败：${error.message}` });
				}
			}
		},
		{
			kind: "exact",
			path: NOVEL_API.storyboard,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const config = getConfig();
				const project = requireProject(res);
				if (project === void 0) return;
				const body = await readJsonBody(req);
				if (!Number.isInteger(body?.chapterNo)) {
					writeJson(res, 400, { error: "chapterNo 须为正整数" });
					return;
				}
				try {
					writeJson(res, 200, await generateStoryboard(ctx, config, project, config.outputDir, body.chapterNo, body?.genre ?? "", body?.platform ?? "抖音", body?.tool ?? "doubao"));
				} catch (error) {
					writeJson(res, 500, { error: `分镜生成失败：${error.message}` });
				}
			}
		},
		{
			kind: "exact",
			path: NOVEL_API.storyboardPlan,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const config = getConfig();
				const project = requireProject(res);
				if (project === void 0) return;
				const body = await readJsonBody(req);
				if (!Number.isInteger(body?.volumeNo) || (body?.volumeNo ?? 0) < 1) {
					writeJson(res, 400, { error: "volumeNo 须为正整数" });
					return;
				}
				try {
					writeJson(res, 200, await planStoryboardEpisodes(ctx, config, project, body.volumeNo, body?.platform ?? "抖音", body?.maxEpisodes ?? 25));
				} catch (error) {
					writeJson(res, 500, { error: `分集计划生成失败：${error.message}` });
				}
			}
		}
	];
}
//#endregion
//#region src/index.ts
/** Stable cordis plugin name. */
const name = "novel-forge";
/** Services required before the novel-forge surfaces can mount. */
const inject = [
	"webServer",
	"llm",
	"systemPrompt"
];
/**
* Settings namespace of the novel-forge capability — the section the web
* settings surface edits. Spelled here rather than imported: the browser half
* spells the same value and must not depend on a Host package.
*/
const NOVEL_SETTINGS_NAMESPACE = settingsNamespace("dsh-novel-forge");
const Config = z.object({
	announceToAgent: z.boolean().default(true),
	enabled: z.boolean().default(true),
	outlinePath: z.string().default("C:\\Users\\Ryan\\Desktop\\《示例书》全书大纲_重新排版版.docx"),
	outputDir: z.string().default("C:\\Users\\Ryan\\Desktop\\示例书"),
	provider: z.string().default("deepseek-official"),
	model: z.string().default("deepseek-v4-flash"),
	chapterChars: z.number().default(3500),
	maxTokens: z.number().default(12e3),
	reviewPassScore: z.number().default(70),
	autoReview: z.boolean().default(true),
	autoAuthorReview: z.boolean().default(true),
	autoReviewAfterRevise: z.boolean().default(true)
});
/** Schema defaults, re-read for hand-built test contexts. */
const DEFAULT_ANNOUNCE = true;
const DEFAULT_OUTLINE_PATH = "C:\\Users\\Ryan\\Desktop\\《示例书》全书大纲_重新排版版.docx";
const DEFAULT_OUTPUT_DIR = "C:\\Users\\Ryan\\Desktop\\示例书";
const DEFAULT_PROVIDER = "deepseek-official";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_CHAPTER_CHARS = 3500;
const DEFAULT_MAX_TOKENS = 12e3;
const DEFAULT_REVIEW_PASS_SCORE = 70;
const DEFAULT_AUTO_REVIEW = true;
const DEFAULT_AUTO_AUTHOR_REVIEW = true;
const DEFAULT_AUTO_REVIEW_AFTER_REVISE = true;
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 160;
/** Model-facing announcement: plugin presence, capabilities, and limits. */
const NOVEL_GUIDANCE = "本机已安装 dsh-novel-forge 插件（AI 编译小说工作台）：侧边栏「小说工坊」入口。能力：读取 docx 大纲（默认桌面《示例书》大纲）或粘贴大纲文本；用 LLM 提炼道藏（人设/世界观/金手指规则/写作红线，即设定圣经）；生成卷计划与章节计划；逐章调用 LLM 生成 3000-4000 字正文并保存为 Markdown（默认输出到 桌面\\示例书）；每章自动生成摘要（叙事记忆）、自动 AI 审稿（人设/设定/红线/文笔/爽点/逻辑），支持按审稿意见重写、去 AI 味润色、暗线（伏笔）管理、批量连写与全本导出（txt/md）。限制：生成消耗 LLM API 额度；输出目录与模型可在插件设置中修改；章节正文质量取决于大纲完整度。用户提到「小说 / 大纲 / 写小说 / 章节 / 审稿 / 润色 / 示例书」时即指本插件，请据此协作。";
/** Resolve a config-like value into the full runtime config. */
function resolveConfig(value) {
	return {
		outlinePath: value?.outlinePath ?? DEFAULT_OUTLINE_PATH,
		outputDir: value?.outputDir ?? DEFAULT_OUTPUT_DIR,
		provider: value?.provider ?? DEFAULT_PROVIDER,
		model: value?.model ?? DEFAULT_MODEL,
		chapterChars: value?.chapterChars ?? DEFAULT_CHAPTER_CHARS,
		maxTokens: value?.maxTokens ?? DEFAULT_MAX_TOKENS,
		reviewPassScore: value?.reviewPassScore ?? DEFAULT_REVIEW_PASS_SCORE,
		autoReview: value?.autoReview ?? DEFAULT_AUTO_REVIEW,
		autoAuthorReview: value?.autoAuthorReview ?? DEFAULT_AUTO_AUTHOR_REVIEW,
		autoReviewAfterRevise: value?.autoReviewAfterRevise ?? DEFAULT_AUTO_REVIEW_AFTER_REVISE
	};
}
/**
* Mount the routes and announcement.
* @param ctx - host plugin context carrying webServer/llm/systemPrompt.
* @param config - resolved plugin config (schema defaults applied by the loader).
*/
function apply(ctx, config) {
	let current = () => config ?? {};
	const resolve = () => {
		const resolved = resolveConfig(current());
		const shelfDir = activeBookOutputDir();
		if (shelfDir !== void 0) return {
			...resolved,
			outputDir: shelfDir
		};
		return resolved;
	};
	const patchConfig = async (patch) => {
		const next = {};
		if (patch.outlinePath !== void 0) next.outlinePath = patch.outlinePath;
		if (patch.outputDir !== void 0) next.outputDir = patch.outputDir;
		if (patch.provider !== void 0) next.provider = patch.provider;
		if (patch.model !== void 0) next.model = patch.model;
		if (patch.chapterChars !== void 0) next.chapterChars = patch.chapterChars;
		if (patch.maxTokens !== void 0) next.maxTokens = patch.maxTokens;
		if (patch.reviewPassScore !== void 0) next.reviewPassScore = patch.reviewPassScore;
		if (patch.autoReview !== void 0) next.autoReview = patch.autoReview;
		if (patch.autoAuthorReview !== void 0) next.autoAuthorReview = patch.autoAuthorReview;
		if (patch.autoReviewAfterRevise !== void 0) next.autoReviewAfterRevise = patch.autoReviewAfterRevise;
		const settings = ctx.get("settings");
		if (settings !== void 0) await settings.update(NOVEL_SETTINGS_NAMESPACE, next);
		else current = () => ({
			...current(),
			...next
		});
		return resolve();
	};
	let disposeSection;
	let disposeRoutes;
	const sync = () => {
		if (disposeSection !== void 0) {
			disposeSection();
			disposeSection = void 0;
		}
		if (disposeRoutes !== void 0) {
			disposeRoutes();
			disposeRoutes = void 0;
		}
		resolve();
		if (!(current().enabled ?? true)) return;
		if (current().announceToAgent ?? DEFAULT_ANNOUNCE) disposeSection = ctx.systemPrompt.section({
			name: "plugin:dsh-novel-forge",
			order: SECTION_ORDER,
			text: NOVEL_GUIDANCE
		});
		const routes = makeRoutes({
			ctx,
			getConfig: resolve,
			patchConfig
		});
		disposeRoutes = ctx.effect(() => {
			const disposers = routes.map((route) => ctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "dsh-novel-forge: routes");
	};
	installSettingsSection(ctx, NOVEL_SETTINGS_NAMESPACE, Config, config ?? {}, {
		setSource: (source) => {
			current = source;
			sync();
		},
		onChange: sync
	});
	const skillsService = ctx.get("skills");
	if (skillsService?.register !== void 0) {
		const disposeSkill = skillsService.register({
			name: "novel-forge-chapter-batch",
			description: "批量生成小说章节并值守处理审稿未过的章节（豁免/按意见修订/验证模式/重新生成），依赖 dsh-novel-forge 的 /api/dsh-novel-forge/* 路由。",
			content: [
				"# 小说章节批量生产与值守处理",
				"",
				"## 0. 值守纪律（最高优先级，违反即空转）",
				"1. 启动后台任务后立即停下，不轮询、不连续 wait、不做无意义动作——后台任务完成时运行时自动通知。",
				"2. 只有收到「任务完成」通知或用户新消息时，才继续下一步（读结果→处理未过→汇报）。",
				"3. 等待期间可做与当前任务无关的其他有用工作，但不得为等任务而空转。",
				"4. 任务因 web 重启中断时：待 3080 恢复后，复位卡死章节（generating/error → reset）再续跑，并向用户说明中断原因。",
				"",
				"## 1. 前置检查",
				"1. `GET /api/dsh-novel-forge/status` 确认服务在跑，读项目章节数。",
				"2. 列出目标区间 pending 章节号，避免重复生成已处理章节。",
				"3. **串行执行，禁止并行写 project.json**（并发会互相覆盖状态，实测教训）。",
				"",
				"## 2. 批量生成",
				"逐章串行调用 `POST /generate` `{ chapterNo, skipReview: false }`（走完整质量门：生成→摘要+编年录→审稿→复盘）。",
				"响应为 NDJSON，找 review 帧取 score/passed。每章 2-5 分钟；失败重试 1 次；后台跑并告知预计时长。",
				"用 Node 脚本（fetch 逐章循环），避免 PowerShell 转义坑，用完删除。",
				"",
				"## 3. 未过章节分级处理",
				"### A. 无 high → 豁免通过：`POST /chapter/approve`（主观项不磨）",
				"### B. 有 high 且明确 → 按意见修订 + 验证模式：",
				"1. 拼指令 `按审稿意见修订（优先处理）：\n[severity] item → suggestion`（high 优先，无 high 取前 3 medium）",
				"2. `POST /rewrite` 产草稿；3. `POST /chapter/check` 带 `previousReport` 走验证模式（只核对原意见解决+只挑新增 high）",
				"4. 判定 `passed || 无 high` 可接受；5. `POST /draft/apply` 带 passed 报告落盘 approved",
				"6. 不可接受 → 第二轮修订（指令更精确）→ 再验证；每章最多修 2 轮，仍不过保留草稿待人工",
				"### C. 结构性 high（修订改不好）→ `POST /draft/discard` 后 `POST /generate` 重写，剩主观项再走 A",
				"### D. error 状态 → `POST /chapter/reset` 后 `POST /generate`",
				"注意：approved 但 review 有 high 的保留不动；修订指令越精确越有效（具体数字/行为一次就过）。",
				"",
				"## 4. 收尾",
				"`GET /status` 验证目标区间全 approved；可选刷新剧情线（`POST /plotlines` op=refresh，注意只读最近 8 章摘要）；汇报通过/未过/失败与遗留项。",
				"",
				"## 5. 已知陷阱",
				"- 并发写 project.json 互相覆盖 → 必须串行",
				"- rewrite 草稿可能偶发不落盘 → 应用前检查 pendingDraft，不存在则重跑",
				"- PowerShell 调 API 引号/中文转义是坑 → 用 Node 脚本",
				"- 验证模式 500 偶发 → 重试一次"
			].join("\n")
		});
		ctx.effect(() => disposeSkill, "dsh-novel-forge: skill");
	}
	sync();
}
//#endregion
export { Config, NOVEL_GUIDANCE, NOVEL_SETTINGS_NAMESPACE, apply, inject, name, resolveConfig };

//# sourceMappingURL=index.js.map