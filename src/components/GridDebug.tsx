/**
 * GridDebug — 页面级 6 列网格调试覆盖线
 *
 * 按 Figma 网格定义（**全页面级别**，非某个组件私有）：
 *   Count = 6 / Width = 64 / Gutter = 12 / Offset = 24
 *   Color = #FF0000 / 10% alpha
 *   Type  = Left
 *
 * 行为：
 * - 在 App.tsx 的内容卡片层渲染，覆盖整个页面内容区域
 * - 所有页面组件（Hero / 卡片网格 / 统计图表等）都应参考此网格对齐
 * - pointer-events-none，不阻挡交互
 *
 * 几何公式（CSS calc 引用 global.css 6 列 token）：
 * - col i left:  var(--grid-offset) + i * (var(--grid-col) + var(--grid-gap))
 * - col i width: var(--grid-col)
 */

const COLS = 6;

export function GridDebug() {
  return null;
}
