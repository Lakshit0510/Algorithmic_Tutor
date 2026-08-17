import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const backend = resolve(root, "backend");
const output = resolve(root, "src-tauri", "binaries", "tutor-api-x86_64-pc-windows-msvc.exe");

function run(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)));
  });
}

await run("pnpm", ["--filter", "@algorithmic-tutor/backend", "build"], root);
await run("pnpm", ["exec", "pkg", "--target", "node22-win-x64", "--output", output, "dist/server.js"], backend);
await mkdir(resolve(root, "src-tauri", "binaries"), { recursive: true });
// pkg writes directly to output. This verifies that packaging produced a usable artifact.
await access(output);
