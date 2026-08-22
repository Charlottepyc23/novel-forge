# 未完成工作清单（2026-08-22 会话续接）

## 背景
novel-forge 插件（D:\ryan work\harness\plugins\novel-forge）
- DSH 已升 0.1.1-rc.2（源码 D:\ryan work\harness\app，git 仓库，更新用桌面 DSH一键升级.bat）
- novel-forge v1.5.0 已发布；漫剧工作台正在整合

## 当前代码状态（已落盘、typecheck 通过）
- RoleVisualPanel.tsx（新）：角色形象完整面板，已接入：
  - NovelPanel 左导航 roleImage tab（替换原内联实现）
  - MangaWorkspace 漫剧工作台角色区
  - 中英 Tab（blockLang）已实现；生成锚点/精修带 styleId/filterId
- 漫剧工作台 A/B 两态：风格选择页（StyleCard 网格）+ 主工作页（方案切换器 + 角色/场景/分镜三导航）
- 场景库已接风格（extractScenes styleId + 徽章 + 分镜 usedScenes 标注）
- StyleCard.tsx 可复用组件

## 本次会话已完成（2026-08-22）
1. ✅ RoleVisualPanel 浮窗修复：
   - ✕ 按钮 position absolute 相对浮窗内容容器（内容容器 position: relative，✕ top/right 10）
   - overlay onClick（e.target===e.currentTarget）关闭
   - 浮窗 marginTop 24 留白，避免贴顶
   - Esc 关闭（useEffect keydown）
2. ✅ 风格标识：
   - protocol.ts RoleRecord 加 promptStyleId?: string
   - engine extractRoleVisual / generateRolePromptKit 生成时写入 project.roles 对应角色的 promptStyleId（= styleId 参数）
   - RoleVisualPanel 浮窗顶部显示「提示词风格」徽章；与当前方案 styleId 不一致时黄条提示（含「按当前风格重生成锚点 / 精修包」两个按钮）
3. ✅ build + 重启 DSH（restart-dsh.cmd）
4. ⏳ 验证（需 GUI 刷新后人工确认）：浮窗关闭/位置、风格徽章、旧角色重新生成后带风格前缀
5. ✅ 工作进度接入漫剧工作台操作上报（2026-08-22 追加，用户反馈）：
   - 现象：工作进度控制台只收 NovelPanel 自身发起的操作（写作/审稿/修订/拆书等），漫剧工作台内操作不进进度
   - 方案：NovelPanel → MangaWorkspace → RoleVisualPanel / StoryboardTab 透传 onProgress，各操作开始/成功/失败写控制台
   - 覆盖：方案创建/切换/删除、角色提炼候选采纳、形象锚点生成、精修提示词、参考图上传/豆包生成、视觉规则提炼、图集移除、场景提炼/采纳、分镜三步（骨架/分镜表/视频提示词）
   - 备注：MangaWorkspace 内 extractRoles/adoptRole/genRoleVisual 为未使用的死代码（角色区实际由 RoleVisualPanel 操作），已随 build 被 tree-shake，不影响功能；可后续清理
   - 状态：typecheck + build + 重启完成，API 200
6. ✅ 形象锚点「找不到出场描写」修复（2026-08-22，用户反馈「周野律师」）：
   - 排查结论：不是跨书污染——API 指向《“救”命钱》正确，正文第 2~11 章多次出现「周野」、第 10~11 章出现「周野的律师/律师/辩护律师」
   - 根因：角色卡「周野律师」是提炼时名字+身份拼接，正文无此完整词，旧逻辑精确匹配失败
   - 修复（通用）：最近 60 章 → 全书回扫 → 角色名/身份智能拆分（「周野律师」→「周野的律师」「律师」「周野」），具体称谓优先、名字主干兜底
7. ✅ 风格词块漏嵌修复（2026-08-22，用户反馈皮克斯风格没进四视图）：
   - 排查结论：styleId 有传（promptStyleId=pixar-adult-3d、方案激活正常），是 LLM 生成时漏嵌
   - 修复（通用）：system 强化「zh 段首必须原样嵌入风格词块」+ 生成后强制注入（zh 段首 / en 末尾），锚点与四类 promptKit 全覆盖
8. ✅ RoleVisualPanel 浮窗 Portal 修复（2026-08-22，漫剧工作台浮窗顶到顶部/无法关闭）：
   - 根因：【.view】有 backdrop-filter，position:fixed 以整个滚动面板为包含块
   - 修复：createPortal 挂到 document.body + 复制 --nf-* 主题变量；zIndex 2147483000
   - 状态：以上均 typecheck + build + 重启完成，API 200
9. ✅ 场景库完整版搬入漫剧工作台（2026-08-22）：
   - 新建 src/client/panel/SceneLibrary.tsx（提炼/采纳/编辑/图集/详情浮窗），替换漫剧工作台简版场景区
   - 浮窗 createPortal 挂 body + 主题变量复制 + Esc/遮罩关闭；提示词全局中英 + 复制全部；视觉规则只在主页面显示
   - extractScenes 增加风格强制注入（zh 段首 / en 末尾）
   - 左导航「场景库」入口删除
10. ✅ 左导航精简（2026-08-22）：
   - 删除「角色形象」「风格库」入口（功能均在漫剧工作台内）；「漫剧」改名「漫剧工作台」
   - 左导航字体/间距整体调大（.panelNav 216px、.navTab 14px/11px 12px、组标签 12px、图标 17px）
11. ✅ 分镜重新生成链路修复（2026-08-22，视频提示词不跟随当前风格）：
   - 根因：saveChapterStoryboard 合并保留旧下游产物 + 前端恢复逻辑把旧缓存回填 + ③无独立重新生成按钮
   - 修复：服务端级联清理（新骨架→清表+提示词；新表→清提示词）；前端 markRestoreSuppressed 抑制恢复；②分镜表/③视频提示词各加「重新生成」按钮；generateStoryboardPrompts 风格强制注入
   - 验证：重新生成后三层提示词均带当前风格词块，旧缓存不残留


## 最新续接（2026-08-22 晚）

### 已完成并发布
- v1.7.0 已发布（npm + git tag）：设置页重构（内导航/满高/字体/下拉配色）、外观与主题（显示模式/主题风格/界面密度/恢复默认）、生图模型库（多套接口/测试连通/总开关/生成时选模型）、lucide-react 图标 SVG 化、按钮质感、书架页美化、AI进度更名、桌面 DSH启动.bat
- 角色提炼修复：覆盖优先 + 角色过少自动重试 + 完整性补漏第二轮 + 确定性身份词兜底（出现≥3次强制补条）
- 立绘/四视图提示词：禁止瞬间动作与道具状态

### 数据状态
- 《“救”命钱》：roles 已清空（roleStatus 已删），旧 10 人备份在 novels/“救”命钱/roles-backup-20260822.json；**待用户在 GUI 重新提炼角色**（提炼→采纳）
- 生图模型库：豆包旧条目曾"删除后复活"，已修（只有从未保存 imageModels 才迁移）

### 本次会话已完成（2026-08-22 凌晨续接·第七轮补7：移除经典毛玻璃主题）
0. ✅ **删除「经典毛玻璃」主题**（与 macOS 重复）：NovelPanel 类型/localStorage 恢复/下拉去掉 classic；CSS 经典浅/深块 + data-nf-mode dark 经典块删除；locales 删 settings.themeClassic；lib/client.js 确认 0 残留
   - 主题现为 3 个：液态玻璃(liquid) / 新拟物(neumorph) / macOS
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **玻璃主题背后加抽象壁纸底图**：新增 --nf-glass-bg-image（SVG data-URI，feGaussianBlur 柔和光斑），叠在 .panel::before（orb 之上）；macro:液体=绿蓝流光、毛玻璃=冷蓝灰、macOS=蓝紫、新拟物=none；让卡片 blur 糊出真实玻璃感；深浅共用、体积近 0、无版权
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **下拉框/输入框遵循各主题**：.input/.textarea 改用可覆盖形态变量 --nf-ctrl-radius/bg/border/sheen/caret；select 加 appearance:none + 自绘箭头（caret 色随主题）；各主题控件形态：液态(圆角14/玻璃底/绿箭头)、毛玻璃(圆角8/平底/蓝箭头)、macOS(圆角8/玻璃/蓝箭头+蓝focus环)、新拟物(圆角10/实色/深箭头)；option/color-scheme 已按深浅跟随
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **液态/毛玻璃差异落到容器样式**：
   - .card 改用可被主题覆盖的形态变量：--nf-card-radius/blur/saturate/border/sheen（含 .card::before 与 hover 的 sheen 引用）
   - 液态(liquid)：圆角 24、blur 32、sat 190%、白描边、强内高光（果冻玻璃）
   - 经典毛玻璃(classic)：圆角 14、blur 42、sat 120%、冷描边、无内高光（薄平板冷调）
   - macOS：圆角 12、blur 42、sat 150%、冷描边(浅/深)；新拟物：圆角 20、blur 0、无边框、无内高光（实色）
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **显示模式统一由 data-nf-mode 驱动**：
   - 深色基准从 `body[data-ds-dark-theme] .view` 挪到 `.panel[data-nf-mode='dark']` + `body[data-ds-dark-theme] .panel:not([data-nf-mode])`（强制 dark / system 跟随宿主）
   - classic/macos/neumorph 深色块选择器改为 `.panel[data-nf-mode='dark'][data-nf-theme=X]` + `body[data-ds-dark-theme] .panel[data-nf-theme=X]:not([data-nf-mode])` 联合
   - 效果：浅/深由小说工坊「显示模式」自主控制，四主题（liquid/classic/neumorph/macos）各自匹配深浅；system 才跟随宿主；深色系统下强制浅色也生效（不再只对 macos）
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **macOS 浅色显示模式修复**：macos 浅色基准选择器加 `body[data-ds-dark-theme] .panel[data-nf-mode='light'][data-nf-theme='macos']` 高优先级联合，深色系统下强制浅色也能覆盖宿主深色（classic/neumorph 同类问题未改，避免波及）
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **移除 macOS 红绿灯窗口装饰**：删除 macos 主题下 .card padding-top + .card::after 三点（纯装饰且 var(--nf-card-pad) 双值导致 left 失效挡字）；保留 macOS 配色/玻璃按钮/输入框；lib/client.js 确认无 #ff5f57 残留
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **macOS 主题**：panel.module.css 新增 data-nf-theme='macos' 浅色（#007aff 强调 + 白玻璃）与深色（#0a84ff + 深灰玻璃）两套变量，含 data-nf-mode='dark' 手动深色变体；卡片顶部红绿灯标题栏（红#ff5f57 黄#febc2e 绿#28c840，仅 macos 显示，padding-top 推开标题）；按钮/输入框玻璃化（8px 圆角、蓝渐变主按钮、focus 蓝环）。NovelPanel：panelTheme 类型/localStorage 恢复/设置下拉加「macOS · 玻璃（蓝，随外观浅/深）」
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **分镜三页按钮归属修正**：章节下拉三个分镜页都保留；「✍️ 生成剧情骨架 / 🔄 重新生成」只在骨架页（mode=skeleton）显示，分镜表/提示词页由各自内容区按钮承担
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **9 步独立页面（方案X 落地）**：
   - FlowGuide：FlowTarget 拆为 9 个具体目标（skeleton/table/import/makeup/prompts/export…），与页面一一对应
   - MangaWorkspace：重构为步骤页容器——顶部常驻只有「方案切换器 + 全流程步骤条」；删除三导航/新手向导大卡/常驻视觉规则卡；主体按 view 渲染：①建方案（创建成功→②）②视觉规则独立页 ③④⑦分镜页（同一实例按 mode 切换）⑤导入（focus=import+隐藏卡片列表）⑥定妆（focus=cards）⑧场景 ⑨导出使用页（含已定妆卡清单）
   - StoryboardTab：focusStep 换 mode(skeleton/table/prompts/auto) + onGoStep；固定模式前置不足显示黄条、产物缺失给生成按钮，不再静默降级
   - MangaRoleLibrary：focus(import/cards) 滚动聚焦 + showCards 开关
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **分镜工作台内三步按钮移除**：顶部全流程条已含 ③剧情骨架/④分镜表/⑦视频提示词，分镜页内原 ①②③ 三个可点按钮改为只读状态徽章（当前/已完成✓），切换走全流程条（focusStep 已有）；顺带清理 NovelPanel 孤儿 import StoryboardTab（该组件仅漫剧工作台使用）
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **新手流程引导（方案A+B+C）**：
   - 新组件 FlowGuide.tsx：9 步全流程步骤条（①建方案→②视觉规则→③骨架→④分镜表→⑤导入角色→⑥定妆→⑦视频提示词→⑧场景→⑨导出），完成度自动判定（读 project 字段），点击直达对应区块/分镜子步骤
   - MangaWorkspace：状态A 新手向导卡（9 步人话清单）；状态B 方案切换器卡内嵌 FlowGuide；新增「⚠️ 视觉规则」卡（提炼按钮补回工作台，修复入口缺失断点）；storyboardFocus 传给 StoryboardTab
   - StoryboardTab：focusStep 受控（全流程步骤条点击切子步骤）；每步顶部说明行（这步/前置/下一步）
   - MangaRoleLibrary / SceneLibrary：顶部加流程位置说明行
   - 清理孤儿组件 RoleVisualPanel.tsx（无挂载点，已删；lib/client.js 确认无残留）
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **第④步 短剧精简模式开关**：
   - protocol：ProjectState.shortDramaMode + /manga/roles op=mode（开关读写）
   - engine：nominateMangaRoles 短剧规则（只保留 5-8 上镜角色、功能性路人不上卡、coreFunction/protagonistRelation 必填、性格标签极致化、超员裁剪）；extractRoleVisualFrom / generateRolePromptKitFrom 加 shortDrama 参数，漫剧卡路径注入「人设极致化」提示（小说角色库路径不受影响）
   - UI：MangaRoleLibrary 顶部「📺 短剧精简模式：开/关」开关 + 「短剧精简检查」面板（上镜角色 x/5-8 计数、功能覆盖缺项、关系闭环缺项、极致化说明）
   - 至此设计文档 ①②③④ 全部完成
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **第③步 定妆图绑定到分镜生成链路**：
   - protocol：StoryboardShot/Table/Prompt 加 mangaRoleIds?: string[]（定妆图引用）；mangaRoles 路由 op 扩 image/removeImage/imageGenerate
   - engine：buildMangaRoleBindings 索引（卡名/来源名精确+包含兜底）；generateStoryboardTable 注入「漫剧定妆卡」锚点+参考图标记+禁止改换硬规则，镜头/表级写 mangaRoleIds；generateStoryboardPrompts 镜头上下文注入「定妆」行+一致性规则，提示词携带 mangaRoleIds
   - engine：generateReferenceImageFrom 底层重构，新增 generateMangaRoleReferenceImage（豆包等按锚点出定妆图写回 imageUrl）
   - routes：mangaRoles 图集上传（立绘同步 imageUrl）/移除/生图 op
   - UI：MangaRoleLibrary 卡内参考图预览/上传（标签图集）/移除/⚡生成定妆图+模型选择；StoryboardTab 表头/镜头/提示词显示「🎨 定妆」绑定徽章，复制文本带定妆
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **第②步 漫剧角色库提名/匹配/导入**：
   - protocol：MangaRoleCard（含 sourceRoleName 弱关联 / 功能标签 / 关系 / 上场集数 / 状态机）+ MangaRoleCandidate + /manga/roles 路由
   - engine nominateMangaRoles：分镜 characters 收集 → 规则过滤（精确名+身份/简称，短名单≤5）→ LLM 确认（是/否+选哪个，不做开放检索）→ 未匹配判定（正文有此称谓=回小说库补提炼 backfill / 否则漫剧新增 manga_new）
   - engine：extractRoleVisual / generateRolePromptKit 重构出底层 From 版本，新增 extractMangaRoleVisual / generateMangaRolePromptKit（漫画卡写回自身字段，status→anchored）
   - routes：mangaRolesRoute（nominate/adopt/update/remove/visual/promptKit）；ProjectState.mangaRoles 存储 + mergeVolatileFromDisk 同步
   - UI：新组件 MangaRoleLibrary.tsx（从本集分镜导入/提名候选编辑/导入建卡/直接新建/编辑/删除/锚点/精修/状态徽章/风格不一致提示），替换漫剧工作台角色区；清理 MangaWorkspace 死代码
   - 顶部按键：三导航改为「分镜→角色→场景」等宽（minWidth 96），角色计数改显漫剧卡数，方案切换器 select/按钮尺寸统一
   - 状态：typecheck + build 完成；**待重启 DSH 生效**
1. ✅ **分镜 characters[] 结构化角色引用（地基）**：
   - protocol：StoryboardSkeleton / StoryboardShot / StoryboardTable 均加 characters?: string[]
   - engine generateStoryboardSkeleton：LLM 输出 characters（正文确切称谓 3-10 个，与 beats 同步），漏填按角色库名命中正文兜底（guessCharactersFromRoles）
   - engine generateStoryboardTable：每镜头 LLM 输出 characters（1-4 个，sanitizeCharacters 清洗）；表级 characters = 镜头去重汇总，空则用骨架/角色库兜底
   - engine generateStoryboardPrompts：镜头上下文注入「出场」行（为后续③定妆图绑定铺路）
   - StoryboardTab：骨架/分镜表/镜头卡展示角色徽章；复制文本带出场角色
   - 状态：typecheck + build 完成；**待重启 DSH 生效（engine 侧改动）**

### 待做（按序，详见 docs/漫剧角色库设计.md）
1. ✅ 分镜表/骨架加 characters[] 结构化角色引用（地基）——已实施
2. ✅ 漫剧角色库：从分镜提名 → 小说库匹配（规则+LLM两段式）→ 导入（sourceRoleName 弱关联）——已实施
3. ✅ 定妆图绑定到分镜生成链路（分镜生成时注入漫剧卡锚点/参考图）——已实施
4. ✅ 短剧精简模式开关（5-8人/功能标签/关系闭环）——已实施；**漫剧角色库设计 ①②③④ 全部完成**
5. 生图模型「获取模型列表」下拉（接口地址+API Key → 拉 /models 选模型）——已讨论未实施
6. 分镜视频提示词按豆包/即梦格式重写（开头参数行+时间分段+结尾约束+全局时长）——已讨论未实施
7. 分镜表模板强化：每镜头必须写「角色名+动作+表情+标志物」——已讨论未实施
8. 工作进度（AI进度）：子组件 busy 上报使呼吸点对所有操作生效——已讨论未实施
9. 设置页模型区接 DSH 的 listProviders/listModels 下拉——已讨论未实施

## 相关文件
- src/client/panel/RoleVisualPanel.tsx（浮窗在 detailRoleName !== null 分支）
- src/client/panel/MangaWorkspace.tsx
- src/client/panel/NovelPanel.tsx（roleImage tab 已换组件；scenes tab 有独立上传 input）
- src/protocol.ts（RoleRecord）
- src/engine.ts（extractRoleVisual ~1457 / generateRolePromptKit ~1593）

## 环境备忘
- 沙箱：当前 workspace-write（写文件需 read 先行；工具仅 run_code 可直接调用）
- bash 工具内所有反斜杠写双份（\n 等）；JSX 数组用"属性单引号"避免转义问题
- 改完 build 前先 pnpm typecheck
