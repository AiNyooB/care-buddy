---
name: PackageHero 对齐 6 列网格系统（left-aligned, 64/12/24, 含 FF0000 调试背景）
overview: "按 Figma 定义的 6 列网格系统（Count=6 / Width=64 / Gutter=12 / Offset=24 / Left-aligned / FF0000 10% 调试色）重构 PackageHero：图片限定 col 1-4（左 4 列 = 292px）+ 标题+chip 限定 col 5-6（右 2 列 = 140px）+ 文字云跟随 col 1-4 区域 + 右边缘 mask 渐隐过渡到标题区。同时在 global.css 新增 6 列网格的 CSS 变量 token（--grid-debug-color）和 @theme 命名空间别名，并清理掉 Layout 区块中冲突的旧值（--grid-col: 96px、--grid-gap: 16px），把 FF0000 10% 红色调试背景实现为 utility class。"
todos:
  - id: clean-old-grid-vars
    content: "清理 src/styles/global.css Layout 区块 201-211 行的 --grid-col: 96px 和 --grid-gap: 16px 冲突旧值"
    status: completed
  - id: add-grid-debug-tokens
    content: 在 src/styles/global.css 258 行后新增 --grid-debug-color 和 --grid-debug-alpha，@theme 追加 --color-grid-debug 别名
    status: completed
    dependencies:
      - clean-old-grid-vars
  - id: create-grid-debug
    content: 新建 src/components/GridDebug.tsx 实现 6 列 FF0000 10% 调试背景组件
    status: completed
    dependencies:
      - add-grid-debug-tokens
  - id: refactor-package-hero
    content: 重构 src/components/PackageHero.tsx：修复 export function 声明 + 根容器改非 grid + 子元素按 col 1-4 / col 5-6 绝对定位 + 嵌入 GridDebug
    status: completed
    dependencies:
      - create-grid-debug
  - id: adjust-package-backdrop
    content: 调整 src/components/PackageBackdrop.tsx：根容器改 col 1-4 绝对定位 + mask 渐隐改为只保右边缘
    status: completed
    dependencies:
      - refactor-package-hero
  - id: adjust-tag-cloud
    content: 调整 src/components/ExerciseTagCloud.tsx：根容器从 absolute inset-0 改为 col 1-4 绝对定位
    status: completed
    dependencies:
      - refactor-package-hero
  - id: typecheck
    content: 运行 npm run typecheck 验证无类型错误
    status: completed
    dependencies:
      - adjust-package-backdrop
      - adjust-tag-cloud
---

## 产品概述

按 Figma 定义的 6 列网格系统（Count=6 / Width=64 / Offset=24 / Gutter=12 / Color=FF0000 10%）重构 `PackageHero` 区域，让图片、文字云、标题+chip 全部严格对齐 6 列网格。同时新增调试背景组件可视化 6 列。

## 核心功能

- **网格对齐**：
- `<ExerciseTagCloud>` + `<PackageBackdrop>` 限定在 col 1-4（左 4 列 = 24px / 292px 宽）
- 标题 + chip 编排限定在 col 5-6（右 2 列 = 328px / 140px 宽）
- 整体容器宽 = 444px（=`--grid-content`），offset 24px
- **图片渐隐**：只保右边缘渐隐（左贴齐 col 1 硬边，右到 col 4 渐隐过渡到标题区）
- **文字云渐隐**：限定在 col 1-4 区域内，左右 8% 渐隐带作用于 292px 范围
- **6 列调试背景**：`<GridDebug>` 6 个红条（FF0000 / 10%），z-50，开发可见
- 修复 `PackageHero.tsx` 上一轮被改坏的 `export function` 声明
- 清理 `global.css` Layout 区块冲突旧值（`--grid-col: 96px` / `--grid-gap: 16px`）
- 不动 `PackageChip.tsx`（FLIP 动画已就位）
- typecheck 验证通过

## 技术栈

- React 19 + TypeScript 6 + Tailwind 4
- 项目既有 6 列网格 token（已在 `global.css` 251-258 行）
- 不引入任何新技术或新依赖

## 实现方案

### 1. 清理 `global.css` Layout 区块冲突旧值（201-211 行）

- 删除 `--grid-col: 96px`（旧值，被 255 行 64px 覆盖）
- 删除 `--grid-gap: 16px`（旧值，被 256 行 12px 覆盖）
- 其他变量（`--sidebar-width` / `--content-padding` / `--titlebar-height` / `--content-width` / `--card-width` / `--card-area`）保留

### 2. `global.css` 258 行后新增调试色 token

```
--grid-debug-color: #FF0000;
--grid-debug-alpha: 0.1;
```

@theme 区块追加：

```
--color-grid-debug: var(--grid-debug-color);
```

### 3. 新建 `src/components/GridDebug.tsx`

6 列调试背景组件：

- 根容器 `pointer-events-none absolute inset-0 z-50`
- 6 个子 `<div>` 横向绝对定位到每列，背景 `rgba(255, 0, 0, 0.1)`
- 每列 left 公式：`calc(var(--grid-offset) + i * (var(--grid-col) + var(--grid-gap)))`
- 每列 width：`var(--grid-col)`

### 4. 重构 `src/components/PackageHero.tsx`

- 修复缺失的 `export function PackageHero() {` 函数声明
- 根容器改为 `relative h-full min-h-[240px] overflow-hidden`（不再 grid / flex flex-col，子元素用绝对定位）
- 子元素按 6 列网格定位：
- `<ExerciseTagCloud>`：z-0，absolute top-0 bottom-0，left `var(--grid-offset)`，width `calc(4*var(--grid-col) + 3*var(--grid-gap))` = 292px
- `<PackageBackdrop>`：z-10，同上
- 编排层 `<div>`：z-20，absolute top-0 bottom-0，left `calc(var(--grid-offset) + 4*var(--grid-col) + 4*var(--grid-gap))` = 328px，width `calc(2*var(--grid-col) + var(--grid-gap))` = 140px，内部 flex flex-col items-center justify-center
- `<GridDebug />`：z-50，absolute inset-0
- 注释改回"6 列网格对齐"层级说明

### 5. `src/components/PackageBackdrop.tsx`

- 根容器从 `absolute inset-0` 改为 col 1-4 绝对定位容器（left 24 / width 292）
- mask 渐隐从左右 12%-88% 改为**只保右边缘渐隐**：`linear-gradient(to right, black 0, black 80%, transparent 100%)`
- 内部 `<motion.div>` + 两张 `<motion.img>` 维持 `h-full w-auto bottom-0 left-0 right-0 mx-auto object-contain`

### 6. `src/components/ExerciseTagCloud.tsx`

- 根容器从 `absolute inset-0 z-0` 改为 col 1-4 绝对定位容器（left 24 / width 292）
- mask 渐隐保留（左右 8% 渐隐作用于 292px 范围内）
- 4 行 marquee + 30% 透明度 + text-sm 维持

## 6 列对齐公式（CSS calc）

- col 1-4 left: `var(--grid-offset)` = 24px
- col 1-4 width: `calc(4 * var(--grid-col) + 3 * var(--grid-gap))` = 292px
- col 5-6 left: `calc(var(--grid-offset) + 4 * var(--grid-col) + 4 * var(--grid-gap))` = 328px
- col 5-6 width: `calc(2 * var(--grid-col) + var(--grid-gap))` = 140px

## 实施注意事项

- 改动后 `PackageBackdrop` 限定在 col 1-4 区域，`ExerciseTagCloud` 同样限定在 col 1-4 区域
- 标题 + chip 在 col 5-6 区域（140px 宽），内部 flex flex-col items-center justify-center 居中
- 6 列调试背景 z-50 在最顶层（开发可见，生产可在 `<GridDebug>` 顶层加 `hidden` 关掉）
- 跑 `npm run typecheck` 验证

## 改动文件清单

1. `src/styles/global.css` — 清理冲突旧值 + 新增调试色 token
2. `src/components/GridDebug.tsx` — 新建
3. `src/components/PackageHero.tsx` — 重构布局
4. `src/components/PackageBackdrop.tsx` — 改定位 + mask
5. `src/components/ExerciseTagCloud.tsx` — 改定位
6. `src/components/PackageChip.tsx` — 不动