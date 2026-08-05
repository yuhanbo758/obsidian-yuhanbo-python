# Yuhanbo Python Runner

Run Python code blocks with a local Python interpreter and view their output without leaving Obsidian.

## Features

- Adds a **Run Python** button to rendered `python` code blocks.
- Displays standard output and errors in an Obsidian modal.
- Copies execution results to the clipboard on request.
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

Open the note in Reading view, select **Run Python**, and review the output in the modal.

If `python` is not available on your system path, open **Settings → Community plugins → Yuhanbo Python Runner** and enter the executable name or absolute path, such as `C:\Python312\python.exe`.

## Security and privacy

> [!WARNING]
> Python code has the same operating-system permissions as Obsidian. It can read, change, upload, or delete local data. Run code only from vaults and notes you trust. This plugin does not sandbox Python.

For each run, the plugin writes the code to a uniquely created operating-system temporary directory, launches the configured interpreter without a command shell, and then removes the temporary directory on a best-effort basis.

The plugin itself does not send telemetry, make network requests, or display advertisements. The configured interpreter path is stored locally in Obsidian's plugin data. Output is copied to the clipboard only when you select **Copy result**. Python code you run may perform its own network or file-system operations.

## Installation

Once approved, install the plugin from **Settings → Community plugins → Browse** and search for **Yuhanbo Python Runner**.

For manual installation, download `main.js`, `manifest.json`, and `styles.css` from a GitHub release and place them in:

```text
<vault>/.obsidian/plugins/yuhanbo-python-runner/
```

Restart Obsidian and enable the plugin.

## Development and releases

`main.js` is the maintained plugin source and release artifact. Run the local syntax check with:

```bash
npm ci
npm run build
```

Changes to release-relevant files on `main` are validated by GitHub Actions. The workflow synchronizes versions, creates an exact `x.y.z` tag, and attaches the required Obsidian release assets.

## Support

Report bugs and request features through [GitHub Issues](https://github.com/yuhanbo758/obsidian-yuhanbo-python/issues).

## License

[Apache License 2.0](LICENSE)
