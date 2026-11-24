var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
var { Plugin, PluginSettingTab, Setting, Modal, Notice, MarkdownView, TFile, TFolder, normalizePath, loadPrism } = require("obsidian");
class ExecWindow extends Modal {
  constructor(app, onClose) {
    super(app);
    this.onResultClosed = onClose;
    this.content = "正在运行…";
  }
  onOpen() {
    this.modalEl.addClass("python-runner-modal");
    this.titleEl.setText("Python 执行结果");
    const copyButton = this.contentEl.createEl("button", { text: "复制结果" });
    const output = this.contentEl.createEl("pre", { cls: "python-output" });
    output.tabIndex = 0;
    output.setAttribute("aria-label", "Python 执行输出，可选择并复制文本");
    this.outputEl = output.createEl("code", { text: this.content });
    this.outputEl.setAttribute("spellcheck", "false");
    const view = output.ownerDocument.defaultView;
    copyButton.addEventListener("mousedown", (event) => event.preventDefault());
    copyButton.addEventListener("click", async () => {
      const selection = view.getSelection();
      const selected = selection && !selection.isCollapsed &&
        output.contains(selection.anchorNode) && output.contains(selection.focusNode);
      try {
        await view.navigator.clipboard.writeText(selected ? selection.toString() : this.content);
        new Notice(selected ? "已复制选中的内容" : "已复制执行结果");
      } catch {
        new Notice("复制失败");
      }
    });
    this.makeDraggable();
  }
  onClose() {
    this.outputEl = null;
    this.modalEl.style.translate = "";
    this.contentEl.empty();
    this.onResultClosed(this);
  }
  setContent(content) {
    this.content = content;
    this.outputEl?.setText(content);
  }
  makeDraggable() {
    const title = this.titleEl;
    const modal = this.modalEl;
    title.addClass("python-drag-handle");
    let left = 0;
    let top = 0;
    let startX = 0;
    let startY = 0;
    let pointerId;
    // 捕获标题栏上的指针，避免接管其他插件或编辑器的鼠标事件。
    title.onpointerdown = (event) => {
      if (event.button !== 0 || pointerId !== undefined) return;
      pointerId = event.pointerId;
      startX = event.clientX - left;
      startY = event.clientY - top;
      title.setPointerCapture(pointerId);
      event.preventDefault();
    };
    title.onpointermove = (event) => {
      if (event.pointerId !== pointerId) return;
      left = event.clientX - startX;
      top = event.clientY - startY;
      modal.style.translate = `${left}px ${top}px`;
    };
    title.onlostpointercapture = () => { pointerId = undefined; };
  }
}
var DEFAULT_SETTINGS = {
  pythonPath: "python",
  scheduledTasks: [],
  defaultFileNamePattern: "{timestamp}.md"
};
var SCHEDULE_TYPE = {
  DAILY: "daily",
  WEEKLY: "weekly",
  ONCE: "once"
};
var PythonRunnerPlugin = class extends Plugin {
  onload() {
    return __async(this, null, function* () {
      this.unloading = false;
      this.outputModals = new Set();
      yield this.loadSettings();
      this.addSettingTab(new PythonRunnerSettingTab(this.app, this));
      this.addCommand({
        id: "run-python-code-in-current-file",
        name: "运行当前文件中的Python代码",
        callback: () => __async(this, null, function* () {
          yield this.runPythonInCurrentFile();
        })
      });
      this.registerMarkdownCodeBlockProcessor("python", (source, el) => {
        const wrapper = el.createDiv({ cls: "python-code-wrapper" });
        const pre = wrapper.createEl("pre");
        const codeEl = pre.createEl("code", { text: source, cls: "language-python" });
        codeEl.setAttribute("spellcheck", "false");
        this.highlightPythonCode(codeEl);
        const buttonGroup = wrapper.createEl("div", { cls: "python-code-actions" });
        const copyButton = buttonGroup.createEl("button", {
          text: "复制",
          cls: "python-action-button python-copy-button"
        });
        copyButton.addEventListener("click", () => __async(this, null, function* () {
          try {
            yield navigator.clipboard.writeText(source);
            new Notice("已复制代码");
          } catch (error) {
            new Notice("复制失败");
          }
        }));
        const runButton = buttonGroup.createEl("button", {
          text: "运行",
          cls: "python-action-button python-run-button"
        });
        runButton.addEventListener("click", async () => {
          runButton.disabled = true;
          try {
            await this.showPythonOutput(source);
          } finally {
            runButton.disabled = false;
          }
        });
      });
      this.registerDomEvent(document, "paste", (event) => this.handleCodeBlockPaste(event), true);
      this.registerInterval(
        window.setInterval(() => {
          this.checkAndRunScheduledTasks().catch((error) => console.error("检查 Python 定时任务失败:", error));
        }, 6e4)
      );
    });
  }
  async highlightPythonCode(codeEl) {
    try {
      // Prism 按需加载，自定义代码块处理器需要主动等待它初始化。
      const prism = typeof loadPrism === "function" ? await loadPrism() : codeEl.ownerDocument.defaultView?.Prism;
      if (!this.unloading && typeof prism?.highlightElement === "function") {
        prism.highlightElement(codeEl);
      }
    } catch (error) {
      console.warn("加载 Python 语法高亮失败:", error);
    }
  }
  /**
   * 在 Markdown 围栏代码块中接管纯文本粘贴。
   * 直接使用 Editor API 替换选区，仅统一 Windows/macOS 换行符，
   * 不追加空行、不改写缩进，从而完整保留 VS Code 等编辑器中的代码格式。
   * @param {ClipboardEvent} event 浏览器粘贴事件。
   * @returns {void}
   */
  handleCodeBlockPaste(event) {
    if (event.defaultPrevented || !event.clipboardData) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const sourceView = target == null ? void 0 : target.closest(".markdown-source-view.mod-cm6");
    if (!sourceView) {
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.containerEl.contains(sourceView)) {
      return;
    }
    const editor = view.editor;
    const cursor = editor.getCursor("from");
    if (!this.isCursorInsideFencedCodeBlock(editor, cursor)) {
      return;
    }
    const plainText = event.clipboardData.getData("text/plain");
    if (!plainText) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    editor.replaceSelection(plainText.replace(/\r\n?/g, "\n"));
  }
  /**
   * 判断光标是否位于 Markdown 围栏代码块内。
   * 同时支持反引号和波浪号围栏，并按 Markdown 规则匹配对应的关闭围栏。
   * @param {import("obsidian").Editor} editor 当前 Markdown 编辑器。
   * @param {{line:number, ch:number}} cursor 粘贴选区起点。
   * @returns {boolean} 光标是否在围栏代码块内。
   */
  isCursorInsideFencedCodeBlock(editor, cursor) {
    let openingFence = null;
    for (let lineNumber = 0; lineNumber <= cursor.line; lineNumber += 1) {
      const line = editor.getLine(lineNumber);
      const match = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
      if (!match) {
        continue;
      }
      const fence = match[1];
      if (!openingFence) {
        openingFence = { character: fence[0], length: fence.length, line: lineNumber };
        continue;
      }
      if (fence[0] === openingFence.character && fence.length >= openingFence.length && match[2].trim() === "") {
        openingFence = null;
      }
    }
    return openingFence !== null && openingFence.line < cursor.line;
  }
  async executePythonCode(code) {
    if (!code || !code.trim()) {
      throw new Error("没有可执行的 Python 代码");
    }
    const { execFile } = require("child_process");
    const { promisify } = require("util");
    const fs = require("fs").promises;
    const path = require("path");
    const os = require("os");
    const { randomBytes } = require("crypto");
    const configuredPath = String(this.settings.pythonPath ?? "").trim().replace(/^"(.*)"$/, "$1");
    const interpreter = configuredPath || DEFAULT_SETTINGS.pythonPath;
    const tmpFile = path.join(os.tmpdir(), `obsidian-python-${randomBytes(16).toString("hex")}.py`);
    let tempHandle;
    try {
      // 独占创建脚本并保留源码行号，使用环境变量设置 Python 输出编码。
      tempHandle = await fs.open(tmpFile, "wx", 0o600);
      try {
        await tempHandle.writeFile(code, "utf8");
      } finally {
        await tempHandle.close();
      }
      const { stdout, stderr } = await promisify(execFile)(interpreter, ["-u", tmpFile], {
        timeout: 30_000,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" }
      });
      return stdout + stderr || "代码执行完成，无输出";
    } catch (error) {
      const reason = error.killed ? "超过 30 秒执行时限" : error.stderr || error.message;
      throw new Error(`执行错误：${reason}${error.stdout ? `\n\n标准输出：\n${error.stdout}` : ""}`);
    } finally {
      if (tempHandle) {
        await fs.unlink(tmpFile).catch((error) => {
          if (error.code !== "ENOENT") console.error("清理 Python 临时文件失败:", error);
        });
      }
    }
  }
  loadSettings() {
    return __async(this, null, function* () {
      this.settings = Object.assign({}, DEFAULT_SETTINGS, yield this.loadData());
      if (!Array.isArray(this.settings.scheduledTasks)) this.settings.scheduledTasks = [];
    });
  }
  saveSettings() {
    // 设置页和调度器共用写入队列，写入时读取最新配置。
    const previousSave = this.settingsSave || Promise.resolve();
    this.settingsSave = previousSave.catch(() => {}).then(() => {
      const snapshot = JSON.parse(JSON.stringify(this.settings));
      return this.saveData(snapshot);
    });
    return this.settingsSave;
  }
  onunload() {
    this.unloading = true;
    for (const modal of this.outputModals) modal.close();
  }
  async checkAndRunScheduledTasks() {
    if (this.checkingScheduledTasks || this.unloading) return;
    this.checkingScheduledTasks = true;
    try {
      for (const task of this.settings.scheduledTasks.slice()) {
        if (this.unloading) break;
        if (!task?.nextRun || !this.settings.scheduledTasks.includes(task)) continue;
        const scheduledTime = new Date(task.nextRun);
        if (!Number.isFinite(scheduledTime.getTime())) continue;
        try {
          const now = new Date();
          const type = task.scheduleType || SCHEDULE_TYPE.DAILY;
          if (type === SCHEDULE_TYPE.ONCE && task.scheduleDate) {
            const intended = this.calculateNextRun(task.schedule, type, task.weekDay, task.scheduleDate, new Date(0));
            if (scheduledTime.toISOString() !== intended) {
              // 旧版忽略单次日期。只恢复尚未到期的日期，避免补跑可能已执行过的任务。
              await this.updateTaskNextRun(task, intended && new Date(intended) > now ? intended : null);
              continue;
            }
          }
          if (type === SCHEDULE_TYPE.WEEKLY && scheduledTime.getDay() !== Number(task.weekDay ?? 0)) {
            await this.updateTaskNextRun(task, this.calculateNextRun(task.schedule, type, task.weekDay));
            continue;
          }
          if (scheduledTime > now) continue;
          // 先持久化下次执行时间。插件重载时，已经领取的单次任务不会被再次领取。
          const nextRun = type === SCHEDULE_TYPE.ONCE ? null : this.calculateNextRun(task.schedule, type, task.weekDay);
          await this.updateTaskNextRun(task, nextRun);
          if (!this.unloading && this.settings.scheduledTasks.includes(task)) await this.executeScheduledTask(task);
        } catch (error) {
          new Notice(`Python 定时任务失败：${task.mdPath || "未指定笔记"}。详情见控制台。`);
          console.error("Python 定时任务失败:", error);
        }
      }
    } finally {
      this.checkingScheduledTasks = false;
    }
  }
  async updateTaskNextRun(task, nextRun) {
    const previousRun = task.nextRun;
    task.nextRun = nextRun;
    try {
      await this.saveSettings();
    } catch (error) {
      task.nextRun = previousRun;
      throw error;
    }
  }
  async executeScheduledTask(task) {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(task.mdPath));
    if (!(file instanceof TFile) || file.extension !== "md") {
      throw new Error("找不到任务配置中的 Markdown 笔记");
    }
    const pythonCode = this.extractPythonCode(await this.app.vault.read(file));
    if (!pythonCode) {
      throw new Error("任务笔记中未找到可执行的 Python 代码块");
    }
    const result = await this.executePythonCode(pythonCode);
    await this.saveResult(result, task.outputPath, task.outputFileName);
  }
  extractPythonCode(content) {
    const blocks = [];
    let opening = null;
    let lines = [];
    // 跟踪所有围栏，避免把 Markdown 示例里的 Python 围栏当成待执行代码。
    for (const line of content.split(/\r\n?|\n/)) {
      const fence = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
      if (!opening) {
        if (!fence) continue;
        const [, indent, marker, info] = fence;
        if (marker[0] === "`" && info.includes("`")) continue;
        opening = { indent: indent.length, marker, python: /^python(?:\s|$)/i.test(info.trim()) };
      } else if (fence && fence[2][0] === opening.marker[0] && fence[2].length >= opening.marker.length && !fence[3].trim()) {
        const block = lines.join("\n");
        if (block.trim()) blocks.push(block);
        opening = null;
        lines = [];
      } else if (opening.python) {
        const leadingSpaces = /^ */.exec(line)[0].length;
        lines.push(line.slice(Math.min(leadingSpaces, opening.indent)));
      }
    }
    return blocks.length ? blocks.join("\n\n") : null;
  }
  async saveResult(result, outputPath, outputFileName) {
    const path = require("path").posix;
    const timestamp = new Date().toLocaleString("zh-CN", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).replace(/[\/\s:]/g, "-");
    const fileName = (outputFileName?.trim() || this.settings.defaultFileNamePattern || DEFAULT_SETTINGS.defaultFileNamePattern)
      .replace(/\{timestamp\}/g, timestamp).replace(/\.txt$/i, ".md");
    if (!fileName || /[\\/]/.test(fileName) || fileName === "." || fileName === "..") {
      throw new Error("输出文件名不能包含目录");
    }
    if (outputPath.split(/[\\/]/).includes("..")) {
      throw new Error("输出目录不能包含上级目录");
    }
    const folder = normalizePath(outputPath) || "/";
    const vault = this.app.vault;
    if (folder !== "/" && !(vault.getAbstractFileByPath(folder) instanceof TFolder)) {
      throw new Error("输出目录不存在");
    }
    const { name, ext } = path.parse(fileName);
    // 固定文件名和同秒生成的文件名都会冲突，用顺序后缀保留既有结果。
    for (let index = 1; ; index += 1) {
      const candidate = index === 1 ? fileName : `${name}-${index}${ext}`;
      const fullPath = folder === "/" ? candidate : `${folder}/${candidate}`;
      if (vault.getAbstractFileByPath(fullPath)) continue;
      try {
        return await vault.create(fullPath, result);
      } catch (error) {
        if (!vault.getAbstractFileByPath(fullPath)) throw error;
      }
    }
  }
  calculateNextRun(schedule, type = SCHEDULE_TYPE.DAILY, weekDay = 0, scheduleDate, now = new Date()) {
    if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(schedule)) {
      throw new Error("请输入有效的执行时间 (HH:mm)");
    }
    const [hours, minutes] = schedule.split(":").map(Number);
    const next = new Date(now);
    if (type === SCHEDULE_TYPE.ONCE && scheduleDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) throw new Error("请选择有效的执行日期");
      const [year, month, day] = scheduleDate.split("-").map(Number);
      next.setFullYear(year, month - 1, day);
      if (next.getFullYear() !== year || next.getMonth() !== month - 1 || next.getDate() !== day) {
        throw new Error("请选择有效的执行日期");
      }
    }
    next.setHours(hours, minutes, 0, 0);
    if (type === SCHEDULE_TYPE.ONCE) {
      return next <= now ? null : next.toISOString();
    }
    if (next <= now) {
      next.setDate(next.getDate() + 1);
      next.setHours(hours, minutes, 0, 0);
    }
    if (type === SCHEDULE_TYPE.WEEKLY) {
      const weekday = Number(weekDay);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new Error("请选择有效的星期");
      }
      next.setDate(next.getDate() + (weekday - next.getDay() + 7) % 7);
      next.setHours(hours, minutes, 0, 0);
    }
    return next.toISOString();
  }
  async runPythonInCurrentFile() {
    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile || activeFile.extension !== "md") {
      new Notice("请打开要运行的 Markdown 笔记");
      return;
    }
    let pythonCode;
    try {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const content = view?.file === activeFile && view.getMode() === "source"
        ? view.editor.getValue()
        : await this.app.vault.read(activeFile);
      pythonCode = this.extractPythonCode(content);
    } catch (error) {
      new Notice("读取当前 Markdown 笔记失败");
      console.error("读取 Python 笔记失败:", error);
      return;
    }
    if (!pythonCode) {
      new Notice("当前文件中没有找到 Python 代码块");
      return;
    }
    await this.showPythonOutput(pythonCode);
  }
  async showPythonOutput(code) {
    if (this.unloading) return;
    const execWindow = new ExecWindow(this.app, (closed) => this.outputModals.delete(closed));
    this.outputModals.add(execWindow);
    execWindow.open();
    try {
      execWindow.setContent(await this.executePythonCode(code));
    } catch (error) {
      execWindow.setContent(error.message);
    }
  }
};
var PythonRunnerSettingTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Python 路径").setDesc("设置 Python 解释器的路径").addText((text) => text.setPlaceholder("输入 Python 路径").setValue(this.plugin.settings.pythonPath).onChange((value) => __async(this, null, function* () {
      this.plugin.settings.pythonPath = value;
      yield this.plugin.saveSettings();
    })));
    new Setting(containerEl).setName("定时任务").setHeading();
    const taskList = containerEl.createDiv({ cls: "python-task-list" });
    this.displayTasks(taskList);
    new Setting(containerEl).addButton((button) => button.setButtonText("添加定时任务").onClick(() => {
      this.showAddTaskModal();
    }));
  }
  displayTasks(containerEl) {
    containerEl.empty();
    this.plugin.settings.scheduledTasks.forEach((task, index) => {
      const taskDiv = containerEl.createDiv({ cls: "python-task-item" });
      new Setting(taskDiv).setName(`任务 ${index + 1}`).setDesc(`${task.mdPath} - 运行时间: ${task.schedule}`).addButton((button) => button.setButtonText("编辑").onClick(() => {
        this.showEditTaskModal(task);
      })).addButton((button) => button.setButtonText("删除").onClick(() => __async(this, null, function* () {
        this.plugin.settings.scheduledTasks.splice(index, 1);
        yield this.plugin.saveSettings();
        this.displayTasks(containerEl);
      })));
    });
  }
  showEditTaskModal(task) {
    try {
      const modal = new Modal(this.app);
      modal.titleEl.setText("编辑定时任务");
      const contentContainer = modal.contentEl.createDiv("python-task-form");
      let mdPath = task.mdPath;
      let outputPath = task.outputPath;
      let schedule = task.schedule;
      let scheduleType = task.scheduleType || SCHEDULE_TYPE.DAILY;
      let weekDay = task.weekDay || 0;
      let scheduleDate = task.scheduleDate || "";
      let outputFileName = task.outputFileName || "";
      const mdPathContainer = contentContainer.createDiv("setting-with-suggestions");
      const mdPathSetting = new Setting(mdPathContainer).setName("MD文件路径").setDesc("选择要执行的MD文件");
      const mdSuggestionContainer = mdPathContainer.createDiv("suggestion-container");
      mdSuggestionContainer.hidden = true;
      let selectedMdIndex = -1;
      let mdSuggestions = [];
      mdPathSetting.addText((text) => {
        text.setPlaceholder("example.md").setValue(mdPath).onChange((value) => {
          mdPath = value;
          selectedMdIndex = -1;
          mdSuggestions = this.app.vault.getMarkdownFiles().filter((file) => file.path.toLowerCase().includes(value.toLowerCase())).slice(0, 5);
          this.updateSuggestions(mdSuggestionContainer, mdSuggestions, selectedMdIndex, (selected) => {
            mdPath = selected.path;
            text.setValue(selected.path);
            mdSuggestionContainer.hidden = true;
          });
        });
        const inputEl = text.inputEl;
        inputEl.addEventListener("keydown", (event) => {
          this.handleSuggestionKeydown(
            event,
            mdSuggestions,
            mdSuggestionContainer,
            selectedMdIndex,
            (newIndex) => selectedMdIndex = newIndex,
            (selected) => {
              mdPath = selected.path;
              inputEl.value = selected.path;
            }
          );
        });
      });
      const outputPathContainer = contentContainer.createDiv("setting-with-suggestions");
      const outputPathSetting = new Setting(outputPathContainer).setName("输出路径").setDesc("结果保存的文件夹路径");
      const outputSuggestionContainer = outputPathContainer.createDiv("suggestion-container");
      outputSuggestionContainer.hidden = true;
      let selectedOutputIndex = -1;
      let outputSuggestions = [];
      outputPathSetting.addText((text) => {
        text.setPlaceholder("output/python-results").setValue(outputPath).onChange((value) => {
          outputPath = value;
          selectedOutputIndex = -1;
          outputSuggestions = Array.from(this.getFolders()).filter((folder) => folder.toLowerCase().includes(value.toLowerCase())).slice(0, 5);
          this.updateSuggestions(
            outputSuggestionContainer,
            outputSuggestions,
            selectedOutputIndex,
            (selected) => {
              outputPath = selected;
              text.setValue(selected);
              outputSuggestionContainer.hidden = true;
            }
          );
        });
        const inputEl = text.inputEl;
        inputEl.addEventListener("keydown", (event) => {
          this.handleSuggestionKeydown(
            event,
            outputSuggestions,
            outputSuggestionContainer,
            selectedOutputIndex,
            (newIndex) => selectedOutputIndex = newIndex,
            (selected) => {
              outputPath = selected;
              inputEl.value = selected;
            }
          );
        });
      });
      new Setting(contentContainer).setName("执行频率").addDropdown((dropdown) => dropdown.addOption(SCHEDULE_TYPE.DAILY, "每日执行").addOption(SCHEDULE_TYPE.WEEKLY, "每周执行").addOption(SCHEDULE_TYPE.ONCE, "单次执行").setValue(scheduleType).onChange((value) => {
        scheduleType = value;
        const weekDaySettings2 = contentContainer.querySelector(".week-day-setting");
        const dateSettings2 = contentContainer.querySelector(".date-setting");
        if (weekDaySettings2 && dateSettings2) {
          weekDaySettings2.hidden = !(value === SCHEDULE_TYPE.WEEKLY);
          dateSettings2.hidden = !(value === SCHEDULE_TYPE.ONCE);
        }
      }));
      const dateSettings = contentContainer.createDiv("date-setting");
      dateSettings.hidden = !(scheduleType === SCHEDULE_TYPE.ONCE);
      new Setting(dateSettings).setName("执行日期").addText((text) => {
        text.inputEl.type = "date";
        text.setValue(scheduleDate);
        text.onChange((value) => scheduleDate = value);
      });
      const weekDaySettings = contentContainer.createDiv("week-day-setting");
      weekDaySettings.hidden = !(scheduleType === SCHEDULE_TYPE.WEEKLY);
      new Setting(weekDaySettings).setName("执行日期").addDropdown((dropdown) => {
        const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        days.forEach((day, index) => {
          dropdown.addOption(index.toString(), day);
        });
        dropdown.setValue(weekDay.toString());
        dropdown.onChange((value) => weekDay = parseInt(value));
      });
      new Setting(contentContainer).setName("执行时间").setDesc("设置任务执行的时间（24小时制）").addText((text) => {
        text.inputEl.type = "time";
        text.setValue(schedule ? schedule.padStart(5, "0") : "");
        text.onChange((value) => schedule = value);
      });
      new Setting(contentContainer).setName("输出文件名").setDesc("设置输出文件的名称模式 (可选，支持 {timestamp} 变量)").addText((text) => text.setPlaceholder(this.plugin.settings.defaultFileNamePattern).setValue(outputFileName).onChange((value) => outputFileName = value));
      const buttonContainer = contentContainer.createDiv("modal-button-container");
      new Setting(buttonContainer).addButton((button) => button.setButtonText("保存").setCta().onClick(() => __async(this, null, function* () {
        try {
          if (!mdPath || !outputPath || !schedule) {
            this.showError(contentContainer, "请填写所有必填项");
            return;
          }
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(schedule)) {
            this.showError(contentContainer, "请输入有效的时间格式 (HH:mm)");
            return;
          }
          const nextRun = this.getTaskNextRun(contentContainer, schedule, scheduleType, weekDay, scheduleDate);
          if (!nextRun) return;
          const index = this.plugin.settings.scheduledTasks.indexOf(task);
          if (index === -1) {
            this.showError(contentContainer, "该任务已删除");
            return;
          }
          const updatedTask = {
            ...task,
            mdPath,
            outputPath,
            outputFileName,
            schedule,
            scheduleType,
            weekDay,
            scheduleDate,
            nextRun
          };
          this.plugin.settings.scheduledTasks[index] = updatedTask;
          yield this.plugin.saveSettings();
          this.display();
          modal.close();
        } catch (error) {
          console.error("保存任务时出错:", error);
          this.showError(contentContainer, "保存任务时出错");
        }
      }))).addButton((button) => button.setButtonText("取消").onClick(() => modal.close()));
      modal.open();
    } catch (error) {
      console.error("打开编辑模态框时出错:", error);
    }
  }
  showAddTaskModal() {
    try {
      const modal = new Modal(this.app);
      modal.titleEl.setText("添加定时任务");
      const contentContainer = modal.contentEl.createDiv("python-task-form");
      let mdPath = "";
      let outputPath = "";
      let schedule = "";
      const today = new Date();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      let scheduleDate = `${today.getFullYear()}-${month}-${day}`;
      let outputFileName = "";
      const mdPathContainer = contentContainer.createDiv("setting-with-suggestions");
      const mdPathSetting = new Setting(mdPathContainer).setName("MD文件路径").setDesc("选择要执行的MD文件");
      const mdSuggestionContainer = mdPathContainer.createDiv("suggestion-container");
      mdSuggestionContainer.hidden = true;
      let selectedMdIndex = -1;
      let mdSuggestions = [];
      mdPathSetting.addText((text) => {
        text.setPlaceholder("example.md").setValue(mdPath).onChange((value) => {
          mdPath = value;
          selectedMdIndex = -1;
          mdSuggestions = this.app.vault.getMarkdownFiles().filter((file) => file.path.toLowerCase().includes(value.toLowerCase())).slice(0, 5);
          this.updateSuggestions(mdSuggestionContainer, mdSuggestions, selectedMdIndex, (selected) => {
            mdPath = selected.path;
            text.setValue(selected.path);
            mdSuggestionContainer.hidden = true;
          });
        });
        const inputEl = text.inputEl;
        inputEl.addEventListener("keydown", (event) => {
          this.handleSuggestionKeydown(
            event,
            mdSuggestions,
            mdSuggestionContainer,
            selectedMdIndex,
            (newIndex) => selectedMdIndex = newIndex,
            (selected) => {
              mdPath = selected.path;
              inputEl.value = selected.path;
            }
          );
        });
      });
      const outputPathContainer = contentContainer.createDiv("setting-with-suggestions");
      const outputPathSetting = new Setting(outputPathContainer).setName("输出路径").setDesc("结果保存的文件夹路径");
      const outputSuggestionContainer = outputPathContainer.createDiv("suggestion-container");
      outputSuggestionContainer.hidden = true;
      let selectedOutputIndex = -1;
      let outputSuggestions = [];
      outputPathSetting.addText((text) => {
        text.setPlaceholder("output/python-results").setValue(outputPath).onChange((value) => {
          outputPath = value;
          selectedOutputIndex = -1;
          outputSuggestions = Array.from(this.getFolders()).filter((folder) => folder.toLowerCase().includes(value.toLowerCase())).slice(0, 5);
          this.updateSuggestions(
            outputSuggestionContainer,
            outputSuggestions,
            selectedOutputIndex,
            (selected) => {
              outputPath = selected;
              text.setValue(selected);
              outputSuggestionContainer.hidden = true;
            }
          );
        });
        const inputEl = text.inputEl;
        inputEl.addEventListener("keydown", (event) => {
          this.handleSuggestionKeydown(
            event,
            outputSuggestions,
            outputSuggestionContainer,
            selectedOutputIndex,
            (newIndex) => selectedOutputIndex = newIndex,
            (selected) => {
              outputPath = selected;
              inputEl.value = selected;
            }
          );
        });
      });
      let scheduleType = SCHEDULE_TYPE.DAILY;
      let weekDay = 0;
      new Setting(contentContainer).setName("执行频率").addDropdown((dropdown) => dropdown.addOption(SCHEDULE_TYPE.DAILY, "每日执行").addOption(SCHEDULE_TYPE.WEEKLY, "每周执行").addOption(SCHEDULE_TYPE.ONCE, "单次执行").setValue(scheduleType).onChange((value) => {
        scheduleType = value;
        const weekDaySettings2 = contentContainer.querySelector(".week-day-setting");
        const dateSettings2 = contentContainer.querySelector(".date-setting");
        if (weekDaySettings2 && dateSettings2) {
          weekDaySettings2.hidden = !(value === SCHEDULE_TYPE.WEEKLY);
          dateSettings2.hidden = !(value === SCHEDULE_TYPE.ONCE);
        }
      }));
      const dateSettings = contentContainer.createDiv("date-setting");
      dateSettings.hidden = true;
      new Setting(dateSettings).setName("执行日期").addText((text) => {
        text.inputEl.type = "date";
        text.setValue(scheduleDate);
        text.onChange((value) => scheduleDate = value);
      });
      const weekDaySettings = contentContainer.createDiv("week-day-setting");
      weekDaySettings.hidden = true;
      new Setting(weekDaySettings).setName("执行日期").addDropdown((dropdown) => {
        const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        days.forEach((day, index) => {
          dropdown.addOption(index.toString(), day);
        });
        dropdown.setValue("0");
        dropdown.onChange((value) => weekDay = parseInt(value));
      });
      new Setting(contentContainer).setName("执行时间").setDesc("设置任务执行的时间（24小时制）").addText((text) => {
        text.inputEl.type = "time";
        text.setValue(schedule ? schedule.padStart(5, "0") : "");
        text.onChange((value) => schedule = value);
      });
      new Setting(contentContainer).setName("输出文件名").setDesc("设置输出文件的名称模式 (可选，支持 {timestamp} 变量)").addText((text) => text.setPlaceholder(this.plugin.settings.defaultFileNamePattern).setValue("").onChange((value) => outputFileName = value));
      const buttonContainer = contentContainer.createDiv("modal-button-container");
      new Setting(buttonContainer).addButton((button) => button.setButtonText("保存").setCta().onClick(() => __async(this, null, function* () {
        try {
          if (!mdPath || !outputPath || !schedule) {
            this.showError(contentContainer, "请填写所有必填项");
            return;
          }
          const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
          if (!timeRegex.test(schedule)) {
            this.showError(contentContainer, "请输入有效的时间格式 (HH:mm)");
            return;
          }
          const nextRun = this.getTaskNextRun(contentContainer, schedule, scheduleType, weekDay, scheduleDate);
          if (!nextRun) return;
          const task = {
            mdPath,
            outputPath,
            outputFileName,
            schedule,
            scheduleType,
            weekDay,
            scheduleDate,
            nextRun
          };
          this.plugin.settings.scheduledTasks.push(task);
          yield this.plugin.saveSettings();
          this.display();
          modal.close();
        } catch (error) {
          console.error("保存任务时出错:", error);
          this.showError(contentContainer, "保存任务时出错");
        }
      }))).addButton((button) => button.setButtonText("取消").onClick(() => modal.close()));
      modal.open();
    } catch (error) {
      console.error("打开模态框时出错:", error);
    }
  }
  // 添加处理建议键盘事件的通用方法
  handleSuggestionKeydown(event, suggestions, container, selectedIndex, setIndex, onSelect) {
    if (container.hidden) return;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        const nextIndex = event.key === "ArrowDown"
          ? Math.min(selectedIndex + 1, suggestions.length - 1)
          : Math.max(selectedIndex - 1, -1);
        setIndex(nextIndex);
        this.updateSuggestions(container, suggestions, nextIndex, (selected) => {
          onSelect(selected);
          container.hidden = true;
        });
        break;
      }
      case "Enter":
        event.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          onSelect(suggestions[selectedIndex]);
          container.hidden = true;
        }
        break;
      case "Escape":
        container.hidden = true;
        break;
    }
  }
  // 更新建议列表的通用方法
  updateSuggestions(container, suggestions, selectedIndex, onClick) {
    container.empty();
    if (suggestions.length > 0) {
      container.hidden = false;
      suggestions.forEach((item, index) => {
        const suggestion = container.createEl("div", {
          cls: `suggestion-item ${index === selectedIndex ? "is-selected" : ""}`,
          text: item.path || item
        });
        suggestion.addEventListener("click", () => onClick(item));
      });
    } else {
      container.hidden = true;
    }
  }
  getFolders() {
    return ["/", ...this.app.vault.getAllLoadedFiles()
      .filter((file) => file instanceof TFolder && !file.isRoot())
      .map((folder) => folder.path)];
  }
  getTaskNextRun(container, schedule, type, weekDay, date) {
    if (type === SCHEDULE_TYPE.ONCE && !date) {
      this.showError(container, "请选择单次任务的执行日期");
      return null;
    }
    try {
      const nextRun = this.plugin.calculateNextRun(schedule, type, weekDay, date);
      if (!nextRun) this.showError(container, "请选择未来的执行日期和时间");
      return nextRun;
    } catch (error) {
      this.showError(container, error.message);
      return null;
    }
  }
  showError(container, message) {
    const errorMsg = container.createEl("p", {
      text: message,
      cls: "modal-error-message"
    });
    setTimeout(() => errorMsg.remove(), 3e3);
  }
};
module.exports = PythonRunnerPlugin;
