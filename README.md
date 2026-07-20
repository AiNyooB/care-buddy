<h1 align="center">care-buddy</h1>

<p align="center">
  care-buddy 是一款基于 Tauri v2 开发的轻量桌面健康提醒应用，帮你在长时间使用电脑的过程中自然建立健康的作息节奏，降低久坐、用眼过度等问题带来的健康负担。
</p>

---

## 功能

- **久坐提醒** — 定时提醒起身活动
- **喝水提醒** — 定时提醒补充水分
- **护眼提醒** — 定时提醒远眺放松
- **自定义任务** — 支持间隔循环与每日定点提醒
- **强制锁屏** — 休息时全屏锁定，支持多显示屏与严格模式，未测试
- **智能空闲检测** — 离开电脑自动重置计时
- **悬浮倒计时** — 置顶窗口显示下一个提醒，未测试
- **中英文切换** — 界面语言实时切换

## 安装

从 [GitHub Releases](未支持) 下载对应平台的安装包。

## 从源码构建

```bash
npm install
npm run tauri dev    # 开发模式
npm run tauri build  # 打包安装包
```

## 技术栈

Tauri 2 / React 19 / TypeScript 6 / Zustand 5 / Tailwind 4 / Rust

## 许可证

MIT License
