use rand::RngCore;
use serde::Serialize;
use std::{fs::create_dir_all, net::TcpListener, sync::Mutex};
use tauri::{path::BaseDirectory, Manager, RunEvent, State};
use tauri_plugin_shell::{process::{CommandChild, CommandEvent}, ShellExt};

const KEYRING_SERVICE: &str = "Algorithmic Tutor";

struct DesktopRuntime {
  api_origin: String,
  token: String,
  children: Mutex<Vec<CommandChild>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
  api_origin: String,
  token: String,
}

fn random_token() -> String {
  let mut bytes = [0_u8; 32];
  rand::thread_rng().fill_bytes(&mut bytes);
  bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn provision(runtime: &DesktopRuntime, profile_id: &str, secret: &str) -> Result<(), String> {
  let endpoint = format!("{}/api/desktop/credentials/{}", runtime.api_origin, profile_id);
  ureq::put(&endpoint)
    .set("authorization", &format!("Bearer {}", runtime.token))
    .send_json(serde_json::json!({ "secret": secret }))
    .map_err(|error| format!("Unable to provision the desktop key: {error}"))?;
  Ok(())
}

fn delete_provisioned(runtime: &DesktopRuntime, profile_id: &str) -> Result<(), String> {
  let endpoint = format!("{}/api/desktop/credentials/{}", runtime.api_origin, profile_id);
  ureq::delete(&endpoint)
    .set("authorization", &format!("Bearer {}", runtime.token))
    .call()
    .map_err(|error| format!("Unable to remove the desktop key: {error}"))?;
  Ok(())
}

#[tauri::command]
fn desktop_runtime(runtime: State<DesktopRuntime>) -> RuntimeInfo {
  RuntimeInfo { api_origin: runtime.api_origin.clone(), token: runtime.token.clone() }
}

#[tauri::command]
fn save_provider_secret(runtime: State<DesktopRuntime>, profile_id: String, secret: String) -> Result<(), String> {
  if profile_id.trim().is_empty() || secret.trim().is_empty() { return Err("A provider profile and API key are required.".into()); }
  let entry = keyring::Entry::new(KEYRING_SERVICE, &profile_id).map_err(|error| error.to_string())?;
  entry.set_password(&secret).map_err(|error| error.to_string())?;
  provision(&runtime, &profile_id, &secret)
}

#[tauri::command]
fn delete_provider_secret(runtime: State<DesktopRuntime>, profile_id: String) -> Result<(), String> {
  let entry = keyring::Entry::new(KEYRING_SERVICE, &profile_id).map_err(|error| error.to_string())?;
  // An absent credential is already the desired state.
  let _ = entry.delete_credential();
  delete_provisioned(&runtime, &profile_id)
}

#[tauri::command]
fn provision_provider_secrets(runtime: State<DesktopRuntime>, profile_ids: Vec<String>) -> Result<(), String> {
  for profile_id in profile_ids {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &profile_id).map_err(|error| error.to_string())?;
    if let Ok(secret) = entry.get_password() { provision(&runtime, &profile_id, &secret)?; }
  }
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![desktop_runtime, save_provider_secret, delete_provider_secret, provision_provider_secrets])
    .setup(|app| {
      let listener = TcpListener::bind("127.0.0.1:0")?;
      let port = listener.local_addr()?.port();
      drop(listener);
      let token = random_token();
      let data_dir = app.path().app_data_dir()?;
      create_dir_all(&data_dir)?;
      let database_path = data_dir.join("tutor-sessions.db");
      let (mut receiver, api_child) = app.shell().sidecar("tutor-api")?
        .args(["--port", &port.to_string()])
        .env("APP_MODE", "desktop")
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("SESSION_DB_PATH", database_path)
        .env("DESKTOP_RUNTIME_TOKEN", &token)
        .spawn()?;
      tauri::async_runtime::spawn(async move {
        while let Some(event) = receiver.recv().await {
          match event {
            CommandEvent::Stdout(line) | CommandEvent::Stderr(line) => eprintln!("[tutor-api] {}", String::from_utf8_lossy(&line)),
            CommandEvent::Error(error) => eprintln!("[tutor-api] {error}"),
            CommandEvent::Terminated(status) => eprintln!("[tutor-api] terminated: {:?}", status.code),
            _ => {}
          }
        }
      });
      let mut children = vec![api_child];
      let model_path = app.path().resolve("models/qwen2.5-1.5b-instruct-q4_k_m.gguf", BaseDirectory::Resource)?;
      if model_path.exists() {
        let (_runner_events, runner) = app.shell().sidecar("llama-server")?
          .args(["--model", &model_path.to_string_lossy(), "--host", "127.0.0.1", "--port", "8080", "--ctx-size", "8192"])
          .spawn()?;
        children.push(runner);
      }
      app.manage(DesktopRuntime { api_origin: format!("http://127.0.0.1:{port}"), token, children: Mutex::new(children) });
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building Algorithmic Tutor");

  app.run(|app_handle, event| {
    if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
      if let Some(runtime) = app_handle.try_state::<DesktopRuntime>() {
        if let Ok(mut children) = runtime.children.lock() {
          for child in children.drain(..) { let _ = child.kill(); }
        }
      }
    }
  });
}
