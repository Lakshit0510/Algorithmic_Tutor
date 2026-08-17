Release-only model resource location.

Put the verified `qwen2.5-1.5b-instruct-q4_k_m.gguf` here before `pnpm desktop:build`.
The desktop application starts `llama-server` with this model when present. A packaged
installer includes this file as a read-only resource; users can select an Ollama model instead.
