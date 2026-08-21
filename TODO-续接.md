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

### 待做（按序，详见 docs/漫剧角色库设计.md）
1. 分镜表/骨架加 characters[] 结构化角色引用（地基）
2. 漫剧角色库：从分镜提名 → 小说库匹配（规则+LLM两段式）→ 导入（sourceRoleName 弱关联）
3. 定妆图绑定到分镜生成链路
4. 短剧精简模式开关（5-8人/功能标签/关系闭环）
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
