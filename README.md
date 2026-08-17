# Algorithmic Tutor

An anti-solution competitive-programming mentor for Codeforces. It fetches a public Codeforces problem page, grounds a tutoring strategy in its tags/rating, then reviews pseudocode against correctness and complexity without producing implementation code.

## What is included

- React + Vite + Tailwind split-pane learning UI
- Express + LangGraph tutoring API with a persistent in-memory session loop
- Codeforces-only URL validation, public statement parsing, and official API metadata
- Four provider modes: bundled GGUF via `llama-server`, user-configured Ollama, Groq, and OpenAI for cloud deployment
- Windows-first Tauri v2 shell which starts the Node API and bundled `llama-server` sidecars
- Vitest API tests, GitHub Actions CI, Render and Vercel manifests

## Development

Install Node 22+ and pnpm, then run:

```powershell
Copy-Item .env.example .env
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The default local runner assumes `llama-server` is available at port 8080. Switch to Ollama in the UI if that is what you have installed.

## Desktop packaging

The Tauri desktop build expects two Windows sidecars and the selected GGUF file. Place them as follows before building:

```
src-tauri/binaries/tutor-api-x86_64-pc-windows-msvc.exe
src-tauri/binaries/llama-server-x86_64-pc-windows-msvc.exe
src-tauri/resources/models/qwen2.5-1.5b-instruct-q4_k_m.gguf
```

Run `pnpm prepare:sidecars` to package the API executable with `@yao-pkg/pkg`. Obtain a Windows x64 `llama-server` release from the official `ggml-org/llama.cpp` releases and the Apache-2.0 Qwen2.5 1.5B Instruct Q4_K_M GGUF from a trusted distributor, verify checksums, then put them at the paths above. This deliberately keeps third-party binaries and model weights out of source control while allowing the final NSIS installer to bundle them.

```powershell
pnpm prepare:sidecars
pnpm desktop:build
```

The final installer is written under `src-tauri/target/release/bundle/nsis`.

## Deploying

For Render/Vercel, set the deployed Vercel origin in Render and Vercel's `VITE_API_ORIGIN` to the Render API URL. Select either `LLM_PROVIDER=openai` with `OPENAI_API_KEY` and `OPENAI_MODEL=gpt-5.4`, or `LLM_PROVIDER=groq` with `GROQ_API_KEY`; cloud mode never exposes either key to the frontend.

For a single Dockerized AWS EC2 deployment with HTTPS, request logging, rate limiting, and anonymous expiring SQLite session context, follow [the EC2 deployment guide](docs/AWS_EC2_DEPLOYMENT.md).

## Safety boundary

The mentor prompt explicitly forbids direct code, complete algorithms, and copy-paste solutions. It gives conceptual, complexity-aware feedback only.
