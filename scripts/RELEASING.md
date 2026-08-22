# 发布新版本（dsh-novel-forge）

一条命令完成整个发布流程，无需手动追问每一步。

## 使用

```bash
# 先演练（不会真正 push / publish / 发 release，只打印会执行的命令）
pnpm release:dry

# 正式发布（读 CHANGELOG 顶部版本 → 构建校验 → commit + tag → push → npm publish → GitHub Release）
pnpm release
```

## 发布前唯一要做的事

在 `CHANGELOG.md` **顶部**添加一个版本条目（脚本会自动识别它）：

```md
## [1.8.0] - 2026-08-22

### ✨ 你的变更说明

- ...
```

脚本会：
1. 读 CHANGELOG 顶部的 `## [x.y.z] - date` 作为目标版本
2. 用它同步 `package.json` 的 `version`
3. 把该条目下方的正文作为 GitHub Release 的 body

## 脚本自动执行的完整流程（scripts/release.mjs）

| 步骤 | 动作 |
|---|---|
| 1 | 解析 `CHANGELOG.md` 顶部版本号与变更正文 |
| 2 | 同步 `package.json` version |
| 3 | `pnpm typecheck` + `check-theme-sizes` + `check-fallback-tiers` + `pnpm build`（任一失败即中止） |
| 4 | `git add -A` + `git commit`（`release: vX.Y.Z — 首行标题`）+ `git tag vX.Y.Z` |
| 5 | `git push origin HEAD` + `git push origin vX.Y.Z` |
| 6 | `npm publish`（若该版本已在 npm 上则跳过） |
| 7 | 创建/更新 GitHub Release（body = CHANGELOG 该条目正文） |

## 幂等性

- 若 commit message 与上一次一致 → 跳过重复提交
- 若 tag 已存在 → 跳过打 tag 与推送
- 若该版本已在 npm → 跳过 publish
- 若 release 已存在 → 更新其正文

## 依赖

- GitHub 凭据：本机 `git credential manager` 已登录 `watersxya`（token 需有 `repo` scope，脚本用 `git credential fill` 读取）
- npm：已登录 `waterwx`
