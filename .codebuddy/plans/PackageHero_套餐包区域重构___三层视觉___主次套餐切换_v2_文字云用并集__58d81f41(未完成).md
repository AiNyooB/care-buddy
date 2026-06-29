---
name: PackageHero 套餐包区域重构 — 三层视觉 + 主次套餐切换（v2：文字云用并集）
overview: 将 src/components/PackageHero.tsx 从「单卡 + 字母选择器」重构为「底层 3D 蒙版图 crossfade + 中层运动名称文字云（3 套餐并集，按选中状态区分深浅颜色） + 上层套餐文字 + 主次缩放切换」的三层结构，三个套餐一主两次，仅手动点击切换，柔和过渡动效。
design:
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
  - id: move-hero-assets
    content: 将 docs/蒙版组 1.png、蒙版组 2.png 移动到 src/assets/hero/pose-1.png、pose-2.png 并删除原文件
    status: pending
  - id: create-tagcloud-layouts
    content: 在 src/data/packageTagCloudLayouts.ts 中预设 17 个并集运动 ID 的坐标、字号（统一 13px/500）
    status: pending
    dependencies:
      - move-hero-assets
  - id: create-package-backdrop
    content: 实现 src/components/PackageBackdrop.tsx：crossfade 两张图、顶部 mask 渐变、5s 呼吸缩放、接受 activeKey 控制显示组合
    status: pending
    dependencies:
      - move-hero-assets
  - id: create-exercise-tagcloud
    content: 实现 src/components/ExerciseTagCloud.tsx：17 个并集标签 absolute 定位，根据 currentPackageId 切换 text-foreground / text-muted-foreground
    status: pending
    dependencies:
      - create-tagcloud-layouts
  - id: rewrite-package-hero
    content: 重写 src/components/PackageHero.tsx 为四层结构（背景 + 文字云 + 主卡 + 顶部次套餐 chip），柔和过渡 0.35s
    status: pending
    dependencies:
      - create-package-backdrop
      - create-exercise-tagcloud
  - id: verify-build-typecheck
    content: 运行 npm run typecheck 与 npm run build 验证无类型/构建错误
    status: pending
    dependencies:
      - rewrite-package-hero
---

## 产品概述

重构 `ExerciseLibrary` 顶部的套餐 Hero 区域。底层用两张 3D 白色人物剪影图（弓步、树式）作为氛围背景，中层是 3 个套餐包含运动的**并集**文字云（17 个固定标签），上层是当前选中套餐的文字介绍。三个套餐呈现「一主两次」主次关系；用户手动点击切换，伴随柔和过渡动效。

## 核心功能

- **手动切换**：3 个套餐通过顶部次套餐 chip（仅名称）+ 主套餐卡片点击切换，无自动轮播
- **3D 蒙版图背景**：两张图按套餐切换，opacity 0.5 + 顶部 mask 渐变（向上淡出避免抢焦点）+ 缓慢呼吸缩放（5s ease-in-out 0.98↔1.02）
- **文字云（瀑布流，并集）**：固定展示 3 套餐去重后的 17 个运动名称，**统一字号字重**，不按 priority 区分。颜色规则：当前选中套餐包含的运动 → `text-foreground`（深），未选中套餐的运动 → `text-muted-foreground`（浅）。切换套餐时颜色重新染色，标签本身的位置不动
- **主次视觉**：主套餐卡片 1.08× scale、`shadow-lg` 增强、标题字重 700；次套餐在主卡上方以小号 chip 横向排列（点击可切）
- **柔和过渡动效**：`motion` `AnimatePresence mode="wait"`，各层元素 staggered fade + y 位移，时长 0.35s easeInOut
- **CTA 保留**：主套餐卡片底部保留「开始套餐」按钮，调用现有 `openExercisePanel(pkg.id)`
- **包络兼容**：`PackageHero` 维持无 props 接口，`ExerciseLibrary.tsx` 不动

## 技术栈

- 沿用现有栈：React 19 + TypeScript（strict） + Tailwind 4 + `motion` + `tw-animate-css` + shadcn `Button`
- 静态资源：Vite 静态资源 import，将 `docs/蒙版组 1.png`、`蒙版组 2.png` 移动到 `src/assets/hero/pose-1.png`、`pose-2.png`，`PackageHero.tsx` 用 `import pose1 from '@/assets/hero/pose-1.png'` 引入以享受 hash 缓存
- 数据：复用 `src/data/exercises.ts` 中 `exercisePackages` + `exercises`（无需 priorityLabels）

## 架构设计

采用四层视觉栈（z-index 自下而上）：

1. **背景层 `<PackageBackdrop>`**：绝对定位，crossfade 两张图，opacity 0.5，顶部 mask 渐变，呼吸缩放
2. **文字云层 `<ExerciseTagCloud>`**：absolute 定位的 17 个 span 集合，从 `data/packageTagCloudLayouts.ts` 读预设坐标/字号；颜色由 `currentPackageId` 驱动（`text-foreground` / `text-muted-foreground`）
3. **次套餐 chip 行**：横向排列的 3 个 button（仅名称），选中态 primary
4. **主套餐卡片 `<PackageShowcase>`**：图标 + 标题 + 统计 + 描述 + 频率 + 「开始套餐」CTA

## 关键实现策略

- **包络兼容**：`PackageHero` 仍为无 props 组件，签名不变
- **次套餐 chip**：`<button aria-pressed>` + `rounded-full`，选中态 `bg-primary text-primary-foreground`、未选 `bg-muted text-muted-foreground`，点击同步 `setSelectedIndex`
- **主套餐卡片**：`motion.div` 包裹，`animate={{ scale: 1.08 }}`、`box-shadow` 用 `shadow-lg` → `shadow-xl` 过渡
- **蒙版图切换**：在背景层内部用 `AnimatePresence mode="sync"`，进入 `opacity 0 → 0.5`，退出 `opacity 0.5 → 0`，时长 0.5s
- **文字云颜色切换**：每个 tag 根据其 `exerciseId` 是否在 `exercisePackages[currentIndex].exercises` 集合中 → `text-foreground` 或 `text-muted-foreground`；位置（x/y/字号/基础透明度）保持不变，仅颜色 token 切换
- **第三张图（深度包）策略**：`package-deep` 同时映射到两张图叠加显示（都 opacity 0.35）
- **i18n**：复用现有 `t('exercise.startPackage')`、`t('time.minutes')`、`t('exercise.repetitions')`
- **可访问性**：chip 用 `<button aria-pressed>`；主卡提供 `aria-live="polite"` 区域

## 实现说明

- 文字云坐标硬编码在 `packageTagCloudLayouts.ts`（17 个标签 × {x%, y%, size, opacity}），便于后续按 Figma 调整
- 性能：17 个标签，无虚拟化需求；图片用 Vite 默认 8KB+ hash 缓存
- 不引入新依赖，不修改 `ExerciseLibrary.tsx`、`store/index.ts`、`tauri`、Rust

## 目录结构

```
src/
├── components/
│   ├── PackageHero.tsx              # [MODIFY] 重写为四层结构（~220 行）
│   ├── ExerciseTagCloud.tsx         # [NEW] 文字云组件（~70 行），受控 props: currentPackageId
│   └── PackageBackdrop.tsx          # [NEW] 蒙版图背景层（~50 行），props: imageA, imageB, activeKey
├── data/
│   └── packageTagCloudLayouts.ts    # [NEW] 17 个并集运动 ID 预设坐标/字号（~80 行）
└── assets/
    └── hero/                        # [NEW] 静态资源目录
        ├── pose-1.png               # 弓步剪影（从 docs 移动）
        └── pose-2.png               # 树式剪影（从 docs 移动）
docs/
└── 蒙版组 1.png, 蒙版组 2.png       # [DELETE] 移动到 src/assets/hero/ 后删除
```

## 动效设计

- **切换过渡**（手动点击 chip / 主卡）：
- 主卡：opacity 0→1 + y 12→0 + scale 0.96→1.08，0.35s easeInOut
- 文字云：颜色 token 切换无动画（即时），标签极轻微 stagger fade（每标签 delay 0.015s），0.25s
- 背景：crossfade 0.5s
- **常驻微动效**：
- 蒙版图呼吸（5s）
- 文字云极轻微浮动（4s 错峰，translateY ±2px）
- 次套餐 chip hover：bg-muted/80 → bg-muted 过渡 0.15s

**Premium Wellness / Editorial Sports**：以 3D 白色人体剪影 + 浮动运动名称文字云为氛围层，前景主套餐卡片承担"主舞台"。整体走"低饱和 + 大留白 + 柔和动效"路线，呼应 app 现有的 oklch blue 主题（primary #3B6EE6）与 Geist Variable 字体，不引入新色彩 token。

## 视觉分层（z-index 自下而上）

1. **背景层**：两张 3D 白色人体剪影 PNG，opacity 0.5，顶部 80px mask 渐变（向上淡出避免干扰主卡），5s ease-in-out 呼吸缩放 0.98↔1.02，crossfade 切换（0.5s）
2. **文字云层**：17 个运动名称（并集），统一字号字重（如 13px / 500），absolute 定位瀑布流，当前套餐包含的运动用 `text-foreground`（深），未选中套餐的运动用 `text-muted-foreground`（浅），切换套餐时颜色 token 切换，标签位置不动
3. **次套餐 chip 行**：3 个 chip pill（仅名称），选中态 primary，其他 muted，h-7 px-3 text-xs
4. **主套餐卡片**（1.08× scale、shadow-xl 增强、padding-4）：

- 顶行：图标 + 套餐名（text-base font-bold 700）
- 副行：duration + exercises 数量（text-xs text-primary）
- 描述段：text-sm text-muted-foreground，2 行 line-clamp
- 底行：frequency + 「开始套餐」次按钮

## 字体系统

- Heading（套餐名）：16px / 700 / 24px
- Subheading（次套餐 chip、统计）：12px / 500 / 18px
- Body（描述、文字云）：13px / 500 / 18px（统一，不再按 priority 分）
- Caption（frequency）：10-12px / 400 / 16-18px

## 颜色系统

- Primary：oklch blue #3B6EE6（主卡 CTA、选中 chip）
- Foreground：#1A1A1A（主卡标题、当前套餐的文字云标签）
- Muted-foreground：#5C5C5C（描述、frequency、未选中套餐的文字云标签）
- Muted：#F5F5F5（次 chip 默认背景）
- Card：#FFFFFF（主卡底）
- Border：#EBEBEB（主卡边框）
- 文字云颜色：**仅用 `text-foreground` / `text-muted-foreground` 两个 token**，无透明度梯度
- 蒙版图：filter brightness 1 + 容器 opacity 0.5，dark 模式通过 data-theme 切换保持一致观感

## 响应式

当前窗口 492×696 固定，无需响应式断点；组件用 `h-full flex flex-col` 占满 PackageHero 父容器