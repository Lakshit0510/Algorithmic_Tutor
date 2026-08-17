use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      // The UI only talks to this loopback API. No cloud secret is ever present in the frontend bundle.
      let _api = app.shell().sidecar("tutor-api")?.args(["--port", "8787"]).spawn()?;

      let model_path = app.path().resource_dir()?
        .join("models")
        .join("qwen2.5-1.5b-instruct-q4_k_m.gguf");
      if model_path.exists() {
        let runner_args = vec!["--model".to_owned(), model_path.to_string_lossy().to_string(), "--host".to_owned(), "127.0.0.1".to_owned(), "--port".to_owned(), "8080".to_owned(), "--ctx-size".to_owned(), "4096".to_owned()];
        let _runner = app.shell().sidecar("llama-server")?
          .args(runner_args)
          .spawn()?;
      } else {
        eprintln!("Bundled GGUF absent. Choose Ollama in Mentor settings or add the model before packaging.");
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running Algorithmic Tutor");
}
