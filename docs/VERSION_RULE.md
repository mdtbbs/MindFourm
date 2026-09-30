# 论坛版本规则

论坛版本遵循 `MAJOR.MINOR.PATCH` 格式，例如 `2.1.0`。版本记录在根目录
`package.json`，同时同步到 `package-lock.json`。

## 什么时候递增

每次向 `master` 推送一组论坛改动，都要在推送前递增一个版本段，并把版本改动
放进同一批推送的提交中。一次推送可以包含多个提交，但只递增一次。

- **MAJOR**：特别大的改动，或不兼容的 API、数据格式变更。例如 `2.1.0` → `3.0.0`。
- **MINOR**：增加或删除论坛功能。例如 `2.1.0` → `2.2.0`。
- **PATCH**：修复 bug 和其他小改动。例如 `2.1.0` → `2.1.1`。

仅推送功能分支不递增论坛发布版本；合并到 `master` 并推送时递增。每次只增加一个段，
并按语义版本规则将较低位归零。

## 操作

根据这次推送内容，运行一个对应命令：

```bash
npm run version:major
npm run version:minor
npm run version:patch
```

命令会同步更新 `package.json` 和 `package-lock.json`，不会自动暂存或提交文件。
`npm install` / `npm ci` 会安装本地 `pre-push` 检查；推送 `master` 时若版本没有恰好
递增一个段，推送会被拦截。GitHub Actions 也会在 `master` push 上执行相同检查。

版本修改应与对应代码一并提交，不要推送版本递增的空提交。
