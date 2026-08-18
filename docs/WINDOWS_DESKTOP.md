# Windows desktop release guide

## Standard installer

The standard installer ships the Tauri application and `tutor-api.exe`. It supports:

- Local Ollama models already installed by the user.
- Desktop provider profiles and user-supplied cloud API keys.
- Windows Credential Manager storage for desktop keys.

It does not bundle model weights, Ollama, or `llama-server`.

Run locally:

```powershell
pnpm install
pnpm desktop:build
```

## GitHub prerelease

1. Confirm `pnpm lint`, `pnpm test`, and `pnpm build` succeed.
2. Update the version in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` together.
3. Commit and push `main`.
4. Create and push a tag such as `desktop-v0.2.0`.
5. In GitHub Actions, wait for `Publish Windows desktop installer`.
6. Download the generated installer and SHA-256 file.
7. Test on a machine without Node, pnpm, Rust, or the repository checkout.
8. Publish the GitHub draft release only after testing.

## Offline edition

The offline edition is intentionally separate. Before building it, verify the third-party binary/model licence, source URL, version, and SHA-256 checksum. Place the assets at the paths documented in the README and run:

```powershell
pnpm desktop:build:offline
```

The offline installer must be tested on a clean device. Confirm that the model starts, the required llama.cpp DLLs are present when applicable, the app exits without orphaning sidecars, and chat sessions expire as configured.
