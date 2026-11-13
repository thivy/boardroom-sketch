import { spawn } from "node:child_process";

const READY_TIMEOUT_MS = 60_000;

const script = `
Get-Process ms-teams -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$env:BOARDROOM_CDP_PORT"
Start-Process "ms-teams.exe"
`;

async function waitForDevTools(port: number): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2000) });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return false;
}

/**
 * Quits the new Teams client and starts it again with WebView2 remote debugging on `port`, then
 * waits until the DevTools endpoint answers. Windows only.
 */
export async function restartTeamsWithDebugging(port: number): Promise<void> {
  if (process.platform !== "win32")
    throw new Error("Restarting Teams is only supported on Windows.");

  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, BOARDROOM_CDP_PORT: String(port) },
    stdio: "ignore",
    windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Could not start ms-teams.exe")),
    );
  });

  if (!(await waitForDevTools(port))) {
    throw new Error(`Teams started, but DevTools did not come up on port ${port}.`);
  }
}
