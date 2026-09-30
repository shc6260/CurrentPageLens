# Current Page Lens

<details>
<summary>Language / 언어</summary>

- [한국어](README.md)
- **English**

</details>

A Chrome extension that uses **Chrome Built-in AI to analyze the text and images on your current webpage locally**.

It combines an analysis preset with your question, organizes key information, confirmed facts, observations, and unknowns, and displays the results in a Side Panel. It works with general webpages, technical documentation, work issues, and error screens.

## Features

- **Current-page extraction**: Collects the title, URL, main text, headings, links, selected text, key UI text, and image information.
- **Preset-based analysis**: Choose a preset and ask your own question.
- **Facts, observations, and unknowns**: Prompts the model to distinguish directly supported facts from interpretations and information that cannot be determined.
- **Source references**: Use source buttons to locate the collected evidence on the original page.
- **Image analysis**: In supported environments, structures visible text, observations, and uncertainty from image pixels.
- **Custom presets**: Save, edit, delete, and select your own prompts locally.
- **Status and error display**: Shows model availability, download progress, analysis progress, and errors.
- **JSON export**: Saves structured results and source evidence as a JSON file.

## Analysis presets

| Preset | Focus |
| --- | --- |
| General page analysis | Key points, confirmed facts, important details, observations, unknowns, and evidence |
| Jira issue analysis | Requirements, confirmed facts, important comment and attachment evidence, unknowns, and search keywords |
| Developer documentation | Concepts, APIs, usage, constraints, examples, cautions, deprecation, and compatibility |
| Error and incident analysis | Symptoms, error messages, confirmed facts, possible causes, additional checks, and documented remedies |
| Custom | Analysis guided by your own prompt |

A preset defines the analysis direction, while your question takes priority.

For example, ask **“Does this screen contain clues that suggest a database issue?”** with the incident preset, or **“Find only the constraints in this document”** with the documentation preset.

## Installation

No build step or npm installation is required to load the extension.

1. Select **Code → Download ZIP** in this repository, or clone it.
2. Extract the archive and locate the project folder containing `manifest.json`.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Click **Load unpacked** and select the project folder.
6. Click the extension icon on the webpage you want to analyze to open the Side Panel.

After switching tabs or navigating to a different site, click the extension icon again on that tab to grant access. The default shortcut is `Alt+Shift+A`; you can change it at `chrome://extensions/shortcuts`.

## Usage

The extension interface uses Korean labels. English output is available in the result-language selector.

1. Check the Built-in AI status, which is detected automatically when the panel opens.
2. If a model download is required, click **모델 준비 / 다운로드** (Prepare model / Download). **현재 페이지 분석** (Analyze current page) can also start model preparation.
3. Select an analysis preset and enter your question.
4. Optionally enable page-image analysis, visible-viewport capture, or selected-text-only analysis.
5. Click **현재 페이지 분석** (Analyze current page) and review the results and evidence.
6. Change the question or preset and click **다시 분석** (Analyze again), or use **JSON 저장** (Save JSON) to export the result.

### Built-in AI setup

When the panel opens, it checks the following states using the official `LanguageModel.availability()` API.

| State | Guidance |
| --- | --- |
| Ready to use | Analysis can run. |
| Local model download required | Click the model-preparation or analysis button to start the download. |
| Model downloading | Wait for the download and model loading to complete. |
| Unavailable in this environment | Check the Chrome version, hardware, storage, and browser policies. |

The download starts through the official `LanguageModel.create()` API after a user button interaction. Installing the extension or opening the panel alone does not start a download or collect page data. Manual `chrome://flags` configuration is not a default requirement.

## Environment and collection scope

- Requires desktop Chrome 138 or later and an environment that supports Chrome Built-in AI. Actual availability is checked separately for text and image input.
- A network connection is needed to download the model. AI inference runs locally after the download. See the [official Chrome documentation](https://developer.chrome.com/docs/ai/prompt-api) for system requirements.
- The UI is in Korean. Korean output is an experimental option; model language support and output quality require separate evaluation.
- Collects content currently loaded on the page. Collapsed comments, content outside virtualized scrolling regions, iframes, CSS background images, and other content may be omitted.
- Image analysis depends on model support and pixel access. When an image cannot be read, for example because of CORS, its metadata and failure reason are retained.
- Analyzes up to four page images. A capture of the currently visible viewport is added only when you select that option.
- Chrome-restricted pages, such as `chrome://` pages, the Chrome Web Store, and other extension pages, cannot be collected.

## Architecture

Page extraction, analysis instructions, AI invocation, and presentation are separate components.

| Path | Responsibility |
| --- | --- |
| `content/` | Generic page extraction and optional site-landmark identification |
| `ai/prompts.js` | Built-in presets, fact and evidence rules, and result schemas |
| `ai/analyzer.js` | Availability checks, model preparation, and image/text analysis |
| `presets/` | Local storage and management of custom presets |
| `core/` | UI-independent orchestration connecting extraction and analysis |
| `sidepanel/` | Question and preset controls, status display, and result rendering |
| `service-worker.js` | Side Panel opening configuration |

The Jira helper identifies the locations of the title, description, comments, and attachments. Presets define how the collected data is analyzed. The core analysis functions return JSON objects independently of UI rendering.

## Privacy and permissions

- Page content is not sent to external AI APIs or servers.
- Page collection starts only when you click an analysis button.
- Full page text and image base64 data are not written to console logs.
- Custom presets are stored in `chrome.storage.local`; collected text and analysis results remain in the panel's memory.
- Data is exported to a file only when you choose Save JSON.
- Uses the `activeTab`, `scripting`, `storage`, and `sidePanel` permissions.

## Development tests

Run unit tests in a Node.js environment:

```bash
npm test
```

Browser integration tests require Playwright and Chrome for Testing:

```bash
CPA_CHROME=/absolute/path/to/chrome npm run test:browser
```
