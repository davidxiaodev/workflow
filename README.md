# dx-workflow

仓库：`davidxiaodev/workflow`。

一套给日常 AI 编码用的轻量工作流（Claude Code 插件）。你只描述要做什么，它决定走哪些步骤、该用哪个 skill、
什么时候停下来问你；简单的改动保持简单，有风险的改动才严格检查。

> 让 AI 适应工程流程，而不是让开发者为了用 AI 去适应复杂的流程。

## 快速开始

```bash
/plugin marketplace add davidxiaodev/workflow
/plugin install dx-workflow@dx-workflow
```

在项目里接入一次（从 `package.json`、`pyproject.toml`、`go.mod` 里找出已有的测试、lint、类型检查命令，生成 `.verify/config.json`）：

```bash
node <plugin>/scripts/init.mjs
node <plugin>/scripts/run-verify.mjs --config working   # 在未改动的代码上跑一遍，应该全部通过；然后提交 .verify/config.json
```

之后就正常提需求，比如"`/workflow` 给订单列表加按日期筛选"，或者直接说需求。设计约定、截图检查、用户路径这些都是需要时再加。

推荐同时安装（装了就会用上，没装也能工作）：

```bash
/plugin install superpowers@claude-plugins-official          # brainstorming、写计划、TDD、调试、worktree
/plugin install mattpocock-skills@claude-plugins-official    # grilling、架构、代码质量
```

## 它怎么工作

```text
理解 → 计划 → 实现 → 验证 → 完成
```

两件事决定走哪些步骤，而且分开判断：

**大小**由 AI 从需求判断，决定要做多少计划：

| 大小 | 例子 | 理解 | 计划 | 会写的文件 |
| --- | --- | --- | --- | --- |
| Small | 修个 bug、改文案、改样式、一个小函数 | 复述一句 | 不需要 | 不写任何文件 |
| Medium | 一个功能或修复，一个 PR 放得下 | 有不清楚的才问 1–3 个问题 | 有多个部分时写几条要点 | `.verify/acceptance.md`（不提交） |
| Large | 新流程、跨模块改动、要拆成多个 PR | brainstorming / grilling | 规格（含简短的架构）+ 任务列表 | `docs/specs/<名字>.md`、`.tasks.md` |

**风险**由脚本从 diff 算出来，决定要验证多严（`node <plugin>/scripts/level.mjs` 随时可以看）：

| 级别 | 什么时候 | 要求 |
| --- | --- | --- |
| light | 小改动（默认 ≤40 行、≤3 个文件），什么风险都没碰 | 检查通过就行。不写验收文件、不派评审、不生成证据包 |
| standard | 其余的改动 | 验收标准 + 检查 + 一次独立评审；证据包自动生成 |
| strict | 不管多小，只要碰到鉴权、支付、权限、迁移、接口契约、原生配置、`sensitive` 路径，或者改了检查本身 | 再加深度评审和安全检查；合并前由 owner 确认（3 档） |

风险不用配置也能识别：按路径（`auth/`、`payment`、`migrations/`、`.sql`、`.env` 等）和代码内容（Stripe、JWT、bcrypt、`DROP TABLE`、
`dangerouslySetInnerHTML`、权限判断等）判断；可以在配置的 `risk` 里调整或关掉。所以改动再小，碰了登录也会走严格验证；AI 也没法自称"这是小改动"来跳过。

评审也按改动来：代码评审每次都做；UI 截图评审只在界面相关的文件改了时才做；改了接口契约时检查兼容性；有风险时加安全检查。
评审最多两轮，还不通过就交给你。

**什么时候停下来问你**：需求有两种理解、猜错代价大；Large 的规格写好了（你同意后才拆任务、写代码）；改动是 strict；诊断之后检查还是失败；
两轮评审都没通过；正确的修法需要改契约、迁移或原生，而你没提到。其余时候它直接往下做，不会每一步都来问。

大的改动按 `skills/workflow/large.md` 走：规格 → 任务 → 每个任务一个 PR。步骤之间的关卡是能执行的命令
（`flow-check.mjs spec`、`tasks`、`next`、`acceptance --write`），生成的验收文件带着 `Spec:` 和 `Task:`，
所以评审的每一条标记都能追溯到你同意过的目标。同一个检查连续两次失败，会要求先找根因再修（`shared/debug.md`）。

## 和 superpowers、Matt Pocock 的 skills 一起用

这个插件负责流程编排和质量保障，不重复实现别人已经做好的能力：

| 步骤 | 交给（装了才用） |
| --- | --- |
| 理解大需求 | `superpowers:brainstorming`、`mattpocock-skills:grilling` |
| 架构 | `mattpocock-skills:codebase-design`、`improve-codebase-architecture` |
| 计划 | `superpowers:writing-plans`、`mattpocock-skills:to-tickets` |
| 先写测试 | `superpowers:test-driven-development`、`mattpocock-skills:tdd` |
| 并行 | `superpowers:using-git-worktrees`、`dispatching-parallel-agents` |
| 调试 | `superpowers:systematic-debugging`、`mattpocock-skills:diagnosing-bugs` |
| 代码质量、复盘 | `mattpocock-skills:improve-codebase-architecture`、`code-review`、`retro` |

dx-workflow 自己负责：工作流编排、验证、独立评审、证据包、ratchet。重叠的地方以 dx-workflow 为准（"做完"看 Stop 钩子，
独立评审看 `review-brief.mjs`，合并看分档），详见 `shared/skill-packs.md`。

上线（部署、灰度、监控、回滚）还没做：目前按合并分档决定谁批准合并，之后按你们团队现有的流程。

---

以下是细节，日常使用不需要读。

## 各 lane 的检查

项目里每一个客户端或服务叫一个 **lane**（比如 `web`、`app`、`api`），标明 `kind` 是 `frontend` 还是 `backend`。
`init.mjs` 会生成最基本的检查；需要时再加：

| | frontend | backend |
| --- | --- | --- |
| 约定 | `docs/design.md` + token 文件（`frontend/setup.md`） | `docs/backend.md` + 契约文件 + 迁移目录（`backend/setup.md`） |
| 检查 | 写死的样式、类型、lint、截图 + 可访问性、用户路径（Web 用 Playwright） | 类型、lint、单元、真实数据库的集成测试、契约、迁移、用户路径 |
| 评审 | 有界面改动时看截图（`design-review.md`），代码看 `frontend/code-review.md` | `backend/code-review.md` |

**负向检查**：把这条 lane 里的源码改动退回到基线、保留新测试，再跑一遍测试，测试必须失败。
测试在没有实现时也能通过，说明它没测到这次改动。

**移动端（React Native / Expo）**：lane 写 `"kind": "frontend", "platform": "react-native"`，默认覆盖全部 JS/TS 代码和
`app.json`、`ios/`、`android/` 等原生配置。和 Web 的区别：

- 截图用 `rn-look.mjs`：在 iOS 模拟器和 Android 模拟器上，用 Maestro 按深链接打开每个页面，固定状态栏，
  分默认、暗色、大字号三种各截一张，和基线逐像素比较（内置 PNG 比较，不需要依赖），差异图和报告进证据包；
- 样式检查加 `--platform react-native`：样式和属性里写死的颜色、字号字体、不在间距刻度上的数值；
- 用户路径用 Maestro flow（用 testID 定位）；
- 原生改动（`app.json`、`ios/`、`android/`、`package.json` 新增原生模块）只能随新的商店版本发出，旧版本用户会一直用旧原生代码，
  所以固定 3 档、标为不可撤回，评审走 deep；
- 验收标准和评审多一组移动端情况：大字号、最小机型、暗色、断网、切后台、权限被拒、Android 返回键、键盘遮挡、读屏、旧版本 App。
- 模拟器在 CI 里需要 macOS 或模拟器 runner；跑不了的检查标 `"ci": false`，只在本地跑，CI 里记为未运行。

详见 `skills/frontend/mobile.md`。

**负向检查**：把这条 lane 里的源码改动退回到基线、保留新测试，再跑一遍测试，测试必须失败。
测试在没有实现时也能通过，说明它没测到这次改动。

## 合并分档

脚本算，不能手动改。

| 分档 | 条件 | 谁要看 |
| --- | --- | --- |
| 1 | light 改动检查全过；或者检查全过、评审通过、验收标准全部满足，且没有下面的情况 | 扫一眼证据包即可合并 |
| 2 | 改了截图基线或共享模块（`shared`）；有验收标准"未验证"；改了源码却没改测试；代码里新增了 `@ts-ignore`、`eslint-disable`、`noqa` 这类关掉检查的注释，或者加了重试 | 你要看前后对比和标出来的部分 |
| 3 | strict 改动：改了设计约定、后端约定、接口契约或迁移；改了 `sensitive` 路径或被识别为有风险的代码；移动端的原生改动；**改了检查本身**（见下） | 你确认之后才能合并 |
| 未就绪 | 检查失败、评审未通过、有验收标准未满足或没被评审；运行或评审对应的不是当前磁盘上的内容 | 不合并 |

证据包和 PR 描述里还有一节"合并风险"：能否撤回（有迁移是单向的，改了接口契约对已接入的调用方也是单向的）、
影响范围（碰了哪些 sensitive、契约、共享模块和检查）、怎么回滚（验收标准里写的 `Revert:`，或者默认做法）。

## 检查不会被改动本身绕过

- **改动不能改判它的检查**：检查一律从基线提交（和默认分支的 merge-base，可用 `VERIFY_BASE` 指定）上的
  `.verify/config.json` 读取，工作区里改过的配置不生效。确实要改检查（接新检查、调整 lane）就用
  `run-verify.mjs --config working` 跑，这类改动固定 3 档。算作"改了检查本身"的有：
  - `.verify/config.json`、`docs/checklist.md`；
  - 测试、lint、类型和 CI 的配置：`playwright.config.*`、`eslint.config.*`、`tsconfig*.json`、`.github/workflows/**`、
    `.claude/settings.json` 等（完整清单见 `scripts/lib/verify-config.mjs` 的 `DEFAULT_GUARD`，项目可以在配置的 `guard` 里追加）；
  - 删掉的测试文件；
  - 测试里新增的 `.skip`、`.only`、`xit`、`@pytest.mark.skip`，以及截图对比的 `threshold`、`maxDiffPixels`、`mask`。
- **按内容认，不按时间认**：`run-verify` 记录工作区内容的哈希（`tree`，不含 `.verify/` 和被 `.gitignore` 忽略的文件），
  评审在标题下写 `Tree: <这个哈希>`，证据包也写上它。收尾检查和分档只认哈希对得上的运行和评审；`touch`、`checkout`
  或者评审之后再改文件，都骗不过去。运行期间如果有检查改写了源码（比如格式化工具开了写入模式），这次运行直接判失败。
- **改动范围按基线算**：和 merge-base 比，已提交（包括已推送）、未提交、删除的文件都算。

## 评审

standard 和 strict 改动才评审。`review-brief.mjs` 给每条 lane 的评审写同一份输入，交给一个新的子代理（能换模型就换），不带任何实现过程：

- **要做哪些评审**：代码评审每次都做；有界面改动才看截图；改了契约要查兼容性；有风险时加安全检查。

- **内容哈希**：要评的是哪一份内容，没在 git 里的新文件单独列出。
- **深度**：quick（≤30 行、没碰共享模块）、standard、deep。strict 的改动或者超过 400 行，都走 deep；
  deep 里每个 Blocker 都要先尝试推翻它，推不翻才写，评审文件要写 `Depth: deep`。
- **清单项**：`docs/checklist.md` 里被这次 diff 触发的条目（每条写明触发条件、检查什么、来自哪次事故），评审逐条标"成立 / 不成立"。
- **轮次**：从第 2 轮起，附上上一轮的发现，评审只看上次评审之后新增的 diff，旧发现逐条标"已修 / 仍未修 / 延后"，
  不换个说法重复提。最多两轮，第 3 轮直接拒绝，交给你决定。

发现分为 Blocker、Should-fix、Note，以及 `Pre-existing`：这次改动没碰到的代码里的问题照样报告，但不挡合并，
会单独列在证据包里。同一类问题要列出所有出现的地方，让作者一次修完。

## 把犯过的错变成检查

`shared/ratchet.md`：每个 Blocker、每次回滚、每次你纠正 AI，都按"能写成检查就写成检查"的顺序处理：
lint 规则、类型或约束 > 由 diff 触发的清单项 > 写进约定文件。新规则要有证据（至少出现两次，或一次真实事故），
先在整个仓库上跑一遍确认不误报，单独提交（属于改了检查本身，3 档）；旧代码里的同类写法一起清掉，因为 AI 会照抄。
每月清理一次过时的规则。

清单格式：

```markdown
## C1 A retried create does not create twice
- when: diff `/router\.post|@Post\(/` or path `src/**/handlers/create*.ts`
- lanes: backend
- check: POST the same body twice with the same Idempotency-Key; one row, the same id both times.
- source: incident 2026-09-14, PR #311
```

## 收尾检查和提交盖章

**Stop 钩子**：这一轮改动了某条 lane 的文件（内容和这一轮开始时不同，由 UserPromptSubmit 钩子记录）时，按级别检查：
light 只要求这条 lane 的 `run-verify` 在当前内容上通过；standard 还要求独立评审针对当前内容且已通过、验收标准和清单项都已标记；
strict 还要求评审是 deep。证据包由钩子自己生成，其他条件都满足时它会自动跑 `make-evidence`。不满足时第一次结束会被拦下。仍未通过就结束时，AI 必须写明"未验证"
（钩子只拦一次，避免无限循环）。只聊天、没改内容的一轮不会被拦。

`DX_WORKFLOW_GATE`：`enforce`（默认，拦截）、`observe`（只记录本来会拦什么，用来先看误报）、`off`（关闭）。
每次判断都追加到 `.verify/gate.log`，`ratchet.md` 建议每周看一次。

**提交盖章**（可选）：`node <plugin>/scripts/stamp.mjs --install` 装一个 `prepare-commit-msg` 钩子。每个改了 lane 文件的提交带上
`Verified: tree=… tier=… lanes=…`；没验证，或者提交的内容和验证过的不一致，就写 `Verified: none (原因)`。这个钩子从不拦提交。
查没验证的提交：

```bash
git log --format='%h %s%n  %(trailers:key=Verified,valueonly)' origin/main..
```

## CI

把 `plugins/dx-workflow/shared/verify-ci.yml` 复制到项目的 `.github/workflows/verify.yml`，填上安装依赖和启动服务的步骤。
每个 PR 都会用基线分支的配置在 PR 内容上重跑全部检查，按检查结果和改动范围算出分档（`make-evidence --checks-only`），
写进 job summary；未就绪时 status 为红，可以在分支保护里设为必过。日志和截图作为 artifact 保存。

CI 里目前不跑独立评审，分档会标明"checks only"。评审放进 CI 有两种做法（把 `.verify/review-*.md` 提交进 PR，
或者在 CI 里跑 reviewer），还没定。

## 可选的界面工具

插件会自动找到这些（见 `vendor.lock.json` 里锁定的版本）：

```bash
/plugin marketplace add Leonxlnx/taste-skill
/plugin install taste-skill@taste-skill
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

baoyu-design 是可选的看图调色工具，只在项目仓库外用（它含有未授权的 Anthropic 材料）。

## 环境变量

| 变量 | 作用 |
| --- | --- |
| `VERIFY_BASE` | 基线提交（默认：和 `origin/HEAD`、`origin/main`、`origin/master` 的 merge-base，都没有就是 `HEAD`） |
| `DX_WORKFLOW_GATE` | Stop 钩子：`enforce`（默认）、`observe`、`off` |

## 文件

**技能**

| 路径 | 作用 |
| --- | --- |
| `plugins/dx-workflow/skills/workflow/` | 入口：`SKILL.md`（大小、风险级别、五个阶段、什么时候问人）、`large.md`（规格、架构、任务） |
| `plugins/dx-workflow/skills/frontend/` | 前端：`SKILL.md`（入口）、`setup.md`、`build.md`、`verify.md`、`mobile.md`（React Native / Expo）、`design-review.md`（截图评审）、`code-review.md`（前端代码评审）、`templates/`（design.md、Web 截图测试、页面清单、`rn-look.json`、Maestro journey） |
| `plugins/dx-workflow/skills/backend/` | 后端：`SKILL.md`（入口）、`setup.md`、`build.md`、`verify.md`、`code-review.md`（代码评审）、`templates/backend.md` |
| `plugins/dx-workflow/shared/acceptance.md` | 怎么写验收标准、异常情况清单、评审怎么标记 |
| `plugins/dx-workflow/shared/ctl.md` | 生成项目的控制命令（读写分开），以及 `verify-<app>` skill 和用户路径 |
| `plugins/dx-workflow/shared/debug.md` | 检查连续失败时怎么找根因 |
| `plugins/dx-workflow/shared/skill-packs.md` | 和 superpowers、Matt Pocock 的 skills 一起用：谁做哪一步，冲突时以谁为准 |
| `plugins/dx-workflow/shared/ratchet.md` | 把犯过的错变成检查：分类、准入、单独提交、清理；清单格式 |
| `plugins/dx-workflow/shared/verify.config.json` | `.verify/config.json` 模板（frontend 和 backend 两条 lane） |
| `plugins/dx-workflow/shared/verify-ci.yml` | 项目用的 CI 模板 |

**脚本和钩子**

| 路径 | 作用 |
| --- | --- |
| `plugins/dx-workflow/hooks/hooks.json` | 注册 UserPromptSubmit 和 Stop 两个钩子 |
| `plugins/dx-workflow/scripts/run-verify.mjs` | 按 lane 跑检查（含负向检查），记录退出码和内容哈希；`--config working`、`--keep-going`、`--restore` |
| `plugins/dx-workflow/scripts/init.mjs` | 接入：找出已有的检查命令，生成最小的 `.verify/config.json` |
| `plugins/dx-workflow/scripts/level.mjs`、`lib/level.mjs` | 这次改动的验证级别（light / standard / strict）和原因 |
| `plugins/dx-workflow/scripts/flow-check.mjs` | 步骤之间的关卡：规格、任务、下一步可做的任务、生成任务的验收文件 |
| `plugins/dx-workflow/scripts/lib/flow.mjs` | 解析规格和任务文件 |
| `plugins/dx-workflow/scripts/review-brief.mjs` | 写评审 brief：内容哈希、深度、触发的清单项、轮次 |
| `plugins/dx-workflow/scripts/make-evidence.mjs` | 生成证据包和合并分档；`--pr` 输出 PR 描述，`--checks-only --exit-code` 给 CI 用 |
| `plugins/dx-workflow/scripts/stop-gate.mjs` | Stop 钩子 |
| `plugins/dx-workflow/scripts/turn-start.mjs` | UserPromptSubmit 钩子：记录这一轮开始时的内容哈希和插件位置 |
| `plugins/dx-workflow/scripts/stamp.mjs` | 提交盖章；`--install` 装 git 钩子 |
| `plugins/dx-workflow/scripts/check-raw-styles.mjs` | 找出写死的颜色、Tailwind 色板类、任意值；`--platform react-native` 加查 RN 样式 |
| `plugins/dx-workflow/scripts/rn-look.mjs` | 移动端截图：模拟器 + Maestro，按设备和默认/暗色/大字号比较基线 |
| `plugins/dx-workflow/scripts/lib/png.mjs` | 无依赖的 PNG 解码、比较和差异图 |
| `plugins/dx-workflow/scripts/find-tools.mjs` | 找到已安装的 taste-skill、ui-ux-pro-max、baoyu-design |
| `plugins/dx-workflow/scripts/lib/verify-config.mjs` | 读配置（从基线提交）、算改动范围和内容哈希、找出"改了检查本身"的改动 |
| `plugins/dx-workflow/scripts/lib/checklist.mjs` | 解析 `docs/checklist.md`，按 diff 选出触发的条目 |
| `plugins/dx-workflow/scripts/lib/negative.mjs` | 负向检查 |

**本仓库**

| 路径 | 作用 |
| --- | --- |
| `test/` | 脚本自己的测试（Node 20+，无依赖），CI 见 `.github/workflows/test.yml` |
| `evals/` | 评审的 eval：已知 bug 要找到，干净改动不能误报 |
| `docs/adr/` | 关键取舍的决策记录 |
| `vendor.lock.json`、`NOTICE.md` | 调用和改编的第三方工具、版本和许可 |

## 开发

```bash
npm test                                                                    # 脚本的测试
node evals/run.mjs all --reviewer "claude -p --permission-mode acceptEdits" # 改 code-review.md、brief 或换模型之前先跑，和 evals/results/ 里上一次比
```

发版：改 `plugins/dx-workflow/.claude-plugin/plugin.json` 的版本，合并后打同名 tag（如 `v0.7.0`），CI 模板按 tag 锁定插件版本。

升级第三方工具：一次只升一个，读它的改动，在两个项目上各跑一次 `run-verify.mjs`，结果没变差再改 `vendor.lock.json` 里的 commit。

## 思路来源

Anthropic Claude Code 团队关于代码评审和验证的文章，Lauren Tan（poteto）的 pstack 和"倒金字塔"，Matt Pocock 的 skills
（grilling、tdd、code-review、retro、pr），Jesse Vincent 的 superpowers，Addy Osmani 的 agent-skills，Garry Tan 的 gstack，
Damola Akinleye 的 interface-design。改编的文字和许可见 `NOTICE.md`；分派给其他 skill 包的步骤见 `shared/skill-packs.md`。
