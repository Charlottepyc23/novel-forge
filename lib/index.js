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
		return JSON.parse(attempt);
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
		relations: typeof entry.relations === "string" ? entry.relations : ""
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
			}
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
async function planChapters(ctx, config, project, chapterCount, volumeNo) {
	const volume = project.volumes?.find((v) => v.no === volumeNo);
	const user = [
		"请为下面这部小说规划章节。",
		volume !== void 0 ? `本次只规划第 ${volume.no} 卷《${volume.title}》的章节：\n${volume.summary}` : "请规划全书开篇章节。",
		`大纲如下：\n${project.outline}`,
		"",
		`请规划 ${chapterCount} 章。输出 JSON 数组（不要输出其他文字）：`
	].join("\n");
	const parsed = parseJsonArray(await complete(ctx, config, {
		system: planSystemPrompt(project.volumes),
		user,
		temperature: .7,
		maxTokens: Math.max(config.maxTokens, 2e4)
	}));
	const chapters = [];
	const existing = new Set(project.chapters.map((c) => c.no));
	const startNo = project.chapters.length + 1;
	for (let i = 0; i < Math.min(parsed.length, chapterCount); i++) {
		const item = parsed[i];
		if (typeof item !== "object" || item === null) continue;
		const entry = item;
		const title = typeof entry.title === "string" ? entry.title.trim().slice(0, 30) : "";
		const beats = typeof entry.beats === "string" ? entry.beats.trim() : "";
		if (title === "" && beats === "") continue;
		const no = startNo + i;
		if (existing.has(no)) continue;
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
			for (const card of bible.characters) sections.push(`- ${card.name}（${card.role}）：${card.traits.join("、")}`);
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
async function reviewChapterText(ctx, config, project, text) {
	const user = [
		`书名：《${project.bookName}》`,
		"==================== 待审查正文 ====================",
		text.slice(0, 2e4)
	].join("\n");
	const raw = parseJsonObject(await complete(ctx, config, {
		system: reviewSystemPrompt(project),
		user,
		temperature: .3,
		maxTokens: Math.max(config.maxTokens, 8e3)
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
	return {
		score,
		passed: score >= config.reviewPassScore,
		verdict: typeof raw.verdict === "string" ? raw.verdict.slice(0, 200) : "",
		issues,
		reviewedAt: (/* @__PURE__ */ new Date()).toISOString()
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
	const beatsText = chapter.beats;
	const relatedFacts = allFacts.slice(-120).filter((f) => {
		const head = f.text.slice(0, 24);
		for (let i = 0; i + 3 <= head.length; i++) {
			const tri = head.slice(i, i + 3);
			if (tri.trim() !== "" && beatsText.includes(tri)) return true;
		}
		return false;
	}).slice(-15).map((f) => `[第${f.chapterNo}章] ${f.text}`);
	const messages = [createUserMessage({
		content: [{
			type: "text",
			text: [
				`现在写第 ${chapter.no} 章，标题《${chapter.title}》。`,
				`本章剧情要点：${chapter.beats}`,
				"",
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
	const roster = project.bible?.characters ?? [];
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
	sections.push(`大纲节选（如需全文用 outline_text 工具）：\n${project.outline.slice(0, 2500)}`);
	const assetNames = [];
	if (project.assets?.genre !== void 0) assetNames.push(`题材：${project.assets.genre.name}`);
	if (project.assets?.primaryProgression !== void 0) assetNames.push(`主推进：${project.assets.primaryProgression.name}`);
	if ((project.assets?.styleAssets?.length ?? 0) > 0) assetNames.push(`写法：${project.assets.styleAssets.map((s) => s.name).join("、")}`);
	if ((project.assets?.antiAiRules?.length ?? 0) > 0) assetNames.push(`文戒自定义：${project.assets.antiAiRules.map((r) => r.name).join("、")}`);
	if (assetNames.length > 0) sections.push(`【写作资产】${assetNames.join(" · ")}`);
	if (project.bible !== void 0) {
		const bible = project.bible;
		sections.push("【设定圣经】");
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
		sections.push("【伏笔】");
		for (const f of project.foreshadows) sections.push(`- [${f.status}] ${f.description}${f.targetChapter !== void 0 ? `（预计 ${f.targetChapter} 章回收）` : ""}`);
	}
	if ((project.facts ?? []).length > 0) {
		sections.push("【已确立事实库（最近 40 条，回答设定问题必须遵守）】");
		for (const f of (project.facts ?? []).slice(-40)) sections.push(`- [第${f.chapterNo}章] ${f.text}`);
	}
	if (project.blurb !== void 0 && project.blurb !== "") sections.push(`【小说简介】${project.blurb}`);
	return sections.join("\n");
}
/** The assistant system prompt. */
function assistantSystemPrompt(project) {
	return [
		"你是「编辑老师」——服务这本书作者的资深中文网文编辑。",
		"人设：二十年网文老编辑，懂套路、懂市场、懂节奏，说话直接但句句有用。",
		"座右铭：「书是你的，但坑我替你盯着。」",
		"职责边界：陪作者讨论剧情/人设/世界观/爽点节奏并落地修改、维护全书一致性；不闲聊、不彩虹屁、不无意义长篇大论。",
		"==================== 当前项目快照 ====================",
		renderProjectSnapshot(project),
		"==================== 快照结束 ====================",
		"",
		"工作规则（严格遵守）：",
		"1. 全量知情：回答和修改必须基于项目真实数据，禁止编造书中不存在的设定。需要完整信息时，先调用 book_overview 获取全书上下文（大纲全文/设定圣经/大世界/事实库/全部章节要点/伏笔/简介）；需要某章正文用 chapter_text。",
		"2. 修改流程：改前用一句话说明意图 → 执行工具 → 改后简要汇报。",
		"3. 连锁维护：改动可能波及其它位置（其它章节、设定、事实库、简介）时，执行后主动调用 impact_analysis 分析影响面，并把「必须同步」的项一并处理或明确提示作者逐项确认。",
		"4. 删除红线：删除章节、清空设定等破坏性操作必须等作者明确同意。",
		"5. 品质门槛：建议必须具体——指出问题在哪一章、哪一段、哪一句，并给出可落地的改法；禁止\"建议增强冲突\"这类空话。",
		"6. 设定忠诚：忠于大纲、设定圣经、大世界、事实库；发现书中已有内容与设定冲突时，主动指出并给修正方案。",
		"7. 中文回复，简洁有干货。",
		"",
		"可用工具：",
		"- book_overview：{\"scope\": \"recent|full|volume:2\"(可选，默认 recent)}。返回全书上下文包（大纲/道藏/大世界/章节要点/事实库/伏笔/简介）。recent=最近30章；full=全部章节（书很长时慎用）；volume:N=只看第N卷。",
		"- facts_query：{\"keyword\": \"关键词\"}。从编年录（事实库）按关键词检索相关事实（如灵石、境界名、人物名）。",
		"- impact_analysis：{\"change\": \"要做的修改描述\"}。分析这次改动会波及哪些位置，返回影响清单（定位到章节/设定/事实库）。",
		"- outline_text：无参数。返回当前大纲全文。",
		"- outline_replace：{\"old\": \"要替换的原文片段\", \"new\": \"新文本\"}。在大纲中替换一段文字（old 必须能在大纲中找到）。",
		"- bible_set_rule：{\"index\": 序号(0起), \"text\": \"新规则文本\"} 或 {\"append\": \"追加的规则\"}。修改设定圣经的世界规则。",
		"- bible_set_redline：同上，修改写作红线。",
		"- chapter_text：{\"no\": 章节号}。返回该章正文。",
		"- chapter_rewrite：{\"no\": 章节号, \"instructions\": \"修改要求\", \"target\": \"原文片段(可选，留空整章)\"}。按讨论结果修订章节；给了 target 只改该自然段。",
		"- chapter_generate：{\"no\": 章节号}。重新生成该章。",
		"- chapter_review：{\"no\": 章节号}。对该章执行 AI 审稿。",
		"- foreshadow_add：{\"description\": \"伏笔描述\", \"targetChapter\": 预计回收章(可选)}。新增伏笔。",
		"- foreshadow_update：{\"id\": \"伏笔id\", \"status\": \"planned|planted|progressing|resolved|abandoned\"}。更新伏笔状态。",
		"- export_txt：无参数。导出全本 TXT。",
		"- assets_status：无参数。查看本书当前写作资产（题材/推进模式/反AI规则/写法）。",
		"- assets_set_genre：{\"name\": \"题材名\", \"description\": \"题材说明(可选)\"}。设置本书题材基底。",
		"- assets_set_progression：{\"name\": \"模式名\", \"driver\": \"驱动力\", \"primary\": true/false}。设置主/辅助推进模式。",
		"- assets_add_rule：{\"name\": \"规则名(可选)\", \"avoid\": \"要避免的表达问题\", \"fix\": \"修正方向(可选)}。新增反 AI 规则。",
		"",
		"回答质量要求（非常重要）：",
		"- 具体：回答必须引用项目里的真实内容（人名、境界、章节、伏笔、设定），禁止空泛套话。快照里没有的信息，先调用工具获取（chapter_text / outline_text）再回答。",
		"- 专业：给建议时说明理由，指出问题所在章节/段落，给出可直接落地的修改方案（改什么、怎么改）。",
		"- 主动：作者说\"改一下\"，主动调用对应工具执行，不要只给建议不动手；执行前用一句话说明意图，执行后简短汇报结果。",
		"- 忠于设定：以大纲、设定圣经、事实库为准，不得自相矛盾；发现问题（如剧情与设定冲突）主动指出。",
		"- 中文回复；文字量适中，别啰嗦。",
		"",
		"使用规则（非常重要）：",
		"- 当你想执行任何工具时，你的【整个回复】必须只包含动作指令标签，格式如下（不要有任何解释文字、不要用自然语言说\"我要去改\"，直接输出标签）：",
		"  正确示例：<dsh-action name=\"outline_replace\">{\"old\":\"要替换的原文\",\"new\":\"新文本\"}</dsh-action>",
		"  正确示例：<dsh-action name=\"chapter_text\">{\"no\":1}</dsh-action>",
		"  错误示例（绝对不要这样回复）：\"好的，我先看一下大纲，马上改。\" ← 这只是文字，不会执行任何操作",
		"- 工具调用是自动的：你输出标签后，宿主会执行并把结果反馈给你，你再基于结果继续。",
		"- 每次回复最多调用 1 个动作；执行结果会反馈给你，你可以继续讨论或再调用。",
		"- 需要先看大纲/章节再决定怎么改？那就先输出一个 outline_text / chapter_text 的标签，等结果回来。",
		"- chapter_rewrite 的 target 参数：从章节正文中复制一小段（一句话或几句话即可），不要带换行、不要带引号，取连续文本片段。",
		"- 如果工具执行失败（例如片段未找到），根据错误信息修正参数后自动重试一次，不要直接放弃或让作者手动操作。",
		"- 修改前先向作者说明你要改什么、为什么；动作执行后简要汇报结果。",
		"- 涉及删除类操作（删除章节、清空设定）必须等作者明确同意。",
		"- 严格忠于设定圣经与大纲；不得自行发明与既有设定冲突的内容。",
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
			if (old === "" || !project.outline.includes(old)) throw new Error(`大纲中未找到片段「${old.slice(0, 40)}…」`);
			project.outline = project.outline.replace(old, next);
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(outputDir, project);
			return `大纲已修改：替换了 ${old.length} 字符的片段。`;
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
			return `已新增伏笔：「${description.slice(0, 50)}」`;
		}
		case "foreshadow_update": {
			const id = str(args.id);
			const status = str(args.status);
			const target = project.foreshadows.find((f) => f.id === id);
			if (target === void 0) throw new Error(`伏笔 ${id} 不存在`);
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
			return `伏笔已更新为 ${status}：「${target.description.slice(0, 50)}」`;
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
	const recent = history.slice(-24);
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
	/** Whether we already nudged the model to emit an action tag (avoid loops). */
	let nudged = false;
	for (;;) {
		const reply = await chatOnce(ctx, config, system, history);
		const action = extractAction(reply);
		if (action === void 0) {
			const intendsAction = /(改|修改|修订|重写|替换|调整|生成|新增|删除|导出|看看|查看|调出|读一下|加上|加一个|去掉|删掉|把.+改成)/.test(reply);
			const strayTag = /<[a-z_-]*action[^>]*>/.test(reply);
			if ((intendsAction || strayTag) && !nudged) {
				nudged = true;
				const nudge = "你的上一条回复表达了想操作项目的意图（或动作标签格式有误），因此没有执行任何操作。请直接输出动作标签来执行，格式必须为 <dsh-action name=\"工具名\">{\"参数\":值}</dsh-action>（注意拼写是 dsh-action，不是 dash-action；标签成对出现，参数为合法 JSON）。如果需要先看内容，先输出 outline_text 或 chapter_text 标签。";
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
				const chapters = await planChapters(ctx, config, next, count, body?.volume);
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
				if (!(body?.skipReview === true) && (config.autoReview ?? true)) send({
					type: "review",
					no,
					report: await reviewChapter(ctx, config, project, config.outputDir, no)
				});
				else {
					chapter.status = "approved";
					saveProject(config.outputDir, project);
				}
				res.end();
			} catch (error) {
				chapter.status = "error";
				chapter.error = error.message;
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
			chapter.status = "written";
			chapter.chars = draft.length;
			chapter.file = fileName;
			chapter.review = void 0;
			chapter.error = void 0;
			project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
			saveProject(config.outputDir, project);
			writeJson(res, 200, {
				ok: true,
				chars: draft.length,
				file: fileName
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
			const text = (await readJsonBody(req))?.text?.trim() ?? "";
			if (text.length < 50) {
				writeJson(res, 400, { error: "正文过短（<50 字），请先编辑内容" });
				return;
			}
			try {
				writeJson(res, 200, { report: await reviewChapterText(ctx, config, project, text) });
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
		{
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
		},
		{
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
		},
		assistantRoute,
		assistantHistoryRoute,
		assistantClearRoute,
		{
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
		},
		{
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
		},
		{
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
		},
		{
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
		},
		{
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
		},
		{
			kind: "exact",
			path: NOVEL_API.charactersRefresh,
			handler: async (req, res) => {
				if (!guard(req, res, "POST")) return;
				const config = getConfig();
				const project = requireProject(res);
				if (project === void 0) return;
				try {
					writeJson(res, 200, { cards: await refreshCharacters(ctx, config, project, config.outputDir) });
				} catch (error) {
					writeJson(res, 500, { error: error.message });
				}
			}
		},
		{
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
		},
		{
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
				project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
				saveProject(config.outputDir, project);
				writeJson(res, 200, { bible: project.bible });
			}
		},
		{
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
		},
		{
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
		},
		{
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
		},
		{
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
		},
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
	autoReview: z.boolean().default(true)
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
		autoReview: value?.autoReview ?? DEFAULT_AUTO_REVIEW
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
	sync();
}
//#endregion
export { Config, NOVEL_GUIDANCE, NOVEL_SETTINGS_NAMESPACE, apply, inject, name, resolveConfig };

//# sourceMappingURL=index.js.map