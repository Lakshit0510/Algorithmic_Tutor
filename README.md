# Algorithmic Tutor

Algorithmic Tutor is a Codeforces-only mentor that teaches problem-solving reasoning without returning copy-paste code or full solutions. It reads a Codeforces problem, builds a strategy map, and reviews the learner’s own pseudocode for correctness, invariants, edge cases, and complexity.

## Highlights

- Codeforces URL validation, official metadata, statement extraction, and a pasted-statement fallback.
- A persistent, scrollable mentor chat: each learner approach stays paired with its mentor review until the anonymous session expires.
- Conservative `isSolved` decisions: malformed model output never marks an approach solved.
- Local Ollama support with installed-model discovery.
- Windows desktop profiles for Ollama, OpenAI, Groq, OpenRouter and compatible APIs, Anthropic, and Google Gemini.
- In the Windows app, API keys are stored in Windows Credential Manager—not browser storage, tutoring-session SQLite data, logs, or frontend environment variables.
- Docker/EC2 deployment for the public site, with expiring anonymous context, logging, rate limits, and server-managed secrets.

## Choose how to use it

| Option | Best for | AI setup |
|---|---|---|
| Public web deployment | Sharing a demo | One server-managed provider key |
| Windows desktop installer | Personal use and BYOK | Local Ollama or your own cloud key |
| Offline Windows edition | No cloud account or network after installation | Bundled GGUF model |

## Local web development

Install Node 22+ and pnpm, then:

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

### Local Ollama

Install Ollama for Windows, pull a model, and make sure it is running:

```powershell
ollama pull qwen2.5:1.5b
ollama list
```

Open **Mentor settings**, keep **Default local Ollama** selected, and start a Codeforces problem. The desktop app can detect available Ollama models through its local API.

## Windows desktop installer

The standard Windows release is a small current-user installer named like:

```text
Algorithmic-Tutor-0.2.0-x64-Setup.exe
```

It includes the frontend and backend sidecar. It does **not** require Node.js, pnpm, Docker, Rust, or AWS on the learner’s computer.

### Use Ollama in the desktop app

1. Install Ollama from [ollama.com](https://ollama.com/download/windows).
2. Run `ollama pull qwen2.5:1.5b` or pull another supported chat model.
3. Install and open Algorithmic Tutor.
4. Open **Mentor settings**.
5. Use **Default local Ollama**, or add a named Local Ollama profile and select a pulled model.
6. Start a Codeforces problem.

Ollama’s Windows app serves its API on `http://localhost:11434`; the app only permits HTTP endpoints on loopback addresses for local engines. [Ollama Windows documentation](https://docs.ollama.com/windows)

### Use a cloud API key in the desktop app

1. Open **Mentor settings**.
2. Under **Add provider profile**, select OpenAI, Groq, OpenRouter, Anthropic, Google Gemini, or OpenAI-compatible API.
3. Enter a model ID and, for compatible APIs, its HTTPS base URL.
4. Enter the provider API key and select **Save profile**.
5. Select the saved profile under **Active profile**.
6. Select **Test connection** before starting a session.

The key is stored in Windows Credential Manager and re-provisioned only into the local backend’s memory when the app starts. The public web deployment deliberately does not accept browser-supplied API keys.

## Offline Windows edition

The offline edition is a separate, larger installer. It bundles a pinned `llama-server` binary and a Qwen GGUF, so it can mentor without Ollama or a cloud API key after installation.

To use a published offline installer:

1. Download the release asset ending in `Offline-Setup.exe` from GitHub Releases.
2. Install it and open the app.
3. Open **Mentor settings**.
4. Add/select **Bundled offline GGUF**.
5. Start a Codeforces problem.

The first release should use the standard Ollama/BYOK installer. Build and publish the offline edition only after verifying the exact llama.cpp binary, required DLLs, GGUF licence, and SHA-256 checksums.

### Build the offline installer locally

Place verified Windows x64 artifacts at:

```text
src-tauri/binaries/llama-server-x86_64-pc-windows-msvc.exe
src-tauri/resources/models/qwen2.5-1.5b-instruct-q4_k_m.gguf
```

Then run:

```powershell
pnpm install
pnpm desktop:build:offline
```

The offline bundle uses [src-tauri/tauri.offline.conf.json](src-tauri/tauri.offline.conf.json) to map the model to the runtime resource path. Publish third-party licences and checksums alongside that release.

## Build the standard installer locally

Windows build prerequisites: Node 22+, pnpm, Rust stable with the MSVC toolchain, and the WebView2 runtime or internet access for its bootstrapper.

```powershell
pnpm install
pnpm desktop:build
```

The NSIS installer is written under:

```text
src-tauri/target/release/bundle/nsis
```

`pnpm desktop:build` packages the Node backend as `tutor-api.exe` before running Tauri. Use `pnpm desktop:smoke` to build the sidecar and backend as a preliminary check.

## Release a Windows installer through GitHub

The repository includes a tag-based Windows release workflow. For a release:

```powershell
git add .
git commit -m "Add desktop mentor profiles and chat"
git push origin main
git tag desktop-v0.2.0
git push origin desktop-v0.2.0
```

Then open GitHub **Actions**, wait for **Publish Windows desktop installer**, and review the draft release. Download and test its NSIS asset on a clean Windows computer before publishing it.

The workflow builds the sidecar, runs application checks, produces the installer, uploads its SHA-256 checksum, and attaches the artifact to the GitHub Release. Tauri’s GitHub release workflow is documented [here](https://v2.tauri.app/distribute/pipelines/github/).

For an initial demo, an unsigned installer is usable but Windows SmartScreen may warn users. Sign the main executable, sidecar, and installer before broad distribution. [Tauri Windows signing documentation](https://v2.tauri.app/distribute/sign/windows/)

## Public Docker/EC2 deployment

The public app remains server-managed:

- Set `APP_MODE=cloud`.
- Select one `LLM_PROVIDER` and configure only its server-side secret in `.env.production`.
- Keep `VITE_API_ORIGIN` pointed at the HTTPS backend URL when frontend and backend are deployed separately.
- Never copy API keys into Vercel variables prefixed with `VITE_`.

For Docker and EC2 setup, see [AWS_EC2_DEPLOYMENT.md](docs/AWS_EC2_DEPLOYMENT.md).

## Privacy and safety

- No account or login is required.
- The browser stores only an anonymous session ID.
- Tutor context is stored in SQLite only until `SESSION_TTL_MINUTES` expires.
- Expired sessions are deleted automatically.
- API keys are never part of `TutorState`, chat turns, API responses, or application logs.
- The mentor prompt forbids source code, full pseudocode, and complete solutions.

## Validation

```powershell
pnpm lint
pnpm test
pnpm build
```

Backend provider tests use mocked services; do not use real keys in CI.
