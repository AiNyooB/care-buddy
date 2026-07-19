# AGENTS

## 任务前置：必读文档

**处理任何非平凡任务前，必须先阅读 [CODE_WIKI.md](./CODE_WIKI.md) 对应章节**，建立全局认知后再动手。不要在未查阅 Wiki 的情况下凭直觉修改代码。

查阅规则：
- **改功能/修 Bug** — 先定位 Wiki 章节定位模块位置与约束，再读对应源码
- **跨模块改动** — 必读第 4 节（整体架构）/ 第 14 节（关键设计约定）/ 第 15 节（数据流图）
- **改 Rust 后端** — 必读第 10 节，特别是 10.4（定时器线程）/ 10.11（命令清单）/ 10.12（事件清单）
- **改前端 hooks** — 必读第 5.3 节（17 个 hooks 调用顺序与 EventCoordinator 依赖）
- **改多窗口组件** — 必读第 6 节，注意第 14.18 / 14.19 条硬约束
- **新增类型字段** — 必读第 11 节，并在 Wiki 同步更新

修改涉及 Wiki 已记录的架构、命令、事件、hooks、类型时，**必须同步更新 [CODE_WIKI.md](./CODE_WIKI.md) 对应章节**，避免文档与代码脱节。文档失真时第 17 节"版本与已知不一致"是巡检清单。

## 项目

care-buddy 是一款基于 Tauri v2 开发的轻量桌面健康提醒应用，帮你在长时间使用电脑的过程中自然建立健康的作息节奏，降低久坐、用眼过度等问题带来的健康负担。

## 技术栈

Tauri 2 / React 19 / TypeScript 6 / Zustand 5 / Tailwind 4 / shadcn v4 (base-nova) / @base-ui/react / i18next / Rust / Motion / Recharts / sonner / next-themes / date-fns

## 规范

- **TypeScript** — strict 模式，使用 `@/` 路径别名（`src/`）
- **React** — 函数组件 + hooks，状态管理用 Zustand（`src/store/index.ts` 统一导出）
- **App.tsx 架构** — 基础设施副作用（Tauri listen/setInterval/初始化逻辑）必须封装在 `src/hooks/` 的自定义 hook 中，在 App.tsx JSX 上方以 `useXxx()` 形式调用。**严禁在 App.tsx 中直接写 useEffect/setInterval/listen**，修改 UI 时不得删除或注释这些 hook 调用行。当前 hook 列表：`useAppInit`、`useCountdownSync`、`useTriggerHealing`、`useFloatingManager`、`useEntertainmentManager`、`useModeTransition`、`useAppModeSync`、`useWorkMinutesTracker`、`useDailyStatsAutoSave`、`useLockScreenEvents`、`useIdleDetection`、`useSystemLockEvents`、`useTrayMenuEvents`、`usePauseStateSync`、`useSettingsSync`、`useNotificationPermission`
- **国际化** — key 定义在 `src/main.tsx` 内联对象（zhCN/enUS），组件内通过 `useTranslation()` 取值
- **前后端通信** — 通过 Tauri IPC：前端用 `invoke()` 调用 Rust 命令，`listen()`/`emit()` 处理事件
- **Rust 后端** — 主要逻辑集中在 `src-tauri/src/lib.rs`（timer、idle 检测、锁屏、托盘菜单、通知）
- **UI 组件** — shadcn v4（Button, Card, Switch, Input, Select, Dialog, DropdownMenu, Tabs, Badge, Separator, Label, Tooltip, Progress, ScrollArea, Toggle, Checkbox, Collapsible, Pagination, Carousel），位于 `src/components/ui/`
- **卡片边框** — 父容器有 `overflow-y-auto` 时，Card 需用 `border border-border ring-0` 替代默认 `ring-1 ring-foreground/10` 避免 ring 被裁切
- **圆角 + overflow 分离** — 父层不能 `overflow-hidden rounded-X` 一把抓，否则子元素 shadow / border 一起被裁。背景单独包一层 `overflow-hidden rounded-X` 自裁，承载子元素走外层直接子节点。
- **样式** — `global.css` 入口：`@import "tailwindcss"` + `@import "shadcn/tailwind.css"` + `@import "tw-animate-css"` + `@import "@fontsource-variable/geist"`；使用 `@tailwindcss/vite` 插件；CSS 变量主题（oklch blue accent）；字体 Geist Variable
- **窗口** — 492×696，无边框（`decorations: false`），`withGlobalTauri: true`，`resizable: false`。额外窗口：`floating-window`（置顶胶囊）、`entertainment-window`（娱乐胶囊）、`lock-slave-*`（副屏锁屏）
- **布局** — 无侧边栏，顶部标题栏 `--titlebar-height: 48px`，主内容卡片 `p-4`，使用 flex 布局自适应高度（内容容器需加 `h-full flex flex-col min-h-0`，滚动区域加 `flex-1 min-h-0 overflow-y-auto`）
- **四个入口** — `?mode=` 参数路由：无参数 → `<App />`，`lock_slave` → `<LockScreenSlave />`（全屏锁屏 webview），`floating` → `<FloatingPreview />`（置顶悬浮窗 320×104），`entertainment` → `<EntertainmentPreview />`（娱乐胶囊窗 120×48 idle / 278×48 triggered）
- **锁屏** — 全屏锁屏。主显示器承载完整交互界面（引导锻炼、倒计时、操作按钮），副显示器仅显示静态提示文案（`is_primary=false`，无交互、无 state）。看门狗线程每秒检查窗口存活和屏幕覆盖完整性
- **eventCoordinator** — `src/services/eventCoordinator.ts` 模块级单例，跨 hook 共享 `floatingVisible`、`notifiedPre`、`handledTriggers`、`triggerStreak` 等可变状态。不同于 React state/ref，各 hook 直接 import 使用，不受组件生命周期约束
- **娱乐模式** — 独立于 appMode 的场景覆盖层。检测到匹配前台应用时自动激活，使用独立倒计时节奏（非任务 interval），通过独立 `entertainment-window` 胶囊窗口交互。激活时抑制浮窗/通知/锁屏（`useCountdownSync.ts:68`），`entertainmentActive` 为 true 时跳过所有常规提醒分发
- **countdown-update payload** — 后端每秒广播 `countdown-update` 事件，payload 含 `tasks: BackendCountdownInfo[]` + `entertainment: EntertainmentCountdownInfo | null`。前端在 `useCountdownSync` 中同步到 store（`updateCountdowns` 写入任务倒计时，`setEntertainmentCountdown` 写入娱乐倒计时）
- **存储** — localStorage + `care_buddy_` 前缀（`src/utils/storage.ts`）；部分设置通过 Tauri IPC 持久化到 `~/.config/care-buddy/settings.json`
- **图标** — Lucide React（可直接从 `lucide-react` 导入，也可用 `src/components/Icons.tsx` 封装）
- **动画** — `tw-animate-css` 工具类 + `motion`（framer-motion 子代，用于 CircularProgress）
- **运动系统** — 医学级运动库（`src/data/exercises.ts`）+ 引导配置（`src/data/guided-configs.ts`）+ 语音引导（`src/services/voice.ts`，Web Speech API TTS）+ 状态机 Hook（`src/hooks/useGuidedExercise.ts`）
- **Toast** — 使用 `sonner` 而非 `react-hot-toast`
- **主题** — `next-themes` 管理；`data-theme` 属性切换 light/dark/system
- **文件命名** — 组件 PascalCase，工具函数 camelCase
- **设计系统** — 完整的设计 token 体系见 `docs/设计系统.md`，包含颜色（oklch + 双主题）、字体排版（10 级 type token）、间距、圆角、阴影、网格系统、组件库清单和项目级规则。新增 UI 时应优先使用已有 token，保持视觉一致性。
- **显示器策略** — 主应用窗口（492×696）仅出现在主显示器。锁屏时主显示器展示完整交互，副显示器仅显示静态提示或不处理。不考虑副显示器上的任何复杂交互。

## 命令

```bash
npm run dev              # Vite dev server (port 5175)
npm run build            # Vite build (输出到 dist/)
npm run tauri dev        # Tauri 开发模式
npm run tauri build      # 打包 NSIS 安装包
npm run typecheck        # tsc --noEmit（唯一类型检查）
# 无 lint / test 命令
```

CI（`.github/workflows/ci.yml`）：`npm run build` → `cargo check`（仅构建验证，不跑 typecheck）

## 目录结构

```
docs/
  设计系统.md             # 设计 token 体系（颜色 / 字体 / 间距 / 圆角 / 阴影 / 网格 / 组件库 / 项目级规则）
src/                      # React 前端
  components/
    ui/                   # shadcn v4 组件（32 个组件）
  services/
    tauri.ts              # Tauri IPC 封装（invoke/listen）
    eventCoordinator.ts   # 跨 hook 共享状态单例
    voice.ts              # Web Speech API TTS 封装
  hooks/
    useGuidedExercise.ts  # 引导锻炼状态机 Hook
    useAppInit.ts              # 应用初始化（checkDayTransition / syncTasks / isTimerPaused）
    useCountdownSync.ts        # 倒计时同步 + 悬浮预通知窗口
    useTriggerHealing.ts       # 触发态自愈
    useFloatingManager.ts      # 浮窗可见性 + dismissed 事件管理
    useEntertainmentManager.ts # 娱乐模式 dismissed 事件管理
    useModeTransition.ts       # 应用模式切换浮窗处理
    useAppModeSync.ts          # 应用模式 + 娱乐模式激活状态同步
    useWorkMinutesTracker.ts   # 每分钟运行时长累加
    useDailyStatsAutoSave.ts   # 每5分钟保存每日统计
    useLockScreenEvents.ts     # 锁屏打开/完成事件
    useIdleDetection.ts        # 空闲状态监听
    useSystemLockEvents.ts     # 系统锁屏/解锁事件
    useTrayMenuEvents.ts       # 托盘菜单事件
    usePauseStateSync.ts       # 暂停状态同步
    useSettingsSync.ts         # 设置更新同步
    useNotificationPermission.ts # 通知权限请求
  store/index.ts          # Zustand store 统一导出
  types/
    index.ts              # Task, AppSettings, Exercise 类型 + EntertainmentAppRule
    exercise.ts           # 引导锻炼子类型
  constants/index.ts      # 默认任务/设置、分类/证据配置
  data/
    exercises.ts          # 医学级运动库 + 套餐
    guided-configs.ts     # 引导锻炼配置
  utils/                  # time / audio / storage 工具
  styles/global.css       # 主 CSS（shadcn 语义色 + 组件变量 + 布局变量）
src-tauri/                # Rust 后端
  src/lib.rs              # 核心逻辑（timer / idle / lock / tray / notifications）
  src/main.rs             # 入口
  capabilities/main.json  # 权限：main, lock-slave-*, floating-window, entertainment-window
  tauri.conf.json         # Tauri 配置
```

## Figma → 代码还原工作流

### 核心原则：分层迭代，逐层实现

禁止一次性获取全部 Figma 数据然后统一实现。必须：**获取一层 → 实现一层 → 验证一层 → 再获取下一层**。

### 可用 Figma MCP 工具（figma-mcp-go）

通过 `figma-mcp-go_` 前缀调用，例如 `figma-mcp-go_get_selection`、`figma-mcp-go_get_node`。

- `figma-mcp-go_get_selection` — 获取当前选中节点元数据
- `figma-mcp-go_get_node({ nodeId, includeChildren })` — 获取节点详细信息（含子节点）。不传 `includeChildren` 默认 true
- `figma-mcp-go_get_document` — 获取文档/页面结构
- `figma-mcp-go_search_nodes({ query, scope })` — AI 语义查询节点
- `figma-mcp-go_scan_nodes_by_types({ types })` — 按类型扫描节点
- `figma-mcp-go_get_screenshot({ mode, nodeIds })` — 视觉快照，用于验证

### 步骤

1. **第 1 轮 — 搭框架**：`figma-mcp-go_get_selection()` + `figma-mcp-go_get_node()` 获取面板整体尺寸和子区域 bounds (x,y,w,h)。检查**容器自身**的 fills/effects/strokes/cornerRadius，列表为空说明无值，**不要默认添加**。搭建 div 骨架、flex/grid 布局，不写叶节点样式。
2. **第 2 轮起 — 逐子区域精确还原**：对每个子区域，`figma-mcp-go_get_node({ nodeId })` 获取完整样式。
   - **关键判断**：检查父容器 `layoutMode`：`HORIZONTAL`/`VERTICAL` → flex（用 `padding*` 和 `itemSpacing`），`NONE` 或无 → 按每个子节点的 **(x,y)** 坐标**绝对定位**，不可用 flex
   - 文本节点：读取 `fontSize`、`fontWeight`、`lineHeight`、`fills[0].color`，映射到 CSS token（`--type-*`、`--color-*`）
   - 形状节点：读取 `fills`、`strokes`、`cornerRadius`、`effects`，空则不设
3. **验证**：每次调用 `figma-mcp-go_get_screenshot` 截图对比 + `npm run typecheck` 通过再进入下一子区域。

### 禁止

- ❌ 不经 Figma 数据直接猜尺寸/颜色/间距
- ❌ 不经分层一次性全部实现
- ❌ 容器无 `layoutMode` 仍用 flex 还原
- ❌ 容器属性（fills/effects/strokes/cornerRadius）为空时默认添加值
- ❌ 相信 Codia 等第三方导出插件的 flex/center 猜测，始终以 MCP 原始 Figma 数据为准
- ❌ 同时修改多个不相关子区域，一次只处理一个

## 原则

不做无依据的推测，不推荐非标准做法。

### tailwind-merge × 自定义 `--text-*` theme 陷阱

`tailwind-merge`（v3）**不识别**自定义 `--text-*` tokens（如 `text-type-section-title`），误归 `text-color` 组，与 `text-foreground` 等冲突时被删除。修复：`src/lib/utils.ts` 中用 `extendTailwindMerge` 注册到 `font-size` 组。新加 `--text-*` 需同步更新。

### 网络代理

遇到网络问题（webfetch 等），改用 curl.exe 走 HTTP 代理：`$env:HTTP_PROXY="http://127.0.0.1:10808"; curl.exe -sL <URL>`

## 效率原则

- **先查文档再动手** — 遇到库（recharts/shadcn/tailwind）的问题，先 fetch 官方文档或源码，不要自己猜
- **快速验证** — 能直接改代码试的改动，不要反复问确认
- **不要擅自改动** — 没有用户明确要求，不要删除/修改现有功能（比如 background）
- **搜 issue** — recharts/shadcn 的 bug 先查 GitHub issue，往往已有解决方案
- **别重复分析** — 同一段代码看一遍就够了，找到问题直接改，不要反复确认

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the default 5-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
