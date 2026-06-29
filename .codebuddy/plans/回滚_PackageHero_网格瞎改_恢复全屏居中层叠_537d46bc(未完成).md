---
name: 回滚 PackageHero 网格瞎改，恢复全屏居中层叠
overview: 上一轮把 PackageHero 根容器从 flex flex-col 瞎改成 grid grid-cols-12，破坏项目网格系统（王国系统），并导致 export function 声明丢失、typecheck 失败。本次回滚 PackageHero + PackageBackdrop 到前几轮已建立好的"全屏居中层叠"状态（z-0 文字云、z-10 图片、z-20 标题+chip 居中）。
todos:
  - id: fix-export-line
    content: 在 src/components/PackageHero.tsx 第 22 行后插入 export function PackageHero() { 修复语法错误
    status: pending
---

## 产品概述

回滚 `PackageHero.tsx` 到前几轮已建立好的"全屏居中层叠"状态（项目既有的网格系统 / 王国系统），修复被上一轮误改坏的语法和布局，恢复"文字云 z-0 铺满 + 图片 z-10 居中层叠 + 标题+chip z-20 居中"的工作状态。

## 核心功能

- `PackageHero` 根容器恢复为 `relative flex h-full min-h-[240px] flex-col overflow-hidden`（全屏居中布局，遵循项目网格系统）
- 恢复缺失的 `export function PackageHero() {` 函数声明行
- 头部注释改回"全屏居中层叠"层级说明，移除错误的"左右分区布局（grid-cols-12）"描述
- `PackageBackdrop`、`ExerciseTagCloud`、`PackageChip` 全部不动
- typecheck 验证通过

## 技术栈

- React 19 + TypeScript 6 + Tailwind 4
- 项目既有的"网格系统"：flex flex-col 全屏层叠编排，背景用 absolute inset-0 铺满
- 不引入任何新技术或新依赖

## 实现方案

### 改动范围

**仅修改 `src/components/PackageHero.tsx`** 一个文件。

### 改动 1：恢复 `export function PackageHero() {` 函数声明

第 22 行（`import { PackageChip } from './PackageChip';`）之后、第 24 行（`const { t } = useTranslation();`）之前，插入缺失的 `export function PackageHero() {` 行。

### 改动 2：根容器回滚到 flex 布局

当前（错误）：

```
relative grid h-full min-h-[240px] grid-cols-12 items-center gap-x-4 overflow-hidden p-4 pl-2 pr-4
```

改为：

```
relative flex h-full min-h-[240px] flex-col overflow-hidden
```

理由：项目网格系统（"王国系统"）使用 `flex flex-col` 全屏层叠；`PackageBackdrop`（`absolute inset-0 z-10`）和 `ExerciseTagCloud`（`absolute inset-0 z-0`）都依赖父级是 flex/block 容器，才能自然铺满。改回 grid 会破坏这套层级关系。

### 改动 3：注释回滚

头部 doc 注释从"左右分区布局（grid-cols-12）"改回"全屏居中层叠（z-0 文字云 / z-10 图片 / z-20 编排）"的层级说明。恢复前几轮已确认过的注释内容。

## 不需要改动的

- `src/components/PackageBackdrop.tsx` —— 当前根容器已经是 `pointer-events-none absolute inset-0 z-10 overflow-hidden`（正确状态，不需要再改）
- `src/components/ExerciseTagCloud.tsx` —— 4 行 marquee + 30% 透明度 + text-sm 已完成
- `src/components/PackageChip.tsx` —— FLIP 动画已就位
- `src/styles/global.css` —— `--type-hero-title` 已是 32px/40px/700（与 timer-number 同步）

## 实施注意事项

- 只动 `PackageHero.tsx` 这一个文件，保持最小爆炸半径
- 改动后 `PackageBackdrop` 的 `absolute inset-0` 和 `ExerciseTagCloud` 的 `absolute inset-0 z-0` 自然铺满父 flex 容器，回到"图片在 z-10 遮住文字云中部、文字云在 z-0 露出左右上下边缘"的效果
- 标题 `<h2>` 用 `text-type-hero-title`（32px/40px/700），编排在 `z-20` 居中层叠
- 跑 `npm run typecheck` 验证