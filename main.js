const { Modal, Notice, Plugin, PluginSettingTab, Setting } = require('obsidian');
const { execFile } = require('node:child_process');
const { promises: fs } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const DEFAULT_SETTINGS = {
    pythonPath: 'python'
};

/**
 * 使用 Obsidian 原生 Modal 展示运行结果，确保主题适配和键盘操作正常。
 */
class PythonOutputModal extends Modal {
    constructor(app) {
        super(app);
        this.output = '正在运行…';
        this.outputEl = null;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('yuhanbo-python-runner-modal');

        const header = contentEl.createDiv({ cls: 'yuhanbo-python-runner-modal__header' });
        header.createEl('h2', { text: 'Python 执行结果' });

        const copyButton = header.createEl('button', { text: '复制结果' });
        copyButton.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(this.output);
                copyButton.setText('已复制');
                window.setTimeout(() => copyButton.setText('复制结果'), 2000);
            } catch (error) {
                new Notice(`复制失败：${getErrorMessage(error)}`);
            }
        });

        const outputContainer = contentEl.createEl('pre', {
            cls: 'yuhanbo-python-runner-output'
        });
        this.outputEl = outputContainer.createEl('code', { text: this.output });
    }

    onClose() {
        this.contentEl.empty();
        this.outputEl = null;
    }

    setOutput(output) {
        this.output = output;
        this.outputEl?.setText(output);
    }
}

class PythonRunnerPlugin extends Plugin {
    async onload() {
        await this.loadSettings();
        this.addSettingTab(new PythonRunnerSettingTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor('python', (source, el) => {
            const wrapper = el.createDiv({ cls: 'yuhanbo-python-runner-code' });
            wrapper.createEl('pre').createEl('code', { text: source });

            const runButton = wrapper.createEl('button', {
                text: '运行 Python',
                cls: 'yuhanbo-python-runner-code__run'
            });

            runButton.addEventListener('click', async () => {
                runButton.disabled = true;
                const outputModal = new PythonOutputModal(this.app);
                outputModal.open();

                try {
                    outputModal.setOutput(await this.executePythonCode(source));
                } catch (error) {
                    outputModal.setOutput(`执行错误：${getErrorMessage(error)}`);
                } finally {
                    runButton.disabled = false;
                }
            });
        });
    }

    /**
     * 将代码写入系统临时目录，并直接调用解释器而不经过 shell。
     * execFile 会把解释器路径和脚本参数分开传递，可避免路径被解释成命令。
     */
    async executePythonCode(code) {
        const temporaryDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'yuhanbo-python-runner-')
        );
        const temporaryScript = path.join(temporaryDirectory, 'script.py');

        try {
            await fs.writeFile(temporaryScript, code, 'utf8');

            const { stdout, stderr } = await execFileAsync(
                this.settings.pythonPath.trim() || DEFAULT_SETTINGS.pythonPath,
                ['-u', temporaryScript],
                {
                    encoding: 'utf8',
                    env: {
                        ...process.env,
                        PYTHONIOENCODING: 'utf-8',
                        PYTHONUTF8: '1'
                    },
                    maxBuffer: 10 * 1024 * 1024,
                    timeout: 30000,
                    windowsHide: true
                }
            );

            const output = [stdout, stderr].filter(Boolean).join('\n');
            return output || '代码执行完成，无输出。';
        } catch (error) {
            const capturedOutput = [error?.stdout, error?.stderr].filter(Boolean).join('\n');
            if (capturedOutput) {
                return `执行错误：${getErrorMessage(error)}\n\n${capturedOutput}`;
            }
            return `执行错误：${getErrorMessage(error)}`;
        } finally {
            // 此目录由插件刚刚创建，仅用于本次执行，因此可以安全地整体清理。
            await fs.rm(temporaryDirectory, { force: true, recursive: true }).catch(() => {});
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class PythonRunnerSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName('Python 解释器')
            .setDesc('输入 Python 可执行文件名称或完整路径，例如 python 或 C:\\Python312\\python.exe。')
            .addText((text) => text
                .setPlaceholder('python')
                .setValue(this.plugin.settings.pythonPath)
                .onChange(async (value) => {
                    this.plugin.settings.pythonPath = value.trim();
                    await this.plugin.saveSettings();
                }));
    }
}

function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

module.exports = PythonRunnerPlugin;
