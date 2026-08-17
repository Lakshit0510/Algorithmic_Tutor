This directory is populated at release packaging time.

Tauri resolves an external sidecar named `name` from a sibling executable named
`name-x86_64-pc-windows-msvc.exe` on Windows x64. The release workflow must place:

- `tutor-api-x86_64-pc-windows-msvc.exe`, created by `pnpm prepare:sidecars`
- `llama-server-x86_64-pc-windows-msvc.exe`, from a verified llama.cpp Windows x64 release

The executables are ignored by Git because they are built or third-party release artifacts.
