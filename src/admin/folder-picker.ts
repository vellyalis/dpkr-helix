import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface FolderPicker {
  isSupported(): Promise<boolean>;
  chooseDirectory(options?: { initialDirectory?: string }): Promise<string | undefined>;
}

export interface SpawnAdapter {
  (
    command: string,
    args: string[],
    options: { windowsHide: boolean; timeout?: number },
  ): ChildProcessWithoutNullStreams;
}

const PICKER_TIMEOUT_MS = 30_000;

export class WindowsFolderPicker implements FolderPicker {
  constructor(
    private readonly platform: NodeJS.Platform = process.platform,
    private readonly spawnAdapter: SpawnAdapter = spawn,
  ) {}

  async isSupported(): Promise<boolean> {
    return this.platform === "win32";
  }

  async chooseDirectory(): Promise<string | undefined> {
    if (!(await this.isSupported())) return undefined;
    const child = this.spawnAdapter(
      "powershell.exe",
      ["-NoProfile", "-STA", "-EncodedCommand", fixedPickerScript()],
      { windowsHide: true, timeout: PICKER_TIMEOUT_MS },
    );

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Folder picker timed out."));
      }, PICKER_TIMEOUT_MS);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > 4096) {
          child.kill();
          reject(new Error("Folder picker output exceeded the expected length."));
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(stderr.trim() || "Folder picker failed."));
          return;
        }
        const selected = stdout.trim();
        resolve(selected || undefined);
      });
    });
  }
}

export function createFolderPicker(platform: NodeJS.Platform = process.platform): FolderPicker {
  return new WindowsFolderPicker(platform);
}

export function fixedPickerScript(): string {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.ShowNewFolderButton = $false",
    "$result = $dialog.ShowDialog()",
    "if ($result -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.WriteLine($dialog.SelectedPath) }",
  ].join("\n");
  return Buffer.from(script, "utf16le").toString("base64");
}
