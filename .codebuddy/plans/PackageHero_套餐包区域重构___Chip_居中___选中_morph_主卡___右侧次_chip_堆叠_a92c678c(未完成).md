---
name: PackageHero 套餐包区域重构 — Chip 居中 → 选中 morph 主卡 + 右侧次 chip 堆叠
overview: 将 src/components/PackageHero.tsx 重构为：顶部常驻「今日推荐」主标题、默认态 3 个套餐 chip 横向平铺居中、点击后选中 chip 通过 shared layout 渐变成主套餐卡片（圆角/阴影/padding 插值）、另两个未选中 chip 用 FLIP 滑到主卡右侧垂直堆叠，背景层（3D 蒙版图 crossfade）与文字云层（17 个并集运动）作为氛围辅助，仅手动点击切换，整体柔和 0.35-0.45s 过渡。
design:
  architecture:
    framework: react
    component: shadcn
  styleKeywords:
    - Wellness
    - Editorial
    - Atmospheric
    - Soft Animation
    - 3D Silhouette
    - Text Cloud
    - Premium Minimalism
    - Shared Element Transition
  fontSystem:
    fontFamily: Geist-Variable
    heading:
      size: 16px
      weight: 700
    subheading:
      size: 12px
      weight: 500
    body:
      size: 13px
      weight: 500
  colorSystem:
    primary:
      - "#3B6EE6"
      - "#639AFF"
    background:
      - "#FFFFFF"
      - "#F5F5F5"
      - rgba(255,255,255,0.5)
    text:
      - "#1A1A1A"
      - "#5C5C5C"
    functional:
      - "#EBEBEB"
      - "#F2F2F2"
      - "#000000"
todos:
  - id: setup-assets-and-data
    content: 将 docs/蒙版组 1.png、蒙版组 2.png 移动到 src/assets/hero/pose-1.png、pose-2.png 并删除原文件；创建 src/data/packageTagCloudLayouts.ts 预设 17 个并集运动 ID 的坐标与统一字号 13px/500
    status: pending
  - id: create-auxiliary-layers
    content: 实现 src/components/PackageBackdrop.tsx（crossfade 两张图 + 顶部 mask 渐变 + 5s 呼吸缩放 + 接受 activeKey 控制显示组合）与 src/components/ExerciseTagCloud.tsx（17 个并集标签 absolute 定位 + 根据 currentPackageId 切换 text-foreground / text-muted-foreground）
    status: pending
    dependencies:
      - setup-assets-and-data
  - id: create-foreground-components
    content: "实现 src/components/PackageChip.tsx（chip 形态 + 主卡形态统一组件，受控 props: pkg, isMain, onSelect，使用 motion layoutId 共享元素动画，isMain 时显示完整卡片内容并内嵌文本 stagger）"
    status: pending
  - id: rewrite-package-hero
    content: 重写 src/components/PackageHero.tsx 为四层结构（背景 + 文字云 + 前景布局），含常驻「今日推荐」主标题、默认 selectedPackageId='package-standard'、chip 默认态居中横排 / 选中态主卡 + 次 chip 右 stack 由 motion layout 自动驱动
    status: pending
    dependencies:
      - create-auxiliary-layers
      - create-foreground-components
  - id: add-i18n-key
    content: "在 src/main.tsx 的 zhCN 与 enUS 资源中新增 package.sectionTitle: '今日推荐' / \"Today's Picks\""
    status: pending
    dependencies:
      - rewrite-package-hero
  - id: verify-build
    content: 运行 npm run typecheck 与 npm run build 验证无类型/构建错误，确认 ExerciseLibrary 集成无回归
    status: pending
    dependencies:
      - add-i18n-key
---

## z产品概述

重构 `ExerciseLibrary` 顶部的套餐 Hero 区域。采用「chip 默认态 ↔ 选中态主卡」的形态变化模式：默认 3 个套餐名称 chip 横向平铺居中（中间为默认主选），点击任一 chip 后该 chip morph 成完整的主套餐卡片（共享元素动画 + 内部文本 stagger），另两个未选 chip FLIP 滑到主卡右侧垂直堆叠。底层 3D 蒙版图 + 17 个并集文字云作为常驻氛围层（不参与形态变化），按当前选中套餐的并集关系重新染色。

## 核心功能

- **常驻主标题**：区域顶部始终显示「今日推荐」（i18n key `package.sectionTitle`）
- **默认形态**：3 个套餐 chip（仅名称）横向平铺居中，初始选中 index=1（起身唤醒包），其余两个 chip 与选中 chip 视觉上区分
- **选中形态**：被点击 chip morph 成主套餐卡片（圆角/padding/阴影同步插值），原 chip 位置被卡片"撑开"占据主区，另两个 chip FLIP 滑到主卡右侧垂直堆叠
- **形态切换动效**：
- chip → 卡片：`motion` `layoutId="package-main"` 共享元素动画，0.35s easeInOut，圆角/阴影/padding 通过 style 插值
- 未选 chip → 右侧垂直堆叠：`layout` prop 自动 FLIP，0.35s easeInOut
- 主卡内文本渐入：标题/统计/描述/CTA 错峰 stagger（delay 0.05/0.10/0.15/0.20s）
- **3D 蒙版图背景**：常驻，绝对定位，opacity 0.5，顶部 80px mask 渐变（向上淡出避免抢主卡焦点），5s ease-in-out 呼吸缩放 0.98↔1.02
- 套餐 → 蒙版图映射：quick→图2 树式；standard→图1 弓步；deep→图1+图2 叠加（都 opacity 0.35）
- 切换 crossfade 0.5s
- **文字云（瀑布流，并集）**：固定 17 个运动名称（3 套餐去重），统一字号字重 13px/500，absolute 定位瀑布流
- 颜色规则：当前选中套餐包含的运动 → `text-foreground`（深），未选中套餐的运动 → `text-muted-foreground`（浅）
- 切换时颜色 token 即时切换，标签位置不动
- 极轻微浮动（4s 错峰 translateY ±2px）作为常驻微动效
- **CTA 保留**：主卡底部「开始套餐」按钮，调用现有 `openExercisePanel(pkg.id)`
- **包络兼容**：`PackageHero` 维持无 props 接口，`ExerciseLibrary.tsx` 不动

## 涉及 i18n

新增 key：

- `package.sectionTitle`: `'今日推荐' / "Today's Picks"`

复用现有 key：

- `exercise.startPackage`、`time.minutes`、`exercise.repetitions`

## 技术栈

- 沿用现有栈：React 19 + TypeScript（strict） + Tailwind 4 + `motion`（已在 `PackageHero` 中使用，`from 'motion/react'`）+ `tw-animate-css` + shadcn `Button`
- 静态资源：Vite 静态资源 import，将 `docs/蒙版组 1.png`、`蒙版组 2.png` 移动到 `src/assets/hero/pose-1.png`、`pose-2.png`，`PackageBackdrop.tsx` 用 `import pose1 from '@/assets/hero/pose-1.png'` 引入以享受 hash 缓存
- 数据：复用 `src/data/exercises.ts` 中 `exercisePackages` + `exercises`，无后端改动

## 架构设计

采用四层视觉栈（z-index 自下而上）：

1. **背景层 `<PackageBackdrop>`**：绝对定位 + pointer-events-none + z-0，crossfade 两张图，opacity 0.5，顶部 mask 渐变，呼吸缩放
2. **文字云层 `<ExerciseTagCloud>`**：绝对定位 + pointer-events-none + z-10，17 个 span absolute 定位瀑布流，颜色由 `currentPackageId` 驱动
3. **前景布局层**（z-20）：包含三块

- 顶部：常驻「今日推荐」标题
- 中部：chip 居中 / 卡片左 + chip 右 stack（由 `selectedPackageId` 驱动 layout 切换）
- 底部：留白 + 频率提示

各层独立 `AnimatePresence`，key 为 `selectedPackageId`，实现"切换时各层同步过渡"。

## 关键实现策略

### 1. chip ↔ 卡片 morph（共享元素动画）

```
const isMain = pkg.id === selectedPackageId;
return (
  <motion.div
    layoutId={`package-card-${pkg.id}`}   // 关键：让 chip 和卡片是同一 layoutId
    layout
    transition={{ layout: { duration: 0.35, ease: 'easeInOut' } }}
    style={{
      borderRadius: isMain ? 18 : 9999,   // 圆角 morph
      boxShadow: isMain ? '0 10px 30px -5px rgba(0,0,0,0.15)' : 'none',
      padding: isMain ? 16 : '6px 14px',
    }}
    className={isMain ? 'bg-card text-card-foreground' : 'bg-muted text-muted-foreground'}
    onClick={() => setSelectedPackageId(pkg.id)}
  >
    {isMain ? <CardContent pkg={pkg} /> : <span className="text-xs font-medium">{pkg.name}</span>}
  </motion.div>
);
```

`motion` 自动测量前后 bounds 差做 transform 插值；圆角/阴影/内边距通过 inline `style` 让 motion 测量插值（不通过 Tailwind className 切换以避免突变）。

### 2. 未选 chip FLIP 到右侧

未选 chip 也用 `motion.div` + `layout`，当它从"中间位置"被重新布局到"右侧垂直 stack"时，`layout` 自动计算 FLIP 位移并插值。

### 3. 容器布局

```
<div className="flex h-full flex-col">
  <h2>{t('package.sectionTitle')}</h2>     {/* 顶部常驻 */}
  <div className="flex-1 flex items-center justify-center">
    <div className={isMainSelected ? 'flex gap-4' : 'flex gap-2'}>
      {/* 主卡 | 次 chip stack */}
    </div>
  </div>
</div>
```

选中套餐的 chip 占据主区（flex-1 或固定宽度），另两个 chip 在右侧用 `flex flex-col gap-2` 堆叠。

### 4. 蒙版图切换

`<PackageBackdrop>` 内部用 `AnimatePresence mode="sync"` + key=activeKey，deep 套餐时同时显示两张图（mode sync 叠加）。

### 5. 文字云颜色切换

`ExerciseTagCloud` 接收 `currentPackageId` + `exercisesInCurrentPackage: Set<string>`，对每个 tag 计算 `inCurrent ? 'text-foreground' : 'text-muted-foreground'`，无动画切换（颜色 token 即时变更，position 不动）。

### 6. 主卡内部文本 stagger

```
const textStagger = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.05, duration: 0.25 } }),
};
<motion.h3 custom={0} variants={textStagger} initial="hidden" animate="show">{pkg.name}</motion.h3>
```

### 7. 可访问性

- chip/卡片用 `<motion.button>`（按下时仍可点击），未选 chip `aria-pressed="false"`，主卡 `aria-pressed="true"`
- 主卡 `aria-live="polite"`，切换时屏幕阅读器播报套餐名

## 实现说明

- 文字云坐标硬编码在 `packageTagCloudLayouts.ts`（17 个标签 × {x%, y%, size}），便于后续按 Figma 调整
- 性能：17 个标签 + 2 张 PNG，无虚拟化需求；图片用 Vite 默认 hash 缓存
- 不引入新依赖，不修改 `ExerciseLibrary.tsx`、`store/index.ts`、`tauri`、Rust
- 标签切换顺序：默认 `selectedPackageId = 'package-standard'`（让最常用套餐在默认居中位置）
- 切换套餐的视觉重心保持在主卡，不会让整列布局上下抖动（因为 chip 区域高度相对稳定）

## 目录结构

```
src/
├── components/
│   ├── PackageHero.tsx                    # [MODIFY] 重写为四层结构（~280 行）
│   ├── PackageChip.tsx                    # [NEW] chip 形态 + 主卡形态统一组件（~80 行），受控 props: pkg, isMain, onSelect
│   ├── ExerciseTagCloud.tsx               # [NEW] 文字云组件（~70 行），props: currentPackageId, exercisesInCurrentPackage
│   └── PackageBackdrop.tsx                # [NEW] 蒙版图背景层（~50 行），props: imageA, imageB, activeKey
├── data/
│   └── packageTagCloudLayouts.ts          # [NEW] 17 个并集运动 ID 预设坐标/字号（~80 行）
└── assets/
    └── hero/                              # [NEW] 静态资源目录
        ├── pose-1.png                     # 弓步剪影（从 docs 移动）
        └── pose-2.png                     # 树式剪影（从 docs 移动）
docs/
└── 蒙版组 1.png, 蒙版组 2.png             # [DELETE] 移动到 src/assets/hero/ 后删除
```

## 动效设计

- **形态切换过渡**（点击未选 chip / 点击主卡）：
- chip → 卡片 morph：`layoutId` 共享 + `layout` 自动插值，0.35s easeInOut
- 未选 chip → 右侧垂直 stack：`layout` FLIP，0.35s easeInOut
- 主卡内部文本 stagger：delay 0.05/0.10/0.15/0.20s，0.25s ease
- 背景 crossfade：0.5s
- 文字云颜色：即时切换（无过渡）
- **常驻微动效**：
- 蒙版图呼吸缩放（5s ease-in-out 0.98↔1.02）
- 文字云极轻微浮动（4s 错峰，translateY ±2px）
- chip hover：`bg-muted/80 → bg-muted` 过渡 0.15s

## 字体系统

- Heading（区域主标题「今日推荐」）：18px / 600 / 28px
- Heading（套餐卡片名）：16px / 700 / 24px
- Subheading（次套餐 chip、统计）：12px / 500 / 18px
- Body（描述、文字云）：13px / 500 / 18px（统一，不再按 priority 分）
- Caption（frequency）：10-12px / 400 / 16-18px

## 颜色系统

- Primary：oklch blue #3B6EE6（主卡 CTA、选中 chip 形态）
- Foreground：#1A1A1A（主卡标题、当前套餐的文字云标签）
- Muted-foreground：#5C5C5C（描述、frequency、未选中套餐的文字云标签、次 chip 文字）
- Muted：#F5F5F5（次 chip 默认背景）
- Card：#FFFFFF（主卡底）
- Border：#EBEBEB（主卡边框）
- 文字云颜色：仅用 `text-foreground` / `text-muted-foreground` 两个 token，无透明度梯度
- 蒙版图：容器 opacity 0.5 + 顶部 mask 渐变，dark 模式通过 data-theme 切换保持一致观感

## 响应式

当前窗口 492×696 固定，无需响应式断点；组件用 `h-full flex flex-col` 占满 PackageHero 父容器

## 设计风格

**Premium Wellness / Editorial Sports — chip morph 编排型 Hero**

整体走"低饱和 + 大留白 + 柔和动效 + 编排式形态变化"路线。底层两张 3D 白色人体剪影（弓步 + 树式）配 17 个并集运动名称文字云作为常驻氛围层，顶部「今日推荐」常驻主标题，下方是"3 chip 居中 ↔ 1 主卡 + 2 次 chip 右 stack"的编排式形态。形态切换由 `motion` 的 `layoutId` 共享元素 + `layout` FLIP 驱动，0.35s 柔和过渡，圆角/阴影/padding 通过 style 同步插值。

## 视觉分层（z-index 自下而上）

1. **背景层**（z-0）：两张 3D 白色人体剪影 PNG，opacity 0.5，顶部 80px mask 渐变（向上淡出避免干扰主卡），5s ease-in-out 呼吸缩放 0.98↔1.02，crossfade 切换（0.5s）
2. **文字云层**（z-10）：17 个运动名称（并集），统一字号字重 13px/500，absolute 定位瀑布流；当前套餐包含的运动用 `text-foreground`（深），未选中套餐的运动用 `text-muted-foreground`（浅），切换时颜色即时切换，标签位置不动；极轻微浮动
3. **前景层**（z-20）：

    - 顶部：常驻主标题「今日推荐」（text-lg font-semibold，居中或居左对齐）
    - 中部布局（由 selectedPackageId 驱动 layout 切换）：
        - **默认态**：3 chip 横向平铺居中，间距 8px，chip 是 `rounded-full bg-muted text-muted-foreground px-3 py-1.5 text-xs font-medium`；默认选中的 chip（起身唤醒包，index=1）视觉稍强化：背景 `bg-primary/10 text-primary font-semibold`
        - **选中态**：被点击 chip morph 成主套餐卡片（`rounded-2xl bg-card border border-border shadow-xl p-4`），主卡占据主区（flex-1 宽度），另两个未选 chip 在主卡右侧用 `flex flex-col gap-2` 垂直堆叠，chip 视觉降为次要
    - 主卡内容（卡片态时显示，chip 态时隐藏）：
        - 顶行：图标 + 套餐名（text-base font-bold 700）
        - 副行：duration + exercises 数量（text-xs text-primary）
        - 描述段：text-sm text-muted-foreground，2 行 line-clamp
        - 底行：frequency（text-xs text-muted-foreground）+ 「开始套餐」次按钮（右对齐）

## 切换编排

- 点击未选 chip → 该 chip morph 成主卡（layoutId 共享元素动画），原位置被卡片"撑开"；另两个未选 chip 自动重新布局到主卡右侧垂直 stack
- 点击主卡 → 无变化（已选中）
- 切换过程中：背景 crossfade + 文字云颜色即时切换 + 主卡内文本错峰 stagger 渐入

## 动效细则

- 形态切换：layoutId 共享 + layout FLIP，0.35s easeInOut
- 主卡内文本 stagger：delay 0.05/0.10/0.15/0.20s，0.25s ease
- 蒙版图呼吸：5s ease-in-out 0.98↔1.02
- 文字云浮动：4s 错峰 translateY ±2px
- chip hover：bg-muted/80 → bg-muted 过渡 0.15s

## 设计 Token 复用

- 颜色：oklch blue primary #3B6EE6 + 语义色（foreground/muted-foreground/muted/card/border），不引入新色彩
- 字体：Geist Variable，heading 16-18px / body 13-14px / caption 10-12px
- 圆角：chip `9999px`（pill），主卡 `rounded-2xl` (18px)
- 阴影：chip 无；主卡 `shadow-xl`