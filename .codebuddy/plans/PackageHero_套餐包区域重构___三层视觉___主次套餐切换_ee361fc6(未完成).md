---
name: PackageHero 套餐包区域重构 — 三层视觉 + 主次套餐切换
overview: 将 src/components/PackageHero.tsx 从「单卡 + 字母选择器」重构为「底层 3D 蒙版图 crossfade + 中层运动名称文字云 + 上层套餐文字 + 主次缩放切换」的三层结构，三个套餐一主两次，仅手动点击切换，柔和过渡动效。
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
  fontSystem:
    fontFamily: Geist-Variable
    heading:
      size: 16px
      weight: 700
    subheading:
      size: 12px
      weight: 500
    body:
      size: 14px
      weight: 400
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
  - id: move-hero-assets
    content: 将 docs/蒙版组 1.png、蒙版组 2.png 移动到 src/assets/hero/pose-1.png、pose-2.png 并删除原文件，使用 [skill:多模态内容生成] 仅在用户后续要求生成额外 3D 姿势时调用
    status: pending
  - id: create-tagcloud-layouts
    content: 在 src/data/packageTagCloudLayouts.ts 中预设 3 套餐的运动标签坐标、字号、透明度梯度（按 priority 区分）
    status: pending
    dependencies:
      - move-hero-assets
  - id: create-package-backdrop
    content: 实现 src/components/PackageBackdrop.tsx：crossfade 两张图、顶部 mask 渐变、5s 呼吸缩放、接受 activeKey 控制显示组合
    status: pending
    dependencies:
      - move-hero-assets
  - id: create-exercise-tagcloud
    content: 实现 src/components/ExerciseTagCloud.tsx：absolute 定位渲染当前套餐运动名称，stagger 渐入、极轻微浮动、AnimatePresence 渐出
    status: pending
    dependencies:
      - create-tagcloud-layouts
  - id: rewrite-package-hero
    content: 重写 src/components/PackageHero.tsx 为三层结构（背景 + 文字云 + 前景主卡 + 顶部次套餐 chip），保持无 props 接口与现有 openExercisePanel 调用，柔和过渡动效 0.35s
    status: pending
    dependencies:
      - create-package-backdrop
      - create-exercise-tagcloud
  - id: verify-build-typecheck
    content: 运行 npm run typecheck 与 npm run build 验证无类型/构建错误，确认 ExerciseLibrary 集成无回归
    status: pending
    dependencies:
      - rewrite-package-hero
---

## 产品概述

重构 `ExerciseLibrary` 顶部的套餐 Hero 区域。底层用两张 3D 白色人物剪影图（弓步、树式）作为氛围背景，中层是该套餐包含的运动名称文字云，上层是当前选中套餐的文字介绍，三个套餐呈现「一主两次」主次关系；用户手动点击切换，伴随柔和过渡动效（标题、辅助文字渐入渐出）。

## 核心功能

- **手动切换**：3 个套餐通过顶部次套餐 chip（仅名称）+ 主套餐卡片点击/箭头切换，无自动轮播
- **3D 蒙版图背景**：两张图按套餐切换，opacity 0.5 + 顶部 mask 渐变（向上淡出避免抢焦点）+ 缓慢呼吸缩放（5s ease-in-out 0.98↔1.02）
- **文字云（瀑布流）**：展示当前套餐 `exercises` 数组中所有运动名称，按 `priority` 区分字号与透明度（core 字号大、透明度高；supplement 字号小、透明度低），用 `AnimatePresence` 让标签随切换渐入渐出 + 极轻微浮动
- **主次视觉**：主套餐卡片 1.08× scale、`shadow-lg` 增强、标题字重 700；次套餐在主卡上方以小号 chip 横向排列（hover 可切）
- **柔和过渡动效**：`motion` `AnimatePresence mode="wait"`，各层元素 staggered fade + y 位移 8px，时长 0.35s easeInOut
- **CTA 保留**：主套餐卡片底部保留「开始套餐」按钮，调用现有 `openExercisePanel(pkg.id)`
- **包络兼容**：`PackageHero` 维持无 props 接口，`ExerciseLibrary.tsx` 不动

## 技术栈

- 沿用现有栈：React 19 + TypeScript（strict） + Tailwind 4 + `motion`（framer-motion）+ `tw-animate-css` + shadcn `Button`
- 静态资源：Vite 静态资源 import，将 `docs/蒙版组 1.png`、`蒙版组 2.png` 移动到 `src/assets/hero/pose-1.png`、`pose-2.png`，`PackageHero.tsx` 用 `import pose1 from '@/assets/hero/pose-1.png'` 引入以享受 hash 缓存
- 数据：复用 `src/data/exercises.ts` 中 `exercisePackages` + `exercises` + `priorityLabels`，无后端改动

## 架构设计

采用三层视觉栈（z-index 自下而上）：

1. **背景层 `<PackageBackdrop>`**：绝对定位，crossfade 两张图，opacity 0.5，顶部 mask 渐变，呼吸缩放
2. **文字云层 `<ExerciseTagCloud>`**：相对定位/absolute，absolute 定位的 span 集合，从 `data/packageTagCloudLayouts.ts` 读预设坐标/字号/透明度
3. **前景层 `<PackageShowcase>`**：包含顶部次套餐 chip 行 + 中间主套餐卡片（含标题/统计/描述/CTA）

各层独立 `AnimatePresence`，key 为 `selectedIndex`，实现"切换时各层同步过渡"。

## 关键实现策略

- **包络兼容**：`PackageHero` 仍为无 props 组件，签名不变
- **次套餐 chip**：用 `<button>` + `rounded-full`，选中态 `bg-primary text-primary-foreground`、未选 `bg-muted text-muted-foreground`，点击同步 `setSelectedIndex`
- **主套餐卡片**：`motion.div` 包裹，`animate={{ scale: 1.08 }}`、`box-shadow` 用 `shadow-lg` → `shadow-xl` 过渡
- **蒙版图切换**：在背景层内部用 `AnimatePresence mode="sync"`，进入用 `opacity 0 → 0.5`，退出 `opacity 0.5 → 0`，时长 0.5s；同一时间只有一张可见
- **文字云动画**：每个 tag 是 `motion.span`，`initial={{ opacity: 0, y: 6 }}`，`animate={{ opacity: targetOpacity, y: 0 }}`，`exit={{ opacity: 0, y: -6 }}`，`transition={{ duration: 0.3, delay: i * 0.02 }}` 形成轻量 stagger
- **第三张图（深度包）策略**：在 `packageBackdropMap` 中将 `package-deep` 同时映射到两张图，使用 `mode="sync"` 让两张图叠加显示（都 opacity 0.35），体现"广度"
- **i18n**：复用现有 `t('exercise.startPackage')`、`t('time.minutes')`、`t('exercise.repetitions')`，无需新增 key
- **可访问性**：chip 用 `<button aria-pressed>`；主卡提供 `aria-live="polite"` 区域

## 实现说明

- 复用现有 `priorityLabels` 颜色 + 透明度梯度，避免新增颜色 token
- 文字云坐标硬编码在 `packageTagCloudLayouts.ts`（3 套餐 × N 标签 × {x%, y%, size, opacity}），便于后续按 Figma 调整
- 性能：标签数 ≤ 15（最大套餐深度包），无虚拟化需求；图片用 Vite 默认 8KB+ hash 缓存
- 不引入新依赖，不修改 `ExerciseLibrary.tsx`、`store/index.ts`、`tauri`、Rust

## 目录结构

```
src/
├── components/
│   ├── PackageHero.tsx              # [MODIFY] 重写为三层结构（~220 行）
│   ├── ExerciseTagCloud.tsx         # [NEW] 文字云组件（~70 行），受控 props: exercises, layout, priorityMap
│   └── PackageBackdrop.tsx          # [NEW] 蒙版图背景层（~50 行），props: imageA, imageB, activeKey
├── data/
│   └── packageTagCloudLayouts.ts    # [NEW] 3 套餐 × N 标签预设坐标/字号/透明度（~80 行）
├── assets/
│   └── hero/                        # [NEW] 静态资源目录
│       ├── pose-1.png               # 弓步剪影（从 docs 移动）
│       └── pose-2.png               # 树式剪影（从 docs 移动）
└── hooks/
    └── usePackageBackdropMap.ts     # [NEW] 套餐 → 蒙版图映射 hook（~15 行），返回 { srcA, srcB?, mode }
docs/
└── 蒙版组 1.png, 蒙版组 2.png       # [DELETE] 移动到 src/assets/hero/ 后删除（避免重复）
```

## 设计风格

**Premium Wellness / Editorial Sports**：以 3D 白色人体剪影 + 浮动运动名称文字云为氛围层，前景主套餐卡片承担"主舞台"。整体走"低饱和 + 大留白 + 柔和动效"路线，呼应 app 现有的 oklch blue 主题（primary #3B6EE6）与 Geist Variable 字体，不引入新色彩 token。

## 视觉分层（z-index 自下而上）

1. **背景层**：两张 3D 白色人体剪影 PNG，opacity 0.5，顶部 80px mask 渐变（向上淡出避免干扰主卡），5s ease-in-out 呼吸缩放 0.98↔1.02，crossfade 切换（0.5s）
2. **文字云层**：当前套餐运动名称集合，按 priority 映射字号/字重/透明度（core 14px/600/0.85、strong 12px/500/0.55、recommend 11px/500/0.4、supplement 10px/400/0.3），absolute 定位，预设 3 套餐不同的坐标布局，每个 tag 极轻微浮动（translateY 4s 循环）
3. **前景层**：

- 顶部：次套餐 chip 行（横向，3 个 chip pill，仅名称，选中态 primary，其他 muted，h-7 px-3 text-xs）
- 中部：主套餐卡片（1.08× scale、shadow-xl 增强、padding-4，渐入 y=12px）
    - 顶行：图标 + 套餐名（text-base font-bold 700）
    - 副行：duration + exercises 数量（text-xs text-primary）
    - 描述段：text-sm text-muted-foreground，2 行 line-clamp
    - 底行：frequency + 「开始套餐」次按钮

## 动效设计

- **切换过渡**（手动点击 chip / 主卡）：
- 主卡：opacity 0→1 + y 12→0 + scale 0.96→1.08，0.35s easeInOut
- 文字云：stagger fade（每标签 delay 0.02s），0.3s
- 背景：crossfade 0.5s
- **常驻微动效**：
- 蒙版图呼吸（5s）
- 文字云极轻微浮动（4s 错峰，translateY ±2px）
- 次套餐 chip hover：bg-muted/80 → bg-muted 过渡 0.15s

## 字体系统

- Heading（套餐名）：16px / 700 / 24px
- Subheading（次套餐 chip、统计）：12px / 500 / 18px
- Body（描述、tag cloud 强）：14px / 400-600 / 20px
- Caption（tag cloud 弱、frequency）：10-12px / 400 / 16-18px

## 颜色系统

- Primary：oklch blue #3B6EE6（主卡 CTA、选中 chip）
- Foreground：#1A1A1A（主卡标题）
- Muted-foreground：#5C5C5C（描述、frequency）
- Muted：#F5F5F5（次 chip 默认背景）
- Card：#FFFFFF（主卡底）
- Border：#EBEBEB（主卡边框）
- 文字云：纯前景色（#1A1A1A）通过 opacity 梯度区分层级
- 蒙版图：filter brightness 1 + 容器 opacity 0.5，dark 模式自动通过 data-theme 切换保持一致观感

## 响应式

当前窗口 492×696 固定，无需响应式断点；组件用 `h-full flex flex-col` 占满 PackageHero 父容器