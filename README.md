# Yuhanbo Python Runner

Run Python code blocks with a local Python interpreter and view their output without leaving Obsidian.

## Features

- Adds **运行** (Run) and **复制** (Copy) buttons to rendered `python` code blocks and highlights Python syntax in Reading view.
- Displays standard output and errors in an Obsidian modal.
- Copies selected output or the whole result to the clipboard on request.
- Runs all supported Python code blocks in the active note from one command.
- Schedules daily, weekly, and one-time runs and saves their output to notes.
- Supports a configurable Python executable path.
- Stops executions that exceed 30 seconds.

## Requirements

- Obsidian 1.7.2 or later on desktop.
- Python 3 installed locally.

This plugin is desktop-only because it launches a local Python process. It does not work on Obsidian Mobile.

## Usage

Create a fenced Python code block in a note:

```python
print("Hello from Python!")
```

Open the note in Reading view, select **运行** (Run), and review the output in the modal. To run the Python blocks in the current note together, use **运行当前文件中的Python代码** in the command palette. Assign a shortcut under **Settings → Hotkeys** if you want one.

If `python` is not available on your system path, open **Settings → Yuhanbo Python Runner** and enter the executable name or its full path.

### Scheduled tasks

Under the plugin settings, choose **添加定时任务** (Add scheduled task). Select a Markdown note and an existing output folder, then choose daily, weekly, or one-time execution. Choose `/` to save to the vault root. Times and dates are local to the desktop running Obsidian. Obsidian must remain open with the plugin enabled for its scheduler to run.

Each task reads the saved note and executes the Python blocks in order. The default result filename includes the timestamp. If a result already exists under the chosen name, the plugin adds a numeric suffix and keeps the existing result.

## Security and privacy

> [!WARNING]
> Python code has the same operating-system permissions as Obsidian. It can read, change, upload, or delete local data. Run code only from vaults and notes you trust. This plugin does not sandbox Python.

For each run, the plugin writes the code to a unique file in the operating-system temporary directory, launches the configured interpreter without a command shell, and removes the file when execution ends. There are no active scheduled tasks until you add one. A scheduled task reads the latest saved content of the selected note, so schedule only notes whose contents and changes you trust.

The plugin itself does not send telemetry, make network requests, require an account or API key, or display advertisements. Obsidian stores the interpreter path and task configuration in the plugin's local `data.json`. Scheduled output stays in the selected vault folder. Output is copied to the clipboard only when you request it. Python code you run may perform its own network or file-system operations.

## Installation

Install the plugin from **Settings → Community plugins → Browse** and search for **Yuhanbo Python Runner**. Existing Community installations can update from the same settings page.

For manual installation, download `main.js`, `manifest.json`, and `styles.css` from a GitHub release and place them in:

```text
<vault>/.obsidian/plugins/yuhanbo-python-runner/
```

Reload Obsidian and enable the plugin. For an older manually installed build that used the `obsidian-yuhanbo-python` ID, back up your local settings, enable only the build you plan to use, and reconfigure the interpreter and any tasks you want to keep.

## Development and releases

The maintained plugin source is `src/plugin.js`. The build checks the source and emits `main.js` as the release artifact:

```bash
npm ci
npm run build
npm test
```

Changes to release-relevant files on `main` are validated by GitHub Actions. The workflow synchronizes versions, creates an exact `x.y.z` tag, and attaches the required Obsidian release assets.

## Support

Report bugs and request features through [GitHub Issues](https://github.com/yuhanbo758/obsidian-yuhanbo-python/issues).

## License

[Apache License 2.0](LICENSE)

<!-- sanrenjz-promotion:start -->

## 👨‍💻 作者信息

**余汉波** - 编程爱好者-量化交易和效率工具开发

- **GitHub**: [@yuhanbo758](https://github.com/yuhanbo758)

- **Email**: yuhanbo@sanrenjz.com

- **Website**: [三人聚智](https://www.sanrenjz.com)

## 🌐 相关链接

- 🏠 [项目主页](https://www.sanrenjz.com)

- 📚 [在线文档](https://docs.sanrenjz.com)（财经、代码和库文档等）

- 🛒 [插件商店](https://shop.sanrenjz.com)（所有程序，包括开源和不开源）


## 联系我们

[联系我们 - 三人聚智-余汉波](https://www.sanrenjz.com/contact_us/)

证券开户（+V：yuhanbo758）：[证券开户免5万0.854，无门槛开量化QMT，送框架策略，支持VIP快速通道，也可开Ptrade | 余汉波 文档](https://docs.sanrenjz.com/article/%E8%AF%81%E5%88%B8%E5%BC%80%E6%88%B7%E5%85%8D5%20%E4%B8%870.854%EF%BC%8C%E6%97%A0%E9%97%A8%E6%A7%9B%E5%BC%80%E9%87%8F%E5%8C%96QMT%EF%BC%8C%E9%80%81%E6%A1%86%E6%9E%B6%E7%AD%96%E7%95%A5%EF%BC%8C%E6%94%AF%E6%8C%81VIP%E5%BF%AB%E9%80%9F%E9%80%9A%E9%81%93%EF%BC%8C%E4%B9%9F%E5%8F%AF%E5%BC%80Ptrade)

三人聚智下载：[sanrenjz - 三人聚智](https://www.sanrenjz.com/sanrenjz/)

codebot 下载：[sanrenjz-codebot - 三人聚智-余汉波](https://www.sanrenjz.com/sanrenjz-codebot/)

![三码合一](https://gdsx.sanrenjz.com/image/sanrenjz_yuhanbolh_yuhanbo758.png?imageSlim&t=1ab9b82c-e220-8022-beff-e265a194292a)

![余汉波打赏码](https://gdsx.sanrenjz.com/image/%E6%89%93%E8%B5%8F%E7%A0%81%E5%90%88%E4%B8%80.png?imageSlim)

## 🙏 致谢

感谢所有为本项目贡献代码和想法的开发者们！

---
**⭐ 如果这个项目对您有帮助，请给它一个 Star！**
<!-- sanrenjz-promotion:end -->
