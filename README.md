# 窗景采样器

公交车窗观察笔记：记录、时间线、对向采样配对与写作灵感。

## 对向采样配对模块

- 同一线路、同一区间的左右侧记录，保存时间相差 **20 分钟**以内自动配对（边界含 20 分钟）
- 先保存的一侧进入**待配对**；对向记录满足条件时自动**已完成**；超时未配上则**已失效**但记录保留
- 同侧重复提交只排队，不会挤掉已有的待配对记录；存在多个候选时按 FIFO 配最早的一条
- 移除已配对的一侧时，另一方退回待配对并重开 20 分钟有效窗，若队列中有其他合格对向则立即重新配对
- 配对状态持久化于 localStorage，刷新后状态不变（加载时按保存时间重放历史记录，幂等校正）
- `/pairing` 页面以时间线展示配对结果，可筛选待配对 / 已完成 / 已失效

核心状态机见 `src/services/pairingEngine.ts`（纯函数，无 DOM 依赖），规则测试：`npm run test:pairing`。

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default tseslint.config({
  extends: [
    // Remove ...tseslint.configs.recommended and replace with this
    ...tseslint.configs.recommendedTypeChecked,
    // Alternatively, use this for stricter rules
    ...tseslint.configs.strictTypeChecked,
    // Optionally, add this for stylistic rules
    ...tseslint.configs.stylisticTypeChecked,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default tseslint.config({
  extends: [
    // other configs...
    // Enable lint rules for React
    reactX.configs['recommended-typescript'],
    // Enable lint rules for React DOM
    reactDom.configs.recommended,
  ],
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```
