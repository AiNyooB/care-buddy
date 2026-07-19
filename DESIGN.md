---
name: CareBuddy
description: A lightweight desktop health reminder app for natural work-rest rhythms
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.14 0 0)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.14 0 0)"
  popover: "oklch(1 0 0)"
  popover-foreground: "oklch(0.14 0 0)"
  primary: "oklch(0.60 0.19 263)"
  primary-foreground: "oklch(0.985 0 0)"
  secondary: "oklch(0.95 0 0)"
  secondary-foreground: "oklch(0.205 0 0)"
  muted: "oklch(0.965 0 0)"
  muted-foreground: "oklch(0.40 0 0)"
  accent: "oklch(0.94 0 0)"
  accent-foreground: "oklch(0.205 0 0)"
  destructive: "oklch(0.60 0.20 27)"
  destructive-foreground: "oklch(0.985 0 0)"
  success: "oklch(0.55 0.16 160)"
  warning: "oklch(0.60 0.17 85)"
  border: "oklch(0.922 0 0)"
  input: "oklch(0.922 0 0)"
  ring: "oklch(0.60 0.19 263)"
  overlay: "oklch(0 0 0 / 0.85)"
  chart-1: "oklch(0.546 0.245 262.881)"
  chart-2: "oklch(0.6 0.118 184.704)"
  chart-3: "oklch(0.55 0.18 227)"
  chart-4: "oklch(0.65 0.17 84)"
  chart-5: "oklch(0.60 0.19 70)"
  dark-background: "oklch(0.12 0 0)"
  dark-foreground: "oklch(0.95 0 0)"
  dark-card: "oklch(0.18 0 0)"
  dark-card-foreground: "oklch(0.95 0 0)"
  dark-popover: "oklch(0.18 0 0)"
  dark-popover-foreground: "oklch(0.95 0 0)"
  dark-primary: "oklch(0.65 0.18 263)"
  dark-primary-foreground: "oklch(0.12 0 0)"
  dark-secondary: "oklch(0.24 0 0)"
  dark-secondary-foreground: "oklch(0.985 0 0)"
  dark-muted: "oklch(0.255 0 0)"
  dark-muted-foreground: "oklch(0.70 0 0)"
  dark-accent: "oklch(0.23 0 0)"
  dark-accent-foreground: "oklch(0.985 0 0)"
  dark-destructive: "oklch(0.65 0.20 27)"
  dark-destructive-foreground: "oklch(0.12 0 0)"
  dark-border: "oklch(1 0 0 / 0.1)"
  dark-input: "oklch(1 0 0 / 0.15)"
  dark-ring: "oklch(0.65 0.18 263)"
  dark-overlay: "oklch(0 0 0 / 0.92)"
typography:
  display:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "40px"
  headline:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: "32px"
  title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "24px"
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  caption:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "18px"
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: "18px"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  "2xl": "18px"
  "3xl": "22px"
  "4xl": "26px"
spacing:
  "0_5": "2px"
  "1": "4px"
  "1_5": "6px"
  "2": "8px"
  "2_5": "10px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "14": "56px"
  "16": "64px"
components:
  button:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "8px 10px"
  button-outline:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    borderColor: "{colors.border}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: transparent
    rounded: "{rounded.lg}"
    borderColor: "{colors.input}"
    padding: "8px 10px"
  dialog:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.xl}"
    padding: "0"
---

# Design System: CareBuddy

## 1. Overview

**Creative North Star: "The Gentle Rhythm"**

CareBuddy's interface is designed to be felt, not seen. Every visual decision—from the muted color palette to the compact window size—serves a single goal: stay in the background until needed, then present information clearly without urgency. This is a health tool that trusts the user to make their own choices; the UI never demands attention, never flashes or pulses urgency, and never obstructs the user's primary work.

The system is a modern minimal shadcn base-nova implementation: clean borders, rounded cards, light shadows, and a restrained blue accent used sparingly. It rejects gamified progress bars, bright saturated colors, cluttered dashboards, and any UI pattern that distracts from the user's work.

**Key Characteristics:**
- Compact and purposeful — 492×696 window, every pixel earns its place
- Blue accent (primary) used on ≤10% of any screen
- Light/dark themes with smooth transitions
- No onboarding, no tooltip spam — the user knows their computer
- Floating capsule window for entertainment mode

## 2. Colors: The Slate Blue Palette

A restrained palette built around a subdued blue accent (`oklch(0.60 0.19 263)`) with near-chromatic neutrals. The accent appears only on interactive elements (focus rings, primary buttons, active toggles), never as decorative color. Both light and dark themes carry the same hue at different lightness levels; the accent shifts slightly brighter in dark mode (`oklch(0.65 0.18 263)`) for legibility on dark surfaces.

### Primary
- **Slate Blue** (`oklch(0.60 0.19 263)`): Buttons, focus rings, active switches, links. Never used for backgrounds, borders, or decorative elements.
- **dark-Slate Blue** (`oklch(0.65 0.18 263)`): Same role, slightly lighter for WCAG contrast on dark backgrounds.

### Neutral
- **White** (`oklch(1 0 0)`): Light theme card/popover/body background.
- **Near Black** (`oklch(0.14 0 0)`): Light theme foreground (body text, headings).
- **Silver** (`oklch(0.922 0 0)`): Borders, input strokes.
- **Muted Silver** (`oklch(0.965 0 0)`): Light theme muted backgrounds (hover states, disabled fields).
- **Steel** (`oklch(0.40 0 0)`): Secondary text, placeholders, captions.

### State
- **Soft Green** (`oklch(0.55 0.16 160)`): Success states.
- **Soft Amber** (`oklch(0.60 0.17 85)`): Warnings.
- **Soft Red** (`oklch(0.60 0.20 27)`): Destructive actions, errors.

### Dark Theme
- **Charcoal** (`oklch(0.12 0 0)`): Dark theme body background.
- **Dark Card** (`oklch(0.18 0 0)`): Cards and popovers.
- **Dark Border** (`oklch(1 0 0 / 0.1)`): Borders on dark surfaces.
- **Light Silver** (`oklch(0.70 0 0)`): Muted foreground on dark.

### Named Rules
**The Accent Restraint Rule.** Primary blue is used on ≤10% of any screen surface. Its rarity preserves its signal value. Never use the accent for backgrounds, decorative borders, or non-interactive elements.

## 3. Typography

**Body Font:** Geist Variable (sans-serif)

**Character:** Clean, neutral, and compact. Geist at `text-sm` (14px) body reads comfortably at the app's compact window size without feeling cramped. The variable weight axis allows subtle differentiation without adding font files.

### Hierarchy
- **Display** (700, 32px, 40px): Hero lock-screen timer and app title. Only in lock-screen context.
- **Headline** (700, 18px, 32px): Page titles, modal headers.
- **Title** (600, 16px, 24px): Section headings, card titles.
- **Body** (400, 14px, 20px): Primary reading text. All settings labels, descriptions, and task names.
- **Caption** (400, 12px, 18px): Secondary descriptions, timestamps, hints.
- **Micro** (400, 10px, 14px): Minimum legible size; used sparingly.
- **Badge / Label** (500, 12px, 18px): Badges, tags, field labels.
- **Timer Number** (700, 32px, 40px): Countdown display in lock screen.
- **Lock Timer** (700, 40px, 50px): Main lock-screen countdown.

### Named Rules
**The Single Family Rule.** One font family across all roles. Geist Variable covers every weight and size need. No serif, mono, or display fonts.

## 4. Elevation

The system uses light shadows with low opacity to distinguish interactive surfaces from static content. Shadows are warm and subtle (black with 5–25% opacity), never dark or wide enough to suggest depth. Elevated surfaces (dialogs, popovers, dropdowns) use the `shadow-lg` or `shadow-xl` tokens with a visible `ring-1 ring-foreground/10` for edge definition on transparent popovers.

### Shadow Vocabulary
- **xs** (`0 1px 2px 0 rgb(0 0 0 / 0.05)`): Minimal depth; hover states on flat elements.
- **sm** (`0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)`): Small cards and input focus.
- **md** (`0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): Cards in resting state.
- **lg** (`0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): Dialogs, modals.
- **xl** (`0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): Full-screen overlays.
- **2xl** (`0 25px 50px -12px rgb(0 0 0 / 0.25)`): Lock-screen backdrop.

## 5. Components

### Buttons
- **Shape:** Rounded (10px — `rounded-lg`), with `gap-1.5` icon spacing.
- **Primary:** Slate Blue background, white text. Hover darkens to `bg-primary/80`.
- **Outline:** Transparent background, border from `border` token. Hover adds muted background.
- **Ghost:** Transparent, text-only. Hover adds muted background.
- **Destructive:** Red background tint (`bg-destructive/10`), red text, hover deepens.
- **Sizes:** `xs` (24px), `sm` (28px), `default` (32px), `lg` (36px), `icon` variants.
- **Icon treatment:** Icons use `data-icon="inline-start|inline-end"` for auto-padding. Never manual margin.

### Cards
- **Shape:** Rounded (14px — `rounded-xl`). No shadow at rest; `shadow-sm` on hover for task cards.
- **Background:** Card color (`--card`), with `p-4` internal padding.
- **Border:** 1px solid `--border`. Cards inside scrollable containers use `border border-border ring-0` (no ring clipping).
- **Layout:** Fixed-width task cards in a 3-column grid (`--card-width: 136px`).

### Inputs / Fields
- **Style:** 1px solid `--input` stroke, transparent background, `rounded-lg` (10px).
- **Focus:** Slate Blue ring (`focus-visible:border-ring focus-visible:ring-3`).
- **Disabled:** `opacity-50`, muted background.
- **Input Group:** `InputGroup` wraps an `InputGroupInput` and addons in a unified border container. Addons use `align="inline-start|inline-end"` for positioning.

### Select
- **Shape:** Same as Input (10px rounded, 1px border).
- **Trigger:** `w-fit`, with chevron icon. Content popup matches trigger width via `--anchor-width`.
- **Items:** Rounded (6px), `text-sm`, hover state with accent background.

### Dialog / Modal
- **Shape:** Rounded (14px — `rounded-xl`), `shadow-lg`, `max-w-[440px]`.
- **Header:** Title + optional description, bottom separator.
- **Footer:** Action buttons, right-aligned.

### Floating Capsule (entertainment mode)
- **Shape:** Full pill (`rounded-full`), 56px height, `bg-black` background.
- **States:** `preview` (155px wide) and `triggered` (328px wide), animated width transition.
- **Border:** Subtle `border border-white/[0.06]` for anti-aliasing. Rainbow `BorderBeam` during triggered phase.

### Navigation (Tabs)
- **Style:** `TabsList` with `variant="line"`, inline triggers with bottom border on active state.

## 6. Do's and Don'ts

### Do:
- **Do** use the accent blue sparingly — signal value depends on rarity.
- **Do** use `data-icon="inline-start|inline-end"` on button icons; never manual `size` or `mr` classes.
- **Do** place `InputGroupAddon` after `InputGroupInput` in DOM order, using `align` for visual position.
- **Do** use `border border-border ring-0` on cards inside scrollable containers.
- **Do** keep the floating capsule in `bg-black` with `border border-white/[0.06]` for proper anti-aliasing.

### Don't:
- **Don't** use accent blue for backgrounds, decorative borders, or non-interactive elements.
- **Don't** mix Base UI and Radix UI primitives in the same component.
- **Don't** add manual `z-index` values — use the component's built-in stacking.
- **Don't** use `space-x-*` or `space-y-*` — use `flex gap-*` instead.
- **Don't** apply `overflow-hidden rounded-X` on a parent that also carries children with shadows or borders — wrap background in a separate container.
- **Don't** use gradient text, glassmorphism, or decorative grid backgrounds.
- **Don't** show onboarding tours, tooltip chains, or confirmation dialogs on every toggle.
