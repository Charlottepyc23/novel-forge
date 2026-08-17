---
name: novel-forge-chapter-batch
description: 批量生成小说章节并值守处理审稿未过的章节。当用户说「生成 N 章」「连写」「批量生成」「继续写章节」「值守处理未过章节」时使用。依赖 dsh-novel-forge 插件（http://127.0.0.1:3080/api/dsh-novel-forge/*）。
---

# 小说章节批量生产与值守处理

把「批量生成章节 + 审稿未过处理」固化为可复现流程。所有操作通过 dsh-novel-forge 的 HTTP API 执行。

## 0. 值守纪律（最高优先级，违反即空转）

1. **启动后台任务后立即停下，不轮询、不连续 wait、不做无意义动作**——后台任务（批量生成/处理）由运行时在完成时自动通知。
2. 只有收到「任务完成」通知或用户新消息时，才继续下一步（读结果 → 处理未过 → 汇报）。
3. 等待期间可以做「与当前任务无关」的其他有用工作（如用户提出的其他问题、代码改进），但不得为等任务而空转。
4. 任务因 web 重启中断时：等用户确认或检测到 3080 恢复后，复位卡死章节（generating/error → reset）再续跑，并向用户说明中断原因。

## 1. 前置检查（每次必做）

1. 确认服务在跑：`GET /api/dsh-novel-forge/status` 返回 200，读 `project.chapters` 数量与书名。
2. 确认目标章节状态：列出 `pending`（待生成）章节号区间，避免重复生成已 approved/rejected 的章。
3. **串行执行，禁止并行写 project.json**——多个脚本同时调 API 会造成状态互相覆盖（实测教训：第 166 章曾被并发回滚成 rejected）。

## 2. 批量生成

对目标章节区间（如 181-205）逐章串行调用：

```
POST /api/dsh-novel-forge/generate
{ "chapterNo": N, "skipReview": false }
```

- `skipReview: false` 走完整质量门（生成 → 摘要+编年录 → AI 审稿 → 作者复盘）。
- 响应为 NDJSON 流；找 `{"type":"review","report":{...}}` 帧取 `score`/`passed`。
- 每章 2-5 分钟；失败自动重试 1 次（间隔 3 秒）。
- 预估总时长并告知用户（25 章 ≈ 45-75 分钟），放后台跑，期间可并行做别的（只读操作不受影响）。
- 推荐用 Node 脚本（fetch + 逐章循环），避免 PowerShell 的引号/UTF-8 转义坑；脚本用完删除。

## 2. 未过章节处理（分级策略）

生成完成后汇总：通过 / 未过（rejected）/ 失败（error）。对未过章按此分级：

### A. 无 high（全是 medium/low 主观项）→ 豁免通过
```
POST /api/dsh-novel-forge/chapter/approve  { "chapterNo": N }
```
主观项（套话/节奏/比喻/心理描写）不值得逐章磨，直接通过。

### B. 有 high 且问题明确（逻辑/设定/时间线/用词）→ 按意见修订 + 验证模式
1. 取 review 的 high（无 high 取前 3 条 medium），拼指令：
   `按审稿意见修订（优先处理）：\n[severity] item → suggestion`
2. `POST /rewrite` `{ chapterNo, instructions }` → 产出 pendingDraft
3. **验证模式**：`POST /chapter/check` `{ chapterNo, text: draft, previousReport: review }`——携带上一轮报告，LLM 只核对原意见是否解决 + 只挑新增 high，不全新找茬
4. 判定：`passed || issues 全非 high` → 可接受
5. 可接受 → `POST /draft/apply` `{ chapterNo, report: { score: max(score,70), passed: true, issues: [], ... } }` 落盘为 approved
6. 不可接受 → 看剩余 high 是否明确可修 → 第二轮修订（指令更精确，如「把第 141 章的养伤时间线统一为七天」）→ 再验证
7. **每章最多修订 2 轮**，仍不过 → 保留草稿，标记「待人工」，不硬来

### C. 有 high 但结构性（修订改不好，如逻辑矛盾被坐实）→ 重新生成
- `POST /draft/discard` 清草稿 → `POST /generate` 整章重写
- 重新生成后若只剩主观项 → 走 A 豁免

### D. error 状态（无审稿、chars 丢失）→ 重置重生成
- `POST /chapter/reset`  `{ chapterNo }` → `POST /generate`

### 特殊注意
- **approved 但 review 有 high**：已通过状态保留，不折腾（high 可能已被正文处理或审稿误标）。
- **修订指令越精确越有效**：具体数字/行为（如「茶梗尺寸统一为半截指节」）一次就过；泛泛的「修正矛盾」容易改不到位。

## 3. 收尾

1. 最终验证：`GET /status` 读目标区间全部 approved。
2. 可选：对涉及剧情的章节刷新剧情线进度（`POST /plotlines` `{ op:'refresh', id }`）——注意刷新函数只读最近 8 章摘要，早期章节的线可能刷不准，必要时手动 update progress + link 章节。
3. 向用户汇报：通过/未过/失败数量 + 每章处理方式 + 遗留待人工项。

## 4. 已知陷阱（血泪教训）

- **并发写 project.json 会互相覆盖**——多个生成/处理任务必须串行。
- **rewrite 的草稿可能不落盘**（偶发 500 或时序）——应用前检查 `pendingDraft` 是否存在，不存在则重跑 rewrite。
- **PowerShell 调 API 的引号/中文转义是坑**——统一用 Node 脚本。
- **status 接口会做数据快照**——以磁盘 novel-project.json 为准复核关键状态。
- **验证模式 500 偶发**——重试一次即可（LLM 瞬时错误）。
