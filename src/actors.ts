import { Clipboard, getApplications, open, showToast, Toast } from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import {
  AppTarget,
  DocumentApp,
  FileManager,
  getFileManagerPath,
  resolveDocumentAppPathForOpen,
  resolveOpenPath,
  Terminal,
} from "./detectors";
import { runAppleScript } from "./utils";

function resolveApplicationName(applications: { name: string }[], name: AppTarget) {
  if (name === "iTerm") {
    return applications.find((app) => app.name === "iTerm2" || app.name === "iTerm")?.name ?? null;
  }

  return applications.find((app) => app.name === name)?.name ?? null;
}

async function checkApplication(name: AppTarget) {
  const applications = await getApplications();
  const appName = resolveApplicationName(applications, name);
  if (!appName) throw new Error(`${name} not found`);
  return appName;
}

export async function clipboardToApplication(name: AppTarget) {
  try {
    const directory = (await Clipboard.readText()) || "";
    const appName = await checkApplication(name);
    await open(directory, appName);
    await showToast(Toast.Style.Success, "Done");
  } catch (err) {
    await showFailureToast(err);
  }
}

export async function applicationToFileManager(name: Terminal, fileManager: FileManager) {
  const script = `
    if application "${name}" is not running then
      error "${name} is not running"
    end if

    tell application "${fileManager}" to activate
    tell application "${name}" to activate
    tell application "System Events"
      keystroke "open -a '${fileManager}' ./"
      key code 76
    end tell
  `;
  try {
    const result = await runAppleScript(script);
    await showToast(Toast.Style.Success, "Done", result);
  } catch (err) {
    await showFailureToast(err);
  }
}

export async function fileManagerToApplication(fileManager: FileManager, name: AppTarget) {
  try {
    const directory = await resolveOpenPath(await getFileManagerPath(fileManager));
    const appName = await checkApplication(name);
    await open(directory.trim(), appName);
    await showToast(Toast.Style.Success, "Done");
  } catch (err) {
    await showFailureToast(err);
  }
}

export async function documentAppToApplication(app: DocumentApp, name: AppTarget) {
  try {
    const { resolvedPath } = await resolveDocumentAppPathForOpen(app);

    if (!resolvedPath) {
      throw new Error(
        "Document is cloud-only or cannot be mapped. Save locally or sync in OneDrive to open in Finder or a terminal.",
      );
    }

    const directory = await resolveOpenPath(resolvedPath);
    const appName = await checkApplication(name);
    await open(directory.trim(), appName);
    await showToast(Toast.Style.Success, "Done");
  } catch (err) {
    await showFailureToast(err);
  }
}

export async function applicationToFinder(name: Terminal) {
  await applicationToFileManager(name, "Finder");
}

export async function finderToApplication(name: Terminal) {
  await fileManagerToApplication("Finder", name);
}
