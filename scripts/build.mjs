import { readFileSync, writeFileSync } from "node:fs";

// 发布入口统一使用 LF，避免不同系统的 Git 检出设置改变构建结果。
const source = readFileSync(new URL("../src/plugin.js", import.meta.url), "utf8");
writeFileSync(new URL("../main.js", import.meta.url), source.replace(/\r\n/g, "\n"), "utf8");
