const assert = require("node:assert/strict");
const { test } = require("node:test");
const Module = require("node:module");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");

class TFile {
  constructor(filePath) {
    this.path = filePath;
    this.extension = path.extname(filePath).slice(1);
  }
}
class TFolder {
  constructor(filePath) {
    this.path = filePath;
  }
  isRoot() {
    return this.path === "/";
  }
}
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name !== "obsidian") return originalLoad.call(this, name, ...args);
  return {
    Plugin: class {},
    PluginSettingTab: class {},
    Modal: class {},
    Notice: class {},
    TFile,
    TFolder,
    normalizePath: (value) => value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") || "/"
  };
};
let Plugin;
try {
  Plugin = require(path.resolve(process.env.PYTHON_RUNNER_ENTRY || "main.js"));
} finally {
  Module._load = originalLoad;
}

function makePlugin(tasks = []) {
  const plugin = new Plugin();
  plugin.settings = {
    pythonPath: process.env.PYTHON_RUNNER_TEST_PYTHON || (process.platform === "win32" ? "python" : "python3"),
    scheduledTasks: tasks,
    defaultFileNamePattern: "{timestamp}.md"
  };
  plugin.saveData = async () => {};
  return plugin;
}

test("单次任务使用本地日期，周任务只在指定星期运行", () => {
  const plugin = makePlugin();
  const now = new Date(2026, 10, 24, 12);
  assert.equal(plugin.calculateNextRun("06:20", "once", 0, "2026-11-26", now), new Date(2026, 10, 26, 6, 20).toISOString());
  assert.equal(plugin.calculateNextRun("06:20", "once", 0, "2026-11-24", now), null);
  assert.throws(() => plugin.calculateNextRun("06:20", "once", 0, "2026-02-30", now), /日期/);
  assert.throws(() => plugin.calculateNextRun("12:00", "weekly", 7, "", now), /星期/);
  assert.equal(plugin.calculateNextRun("08:30", "weekly", 2, "", now), new Date(2026, 11, 1, 8, 30).toISOString());
  assert.equal(plugin.calculateNextRun("08:30", undefined, undefined, "", now), new Date(2026, 10, 25, 8, 30).toISOString());
});

test("重复扫描只触发一次，并保留周任务周期和单次结束状态", async () => {
  const due = new Date();
  due.setDate(due.getDate() - 7);
  due.setHours(8, 30, 0, 0);
  const weekly = { schedule: "08:30", scheduleType: "weekly", weekDay: due.getDay(), nextRun: due.toISOString() };
  const once = { schedule: "08:30", scheduleType: "once", nextRun: due.toISOString() };
  const completed = { schedule: "08:30", scheduleType: "once", nextRun: null };
  const daily = { schedule: "08:30", nextRun: due.toISOString() };
  const plugin = makePlugin([weekly, once, completed, daily]);
  const calls = [];
  const saves = [];
  plugin.saveData = async (snapshot) => saves.push(snapshot);
  plugin.executeScheduledTask = async (task) => {
    assert.equal(saves.at(-1).scheduledTasks[plugin.settings.scheduledTasks.indexOf(task)].nextRun, task.nextRun);
    calls.push(task);
    await new Promise((resolve) => setTimeout(resolve, 10));
  };
  await Promise.all([plugin.checkAndRunScheduledTasks(), plugin.checkAndRunScheduledTasks()]);
  await plugin.checkAndRunScheduledTasks();
  assert.deepEqual(calls, [weekly, once, daily]);
  assert.equal(once.nextRun, null);
  assert.equal(new Date(weekly.nextRun).getDay(), due.getDay());
  assert.ok(new Date(weekly.nextRun) > new Date());
  assert.ok(new Date(daily.nextRun) > new Date());
});

test("修正旧版保存的错误周日期和未来单次日期", async () => {
  const due = new Date(2020, 0, 1, 8);
  const future = new Date();
  future.setDate(future.getDate() + 2);
  const date = [
    future.getFullYear(),
    String(future.getMonth() + 1).padStart(2, "0"),
    String(future.getDate()).padStart(2, "0")
  ].join("-");
  const weekly = { schedule: "08:00", scheduleType: "weekly", weekDay: (due.getDay() + 1) % 7, nextRun: due.toISOString() };
  const once = { schedule: "08:00", scheduleType: "once", scheduleDate: date, nextRun: due.toISOString() };
  const outdated = { ...once, scheduleDate: "2020-01-03" };
  const plugin = makePlugin([weekly, once, outdated]);
  const calls = [];
  plugin.executeScheduledTask = async (task) => calls.push(task);
  await plugin.checkAndRunScheduledTasks();
  assert.deepEqual(calls, []);
  assert.equal(new Date(weekly.nextRun).getDay(), weekly.weekDay);
  assert.equal(new Date(once.nextRun).getDate(), future.getDate());
  assert.equal(outdated.nextRun, null);
});

test("Markdown 围栏兼容 CRLF、波浪线和缩进，跳过嵌套示例和未闭合代码块", () => {
  const plugin = makePlugin();
  const fixture = [
    "````markdown", "```python", "print('example')", "```", "````",
    "  ~~~~Python", "  if True:", "      print(1)", "  ~~~~",
    "```python ", "print(2)", "````", "```python", "print('incomplete')"
  ].join("\r\n");
  assert.equal(plugin.extractPythonCode(fixture), "if True:\n    print(1)\n\nprint(2)");
  assert.equal(plugin.extractPythonCode("```python\n \n```"), null);
  assert.equal(plugin.extractPythonCode("````md\n```python\nprint(1)\n```\n````"), null);
});

test("真实 Python 保留源码、中文与两个输出流，并清理并发临时文件", async () => {
  const plugin = makePlugin();
  const code = [
    "from __future__ import annotations",
    "import sys",
    "print('中文标准输出')",
    "print('中文错误输出', file=sys.stderr)",
    "print(__file__)"
  ].join("\n");
  plugin.settings.pythonPath = `"${plugin.settings.pythonPath}"`;
  const results = await Promise.all([plugin.executePythonCode(code), plugin.executePythonCode(code)]);
  const scripts = results.map((result) => {
    assert.match(result, /中文标准输出/);
    assert.match(result, /中文错误输出/);
    return result.split(/\r?\n/)[1];
  });
  assert.notEqual(scripts[0], scripts[1]);
  for (const script of scripts) {
    assert.equal(path.dirname(script), os.tmpdir());
    await assert.rejects(fs.access(script), { code: "ENOENT" });
  }
  await assert.rejects(plugin.executePythonCode("raise ValueError('测试错误')"), /ValueError: 测试错误/);
  plugin.settings.pythonPath = "python-interpreter-missing-for-test";
  await assert.rejects(plugin.executePythonCode("print(1)"), /ENOENT/);
});

test("调度入口读取笔记并保留同名结果，支持库根目录", async () => {
  const plugin = makePlugin();
  const files = new Map([
    ["跑批.md", new TFile("跑批.md")],
    ["输出", new TFolder("输出")]
  ]);
  const writes = new Map();
  plugin.app = { vault: {
    getAbstractFileByPath: (key) => files.get(key),
    read: async () => "```python\nprint('output')\n```",
    create: async (filePath, contents) => {
      if (files.has(filePath)) throw new Error("File already exists");
      files.set(filePath, new TFile(filePath));
      writes.set(filePath, contents);
    }
  }};
  await plugin.executeScheduledTask({ mdPath: "跑批.md", outputPath: "输出", outputFileName: "结果.txt" });
  await plugin.executeScheduledTask({ mdPath: "跑批.md", outputPath: "输出", outputFileName: "结果.txt" });
  await plugin.saveResult("root", "/", "根目录.md");
  assert.deepEqual([...writes.keys()], ["输出/结果.md", "输出/结果-2.md", "根目录.md"]);
  assert.match(writes.get("输出/结果-2.md"), /^output\r?\n$/);
  await assert.rejects(plugin.saveResult("bad", "缺失", "结果.md"), /目录不存在/);
});
