use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// The Node process that serves the app; killed when the window closes.
struct Server(Mutex<Option<CommandChild>>);

fn free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .expect("no free local port")
}

fn wait_until_listening(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let deadline = Instant::now() + Duration::from_secs(30);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

/// In development the web server comes from the copy `prepare:sidecar` made; in a bundle it is a resource.
fn server_entry(app: &tauri::AppHandle) -> PathBuf {
    let bundled = app
        .path()
        .resource_dir()
        .map(|dir| dir.join("server").join("server").join("index.mjs"));
    match bundled {
        Ok(path) if path.exists() => path,
        _ => PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("server/server/index.mjs"),
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let port = free_port();
            let (_events, child) = app
                .shell()
                .sidecar("node")?
                .args([server_entry(app.handle())])
                .env("PORT", port.to_string())
                .env("HOST", "127.0.0.1")
                .spawn()?;
            app.manage(Server(Mutex::new(Some(child))));

            let window = app.get_webview_window("main").expect("main window");
            std::thread::spawn(move || {
                if wait_until_listening(port) {
                    let url = format!("http://127.0.0.1:{port}");
                    let _ = window.navigate(url.parse().expect("local url"));
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the app");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            if let Some(child) = handle.state::<Server>().0.lock().unwrap().take() {
                let _ = child.kill();
            }
        }
    });
}
