import { spawn } from "node:child_process";

export interface BrowserOpenResult {
  url: string;
  sanitizedUrl: string;
}

export function dashboardUrl(host: string, port: number, token?: string): BrowserOpenResult {
  const url = token
    ? `http://${host}:${port}/#token=${encodeURIComponent(token)}`
    : `http://${host}:${port}/`;
  return {
    url,
    sanitizedUrl: token ? `http://${host}:${port}/#token=<redacted>` : url,
  };
}

export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): void {
  const command = platform === "win32" ? "cmd" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}
