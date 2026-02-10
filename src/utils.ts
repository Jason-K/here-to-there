import { spawnSync } from "node:child_process";

export async function runAppleScript(script: string) {
  if (process.platform !== "darwin") {
    throw new Error("macOS only");
  }

  const locale = process.env.LC_ALL;
  delete process.env.LC_ALL;
  const { stdout, stderr } = spawnSync("osascript", ["-e", script]);
  process.env.LC_ALL = locale;
  if (stderr?.length) throw new Error(stderr.toString());
  return stdout.toString();
}
