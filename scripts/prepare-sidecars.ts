import { access, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const backend = resolve(root, "backend");
const outputDir = resolve(root, "src-tauri", "binaries");
const targetTriple = process.env.TAURI_ENV_TARGET_TRIPLE ?? process.env.TAURI_TARGET_TRIPLE ?? "x86_64-pc-windows-msvc";
const output = resolve(outputDir, `tutor-api-${targetTriple}.exe`);

function run(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited with ${code}`)));
  });
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await run("pnpm", ["--filter", "@algorithmic-tutor/backend", "build"], root);
  await run("pnpm", ["exec", "pkg", "--target", "node22-win-x64", "--output", output, "dist/server.js"], backend);
  // pkg writes directly to output. Verify a non-empty artifact before Tauri starts.
  await access(output);
  if ((await stat(output)).size === 0) throw new Error("Packaged tutor API sidecar is empty.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
