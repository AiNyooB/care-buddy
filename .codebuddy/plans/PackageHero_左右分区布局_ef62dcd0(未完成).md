---
name: PackageHero 左右分区布局
overview: 将 PackageHero 重构为 grid-cols-12 左右分区：左 4 列图片区（PackageBackdrop），右 8 列文字云+标题+chip 编排列；整容器铺文字云背景，左侧图片在文字云之上。
todos:
  - id: fix-syntax
    content: 修复 PackageHero.tsx 缺失的 export function PackageHero() { 函数声明行
    status: pending
  - id: adjust-backdrop
    content: 将 PackageBackdrop 根容器从 absolute inset-0 改为 relative h-full w-full，让父级 grid col-span-4 约束其尺寸
    status: pending
    dependencies:
      - fix-syntax
  - id: refactor-hero
    content: 重构 PackageHero 根容器为 grid grid-cols-12，左 4 列放 PackageBackdrop，右 8 列放标题 + chip 编排
    status: pending
    dependencies:
      - adjust-backdrop
  - id: typecheck
    content: 运行 npm run typecheck 验证无类型错误
    status: pending
    dependencies:
      - refactor-hero
---

## 产品概述

将 `PackageHero` 从全屏居中布局重构为左右分区布局（grid-cols-12），让套餐包编排区在视觉上更像"主视觉 + 标题编排"的双栏结构。

## 核心功能

- **背景层（z-0）**：文字云（`ExerciseTagCloud`）作为整容器背景铺满，4 行反向 marquee 滚动
- **左侧图片区**（col-span-4 + gutter）：3D 蒙版图（`PackageBackdrop`）限定在左 4 列范围内，保留左右渐隐遮罩，垂直居中显示
- **右侧编排区**（col-span-8）：主标题「今日推荐」在顶部 + chip 编排在下方
- 默认态：3 个 chip 横向平铺居中
- 选中态：主卡（`isMain`）+ 另 2 个 chip 右侧垂直 stack
- chip ↔ 主卡的形态切换由 motion `layoutId` + `layout` 驱动 FLIP 动画
- **修复 `PackageHero.tsx` 语法错误**：当前文件已丢失 `export function PackageHero() {` 行，第一步必须修复

## 技术栈

- React 19 + TypeScript 6 + Tailwind 4
- motion（`motion/react`） — chip ↔ 主卡 FLIP 过渡
- `react-fast-marquee` — 文字云跑马灯
- 已存在组件：`PackageBackdrop` / `ExerciseTagCloud` / `PackageChip`

## 实现方案

### 1. 修复 `PackageHero.tsx` 语法错误

当前文件第 22 行后直接接 `const { t } = useTranslation();`，**缺少 `export function PackageHero() {`**，先补回。

### 2. 调整 `PackageBackdrop` 根容器定位

当前 `absolute inset-0 z-10 overflow-hidden` + 自身 `min-h-[240px]`，父级改 grid 后会冲突。改方案：

- 保留 `relative h-full w-full`（不再 absolute），由 grid col-span-4 决定其宽高
- 内部 `<motion.div>` + 两张 `<motion.img>` 维持不变
- 左右 mask 渐隐保留（`transparent 0, black 12%, black 88%, transparent 100%`）

### 3. 重构 `PackageHero` 根容器

```
div.relative.grid.grid-cols-12.items-center.gap-x-4.h-full.min-h-[240px].overflow-hidden.px-2
```

- `grid-cols-12`：12 列布局
- `items-center`：垂直居中（左右两栏同高）
- `gap-x-4`：4 列 + gutter + 8 列 之间留 gutter
- `px-2`：左右内边距，避免图片贴边

### 4. 层级布局

- `ExerciseTagCloud`：保持 `absolute inset-0 z-0`，作为整容器背景
- `PackageBackdrop`：改为 `col-span-4 relative h-full w-full z-10`（不再 absolute，限定在左 4 列范围）
- 右栏容器（标题 + chips）：`col-span-8 relative z-20 flex h-full flex-col items-center justify-center gap-3`
- 标题 `<h2>`：顶部对齐
- 编排行 `div.flex w-full max-w-full items-center justify-center gap-2`：保持原 FLIP 行为

### 5. 关键设计决策

- **`PackageBackdrop` 不再 absolute inset-0**：让 grid col-span-4 限定其宽高到左 4 列，图片只显示在左 4 列内；右 8 列直接看到文字云
- **右栏 chip 编排在 grid 子项内**：维持原 `selectedPackageId` 状态机，FLIP 动画依旧由 `layoutId` 跨栏移动（从 col-span-4 内的 chip → col-span-8 内的主卡）
- **文字云 mask 渐隐保留**：因为是整容器背景，4 行 marquee 横跨整个 hero，左右 8% 渐隐带保证左右边缘自然过渡

## 实施注意事项

- 修改后 `PackageBackdrop` 内部 `motion.div` 的 `h-full w-full` 直接生效（父级已是 col-span-4 的块级容器）
- 不动 `PackageChip.tsx` 的内部实现（FLIP 动画已就位）
- 跑完 typecheck 验证