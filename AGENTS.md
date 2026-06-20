# AGENTS

## 项目

care-buddy 是一款基于 Tauri v2 开发的轻量桌面健康提醒应用，帮你在长时间使用电脑的过程中自然建立健康的作息节奏，降低久坐、用眼过度等问题带来的健康负担。

## 技术栈

Tauri 2 / React 19 / TypeScript 6 / Zustand 5 / Tailwind 4 / shadcn v4 (base-nova) / @base-ui/react / i18next / Rust / Motion / Recharts / react-hot-toast

## 规范

- **TypeScript** — strict 模式，使用 `@/` 路径别名（`src/`）
- **React** — 函数组件 + hooks，状态管理用 Zustand，store 集中在 `src/store/healthStore.ts`
- **国际化** — key 定义在 `src/main.tsx` 内联对象（zhCN/enUS），组件内通过 `useTranslation()` 取值
- **前后端通信** — 通过 Tauri IPC：前端用 `invoke()` 调用 Rust 命令，`listen()`/`emit()` 处理事件
- **Rust 后端** — 主要逻辑集中在 `src-tauri/src/lib.rs`（timer、idle 检测、锁屏、托盘菜单、通知）
- **UI 组件** — shadcn v4 组件（Button, Card, Switch, Input, Select, Dialog, DropdownMenu, Tabs, Badge, Separator, Label, Tooltip, Progress, ScrollArea, Toggle, Checkbox），位于 `src/components/ui/`
- **卡片边框** — 父容器有 `overflow-y-auto` 时，Card 需用 `border border-border ring-0` 替代默认 `ring-1 ring-foreground/10` 避免 ring 被裁切
- **样式** — `global.css` 入口：`@import "tailwindcss"` + `@import "shadcn/tailwind.css"` + `@import "tw-animate-css"`；使用 `@tailwindcss/vite` 插件；CSS 变量主题（oklch blue accent）
- **12 列网格** — `--grid-col: 88px; --grid-gap: 20px`；布局基准：侧边栏 108px（Col 0 + gap），左拖拽区 88px（Col 1），内容区 992px（Cols 2-10），右拖拽区 88px（Col 11）
- **内容区** — `pl-[88px] pr-[88px] pb-[88px]` + 内层 `p-5`，内容区域 992×640，四周 20px 间距，可用 952×600
- **标题栏** — 88px (`--titlebar-height`)，文字与第 3 列（Col 2）左边缘对齐
- **图标** — Lucide React（通过 `src/components/Icons.tsx` 统一导出）
- **动画** — `tw-animate-css` 工具类
- **设计规则** — 
- **文件命名** — 组件 PascalCase，工具函数 camelCase

## 目录结构

```
src/                  # React 前端
  components/         # UI 组件
    ui/               # shadcn UI 组件（button, card, switch, input, select, dialog）
  services/           # Tauri IPC 封装（tauri.ts）
  store/              # Zustand 状态
  types/              # TypeScript 类型
  utils/              # 工具函数
  styles/
    global.css        # 主 CSS（shadcn 语义色 + 组件变量 + 布局变量）
src-tauri/            # Rust 后端
  src/lib.rs          # 核心逻辑
  src/main.rs         # 入口
  tauri.conf.json     # Tauri 配置
```

## Figma → 代码还原工作流

### 核心原则：分层迭代，逐层实现

不允许一次性获取全部 Figma 数据然后统一实现。必须：**获取一层 → 实现一层 → 再获取下一层 → 再实现下一层**，确保每层都有精确的数据支撑，不猜测任何像素值。

### 分层迭代步骤

#### 第 1 轮 — 搭框架

1. **Figma 调用**：`get_selection()` + `get_design_context({ depth: 2-3, detail: "compact" })`
   - 目标：获取当前面板的**整体尺寸**、**子区域划分**（几个大区）、每个子区域的 bounds (x,y,w,h) 和间距
   - 不需要叶子节点的样式细节
   - **但容器自身的基本属性必须检查并应用**：fills（背景填充是否有值）、effects（阴影等特效）、strokes（描边）、cornerRadius。列表为空说明无值，不能默认加
2. **代码实现**：搭建组件的 div 骨架、外层容器宽高、flex/grid 布局、子区域容器占位
   - 此时不写内部样式，只保证结构对

#### 第 2 轮起 — 逐子区域精确还原

对每个子区域，按顺序逐一执行：

1. **Figma 调用**：`get_design_context({ nodeId: [子区域根节点], depth: 5-6, detail: "full" })` 或 `get_node`/`get_nodes_info` 批量获取
   - 目标：获取该子区域及其内部所有子节点的**完整样式**（颜色、字号、字重、圆角、padding、精确坐标）

2. **分析子节点布局关系（关键步骤）**
   - 不要凭 UI 经验猜布局方向。必须检查每个子节点的 **(x, y)** 坐标来判断排列关系
   - **必须先检查父容器是否有 `layoutMode`**：
     - `"HORIZONTAL"` 或 `"VERTICAL"` → 有 auto-layout，用 flex 实现
     - `"NONE"` 或缺失 → 无 auto-layout，子节点 **绝对定位**，按 (x, y) 坐标还原

3. **代码实现**：根据分析结果精确实现该子区域的所有样式和布局

4. **验证**：build 通过再进入下一子区域

### 禁止行为

- ❌ 只调大布局，子元素不调 Figma 直接猜尺寸/颜色/间距
- ❌ 不经分层，一次获取全部数据然后一次性实现
- ❌ 容器无 `layoutMode` 仍用 flex 还原
- ❌ 相信第三方导出插件（Codia 等）生成的 flex/center 猜测，始终以 MCP 原始 Figma 数据为准
