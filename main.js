const { Plugin, PluginSettingTab, Setting } = require('obsidian');

class ExecWindow {
    constructor(app) {
        this.app = app;
        this.content = '';
        this.modal = document.createElement('div');
        this.modal.className = 'modal python-runner-modal';
        
        this.contentEl = document.createElement('div');
        this.contentEl.className = 'modal-content';
        this.modal.appendChild(this.contentEl);
        
        this.overlay = document.createElement('div');
        this.overlay.className = 'modal-overlay';
    }

    open() {
        document.body.appendChild(this.overlay);
        document.body.appendChild(this.modal);
        this.onOpen();
    }

    close() {
        this.modal.remove();
        this.overlay.remove();
    }

    onOpen() {
        this.contentEl.empty();
        
        const titleBar = document.createElement('div');
        titleBar.className = 'modal-title-bar';
        
        const title = document.createElement('h3');
        title.textContent = 'Python 执行结果';
        titleBar.appendChild(title);
        
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'modal-button-group';
        
        const copyButton = document.createElement('button');
        copyButton.className = 'modal-button';
        copyButton.innerHTML = '复制';
        copyButton.onclick = () => {
            navigator.clipboard.writeText(this.content)
                .then(() => {
                    const originalText = copyButton.innerHTML;
                    copyButton.innerHTML = '已复制!';
                    setTimeout(() => {
                        copyButton.innerHTML = originalText;
                    }, 2000);
                })
                .catch(err => {
                    console.error('复制失败:', err);
                });
        };
        
        const closeButton = document.createElement('button');
        closeButton.className = 'modal-button modal-close-button';
        closeButton.innerHTML = '';
        closeButton.onclick = () => this.close();
        
        buttonGroup.appendChild(copyButton);
        buttonGroup.appendChild(closeButton);
        titleBar.appendChild(buttonGroup);
        
        this.contentEl.appendChild(titleBar);
        
        const outputEl = document.createElement('pre');
        outputEl.className = 'python-output';
        const codeEl = document.createElement('code');
        codeEl.textContent = this.content;
        outputEl.appendChild(codeEl);
        this.contentEl.appendChild(outputEl);
        
        this.makeDraggable(this.modal, titleBar);
        
        const rect = this.modal.getBoundingClientRect();
        this.modal.style.top = `${(window.innerHeight - rect.height) / 2}px`;
        this.modal.style.left = `${(window.innerWidth - rect.width) / 2}px`;
    }

    setContent(content) {
        this.content = content;
        const codeEl = this.contentEl.querySelector('pre code');
        if (codeEl) {
            codeEl.textContent = content;
        }
    }

    makeDraggable(modalEl, titleBar) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        titleBar.style.cursor = 'move';

        titleBar.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            modalEl.style.top = (modalEl.offsetTop - pos2) + "px";
            modalEl.style.left = (modalEl.offsetLeft - pos1) + "px";
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
}

const DEFAULT_SETTINGS = {
    pythonPath: 'python'
};

class PythonRunnerPlugin extends Plugin {
    async onload() {
        await this.loadSettings();
        
        this.addSettingTab(new PythonRunnerSettingTab(this.app, this));
        
        this.registerMarkdownCodeBlockProcessor('python', (source, el, ctx) => {
            const wrapper = el.createDiv({ cls: 'python-code-wrapper' });
            const pre = wrapper.createEl('pre');
            pre.createEl('code', { text: source });
            
            const runButton = wrapper.createEl('button', {
                text: '运行',
                cls: 'python-run-button'
            });
            
            runButton.addEventListener('click', async () => {
                const execWindow = new ExecWindow(this.app);
                execWindow.open();
                try {
                    const result = await this.executePythonCode(source);
                    execWindow.setContent(result);
                } catch (error) {
                    execWindow.setContent(error.toString());
                }
            });
        });
    }
    
    async executePythonCode(code) {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const execAsync = promisify(exec);
        
        const tmpFile = path.join(os.tmpdir(), `obsidian-python-${Date.now()}.py`);
        
        try {
            fs.writeFileSync(tmpFile, code, { encoding: 'utf8' });
            
            const setEncoding = process.platform === 'win32' ? 'chcp 65001 > nul && ' : '';
            
            const command = `${setEncoding}"${this.settings.pythonPath}" -u "${tmpFile}"`;
            const { stdout, stderr } = await execAsync(command, {
                timeout: 30000,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    PYTHONIOENCODING: 'utf-8'
                }
            });
            
            return stdout || stderr || '代码执行完成，无输出';
        } catch (error) {
            return `执行错误：${error.message}`;
        } finally {
            try {
                fs.unlinkSync(tmpFile);
            } catch (e) {
                console.error('清理临时文件失败:', e);
            }
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
            .setName('Python 路径')
            .setDesc('设置 Python 解释器的路径')
            .addText(text => text
                .setPlaceholder('输入 Python 路径')
                .setValue(this.plugin.settings.pythonPath)
                .onChange(async (value) => {
                    this.plugin.settings.pythonPath = value;
                    await this.plugin.saveSettings();
                }));
    }
}

module.exports = PythonRunnerPlugin; 