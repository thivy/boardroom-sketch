use std::fs::{self, OpenOptions};
use std::io::Write;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

const START_TIMEOUT: Duration = Duration::from_secs(90);

/// The Bun process that serves the app; stopped when the app exits.
struct Server(Mutex<Option<CommandChild>>);

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .expect("no free local port")
}

fn is_listening(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// A bundle has the server as a resource; in development it is the copy `prepare-sidecar` made.
fn server_entry(app: &tauri::AppHandle) -> PathBuf {
    let bundled = app
        .path()
        .resource_dir()
        .map(|dir| dir.join("server").join("server").join("index.mjs"));
    let path = match bundled {
        Ok(path) if path.exists() => path,
        _ => PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("server/server/index.mjs"),
    };
    plain_path(path)
}

/// Windows resource paths come back as `\\?\C:\...`; a script path in that form is not reliably resolved.
fn plain_path(path: PathBuf) -> PathBuf {
    match path.to_string_lossy().strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC") => PathBuf::from(rest),
        _ => path,
    }
}

/// Replaces the loading page's content, so a failure is on screen instead of an endless "Starting…".
/// It repeats for a moment, because the loading page may not have finished loading yet.
fn show(window: &tauri::WebviewWindow, title: &str, detail: &str) {
    let payload = serde_json::json!({ "title": title, "detail": detail });
    let script = format!("window.__showStartupError && window.__showStartupError({payload})");
    let window = window.clone();
    std::thread::spawn(move || {
        for delay in [0, 500, 1500, 3000] {
            std::thread::sleep(Duration::from_millis(delay));
            let _ = window.eval(script.clone());
        }
    });
}

/// The last lines the server printed, which usually name the cause.
fn tail(lines: &[String]) -> String {
    let start = lines.len().saturating_sub(30);
    lines[start..].join("\n")
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // `tauri dev --config src-tauri/tauri.dev.conf.json` points the window at the Vite dev server,
            // which is the server and has hot reload, so there is no bundled server to start.
            if tauri::is_dev() && app.config().build.dev_url.is_some() {
                return Ok(());
            }

            let window = app.get_webview_window("main").expect("main window");
            let port = free_port();

            // Transcripts and the server log live in the app's data folder.
            let data = app.path().app_data_dir()?;
            fs::create_dir_all(&data)?;
            let log_path = data.join("server.log");
            let entry = server_entry(app.handle());

            let spawned = app
                .shell()
                .sidecar("bun")
                .map_err(|error| format!("The bundled Bun runtime was not found: {error}"))
                .and_then(|command| {
                    command
                        .args([entry.clone()])
                        .env("PORT", port.to_string())
                        .env("HOST", "127.0.0.1")
                        .env("TRANSCRIPTS_DB", data.join("transcripts.db"))
                        .spawn()
                        .map_err(|error| format!("The server could not be launched: {error}"))
                });

            let (mut events, child) = match spawned {
                Ok(started) => started,
                Err(error) => {
                    show(
                        &window,
                        "Boardroom Sketch could not start its server.",
                        &format!("{error}\n\nServer file: {}\nLog: {}", entry.display(), log_path.display()),
                    );
                    return Ok(());
                }
            };
            app.manage(Server(Mutex::new(Some(child))));

            // Everything the server prints goes to the log file, and is kept to show if it fails.
            let output = Arc::new(Mutex::new(Vec::<String>::new()));
            let stopped = Arc::new(Mutex::new(None::<String>));
            {
                let (output, stopped) = (output.clone(), stopped.clone());
                let mut log = OpenOptions::new()
                    .create(true)
                    .write(true)
                    .truncate(true)
                    .open(&log_path)
                    .ok();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = events.recv().await {
                        let line = match event {
                            CommandEvent::Stdout(bytes) | CommandEvent::Stderr(bytes) => {
                                String::from_utf8_lossy(&bytes).trim_end().to_string()
                            }
                            CommandEvent::Error(error) => format!("error: {error}"),
                            CommandEvent::Terminated(payload) => {
                                *stopped.lock().unwrap() =
                                    Some(format!("The server stopped (exit code {:?}).", payload.code));
                                continue;
                            }
                            _ => continue,
                        };
                        if let Some(file) = log.as_mut() {
                            let _ = writeln!(file, "{line}");
                        }
                        output.lock().unwrap().push(line);
                    }
                });
            }

            std::thread::spawn(move || {
                let deadline = Instant::now() + START_TIMEOUT;
                while Instant::now() < deadline {
                    if is_listening(port) {
                        let url = format!("http://127.0.0.1:{port}");
                        let _ = window.navigate(url.parse().expect("local url"));
                        return;
                    }
                    if let Some(reason) = stopped.lock().unwrap().clone() {
                        let lines = output.lock().unwrap().clone();
                        show(
                            &window,
                            &format!("Boardroom Sketch could not start. {reason}"),
                            &format!("{}\n\nLog: {}", tail(&lines), log_path.display()),
                        );
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(200));
                }
                let lines = output.lock().unwrap().clone();
                show(
                    &window,
                    "Boardroom Sketch is taking too long to start.",
                    &format!("{}\n\nLog: {}", tail(&lines), log_path.display()),
                );
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            // Absent when the window is served by the Vite dev server.
            if let Some(server) = handle.try_state::<Server>() {
                if let Some(child) = server.0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        }
    });
}
