const assert = require('node:assert/strict');
const Module = require('node:module');

// main.js 只需要这些 Obsidian 基类即可完成本次执行链路测试。
// 在 Node.js 中提供最小替身，避免把 Obsidian 桌面程序纳入 CI。
class MockPlugin {}
class MockModal {}
class MockPluginSettingTab {}
class MockSetting {}

const originalLoad = Module._load;
Module._load = function loadWithObsidianMock(request, parent, isMain) {
    if (request === 'obsidian') {
        return {
            Modal: MockModal,
            Notice: class MockNotice {},
            Plugin: MockPlugin,
            PluginSettingTab: MockPluginSettingTab,
            Setting: MockSetting
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};

async function run() {
    try {
        const PythonRunnerPlugin = require('../main.js');
        const plugin = new PythonRunnerPlugin();
        plugin.settings = {
            pythonPath: process.env.PYTHON_COMMAND || (process.platform === 'win32' ? 'python' : 'python3')
        };

        const output = await plugin.executePythonCode(
            'import sys\nprint("你好，Obsidian")\nprint("stderr-ok", file=sys.stderr)'
        );

        assert.match(output, /你好，Obsidian/);
        assert.match(output, /stderr-ok/);
        console.log('Runtime smoke test passed.');
    } finally {
        Module._load = originalLoad;
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
