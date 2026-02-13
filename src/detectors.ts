import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { URL } from "node:url";
import { runAppleScript } from "./utils";

export type FileManager = "Finder" | "QSpace Pro" | "Bloom";
export const FILE_MANAGERS: FileManager[] = ["Finder", "QSpace Pro", "Bloom"];

export type Terminal = "Terminal" | "iTerm" | "Warp" | "WezTerm" | "Ghostty" | "kitty";
export const TERMINALS: Terminal[] = ["Terminal", "iTerm", "Warp", "WezTerm", "Ghostty", "kitty"];

export type DocumentApp =
  | "Visual Studio Code"
  | "Visual Studio Code - Insiders"
  | "Xcode"
  | "Xcode-beta"
  | "IntelliJ IDEA"
  | "PyCharm"
  | "WebStorm"
  | "PhpStorm"
  | "RubyMine"
  | "GoLand"
  | "CLion"
  | "DataGrip"
  | "Rider"
  | "AppCode"
  | "Sublime Text"
  | "BBEdit"
  | "TextEdit"
  | "CotEditor"
  | "Nova"
  | "Obsidian"
  | "Microsoft Word"
  | "Microsoft Excel"
  | "Microsoft PowerPoint"
  | "Preview"
  | "Skim"
  | "PDF Expert"
  | "Adobe Acrobat"
  | "Adobe Acrobat Reader DC";

export const DOCUMENT_APPS: DocumentApp[] = [
  "Visual Studio Code",
  "Visual Studio Code - Insiders",
  "Xcode",
  "Xcode-beta",
  "IntelliJ IDEA",
  "PyCharm",
  "WebStorm",
  "PhpStorm",
  "RubyMine",
  "GoLand",
  "CLion",
  "DataGrip",
  "Rider",
  "AppCode",
  "Sublime Text",
  "BBEdit",
  "TextEdit",
  "CotEditor",
  "Nova",
  "Obsidian",
  "Microsoft Word",
  "Microsoft Excel",
  "Microsoft PowerPoint",
  "Preview",
  "Skim",
  "PDF Expert",
  "Adobe Acrobat",
  "Adobe Acrobat Reader DC",
];

export type DocumentTarget = "Preview" | "Skim" | "PDF Expert" | "Adobe Acrobat" | "Adobe Acrobat Reader DC";
export const DOCUMENT_TARGETS: DocumentTarget[] = [
  "Preview",
  "Skim",
  "PDF Expert",
  "Adobe Acrobat",
  "Adobe Acrobat Reader DC",
];

export type AppTarget = Terminal | FileManager | DocumentTarget;

export const isFileManager = (val: string): val is FileManager => FILE_MANAGERS.includes(val as FileManager);
export const isTerminal = (val: string): val is Terminal => TERMINALS.includes(val as Terminal);
export const isDocumentApp = (val: string): val is DocumentApp => DOCUMENT_APPS.includes(val as DocumentApp);
export const isDocumentTarget = (val: string): val is DocumentTarget => DOCUMENT_TARGETS.includes(val as DocumentTarget);

function normalizeFileManagerResult(result: string) {
  const trimmed = result.trim();
  if (!trimmed || trimmed === "missing value") return "";
  if (trimmed.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(trimmed).pathname);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

function isProbablyUrlPath(value: string) {
  const lower = value.toLowerCase();
  return (
    lower.startsWith("http://") || lower.startsWith("https://") || lower.includes("http:") || lower.includes("https:")
  );
}

async function getOneDriveRoots() {
  const cloudStoragePath = join(homedir(), "Library", "CloudStorage");
  try {
    const entries = await readdir(cloudStoragePath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("OneDrive"))
      .map((entry) => join(cloudStoragePath, entry.name));
  } catch {
    return [];
  }
}

async function mapSharePointUrlToLocalPath(urlValue: string) {
  let parsed: URL;
  try {
    parsed = new URL(urlValue);
  } catch {
    return null;
  }

  if (!parsed.hostname.includes("sharepoint.com")) return null;

  const decodeSegment = (value: string) => {
    let decoded = value.replace(/\+/g, " ");
    for (let i = 0; i < 2; i += 1) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch {
        break;
      }
    }
    return decoded;
  };

  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeSegment(part));

  const docsIndex = segments.findIndex((segment) => segment.toLowerCase() === "documents");
  if (docsIndex === -1) return null;

  let relativeSegments = segments.slice(docsIndex + 1);
  if (relativeSegments[0]?.toLowerCase() === "documents") {
    relativeSegments = relativeSegments.slice(1);
  }

  const relativeVariants: string[][] = [relativeSegments];
  const lastSegment = relativeSegments[relativeSegments.length - 1];
  const dateMatch = lastSegment ? lastSegment.match(/\d{4}\.\d{2}\.\d{2}/) : null;
  if (lastSegment && dateMatch && dateMatch.index && dateMatch.index > 0) {
    const folderPart = lastSegment.slice(0, dateMatch.index).trim();
    const filePart = lastSegment.slice(dateMatch.index).trim();
    if (folderPart && filePart) {
      const splitVariant = [...relativeSegments.slice(0, -1), folderPart, filePart];
      relativeVariants.push(splitVariant);
    }
  }
  if (lastSegment && !dateMatch) {
    const digitMatch = lastSegment.match(/\d/);
    if (digitMatch?.index && digitMatch.index > 0) {
      const folderPart = lastSegment.slice(0, digitMatch.index).trim();
      const filePart = lastSegment.slice(digitMatch.index).trim();
      if (folderPart && filePart) {
        const splitVariant = [...relativeSegments.slice(0, -1), folderPart, filePart];
        relativeVariants.push(splitVariant);
      }
    }
  }

  const roots = await getOneDriveRoots();
  for (const root of roots) {
    for (const variant of relativeVariants) {
      const candidates = [join(root, "Documents", ...variant), join(root, ...variant)];
      for (const candidate of candidates) {
        try {
          const stats = await stat(candidate);
          if (stats.isFile()) return candidate;
        } catch {
          // Ignore missing candidates.
        }
      }
    }
  }

  return null;
}

function buildDocumentPathScript(app: DocumentApp) {
  switch (app) {
    case "Visual Studio Code":
    case "Visual Studio Code - Insiders": {
      const processName = app === "Visual Studio Code - Insiders" ? "Code - Insiders" : "Code";
      return `
        tell application "System Events"
          if not (exists process "${processName}") then error "${app} is not running"
          tell process "${processName}"
            if (count of windows) = 0 then error "No window open"
            try
              set docPath to value of attribute "AXDocument" of front window
              if docPath is missing value then error "No active document"
              return docPath
            on error
              error "Could not read active document"
            end try
          end tell
        end tell
      `;
    }
    case "Xcode":
    case "Xcode-beta":
      return `
        if application "${app}" is not running then
            error "${app} is not running"
        end if

        tell application "${app}"
          if (count of windows) = 0 then error "No window open"
          set activeDoc to active workspace document
          if activeDoc is missing value then error "No active document"
          set docPath to path of activeDoc
          return POSIX path of docPath
        end tell
      `;
    case "IntelliJ IDEA":
    case "PyCharm":
    case "WebStorm":
    case "PhpStorm":
    case "RubyMine":
    case "GoLand":
    case "CLion":
    case "DataGrip":
    case "Rider":
    case "AppCode":
      return `
        if application "${app}" is not running then
            error "${app} is not running"
        end if

        tell application "System Events"
          tell process "${app}"
            if (count of windows) = 0 then error "No window open"
            set winTitle to name of window 1
          end tell
        end tell

        set pathPart to winTitle
        if winTitle contains " - " then
          set AppleScript's text item delimiters to " - "
          set pathPart to text item 2 of (text items of winTitle)
        end if

        set AppleScript's text item delimiters to ""
        set pathPart to do shell script "echo " & quoted form of pathPart & " | xargs"

        if pathPart contains "[" then
          set AppleScript's text item delimiters to "["
          set pathPart to text item 1 of (text items of pathPart)
          set AppleScript's text item delimiters to ""
          set pathPart to do shell script "echo " & quoted form of pathPart & " | xargs"
        end if

        return pathPart
      `;
    case "Sublime Text":
      return `
        if application "Sublime Text" is not running then
            error "Sublime Text is not running"
        end if

        tell application "Sublime Text"
          if (count of windows) = 0 then error "No window open"
          tell window 1
            if (count of views) = 0 then error "No active document"
            set activeView to view 1
            set docPath to file of activeView
            if docPath is missing value then error "No active document"
            return docPath
          end tell
        end tell
      `;
    case "BBEdit":
      return `
        if application "BBEdit" is not running then
            error "BBEdit is not running"
        end if

        tell application "BBEdit"
          if (count of windows) = 0 then error "No window open"
          set activeDoc to document of window 1
          if activeDoc is missing value then error "No active document"
          if exists file of activeDoc then
            set docPath to file of activeDoc
            return POSIX path of docPath
          end if
          error "No active document"
        end tell
      `;
    case "TextEdit":
      return `
        if application "TextEdit" is not running then
            error "TextEdit is not running"
        end if

        tell application "TextEdit"
          if (count of windows) = 0 then error "No window open"
          set activeDoc to document of window 1
          if activeDoc is missing value then error "No active document"
          set docPath to path of activeDoc
          if docPath is missing value then error "No active document"
          return POSIX path of docPath
        end tell
      `;
    case "CotEditor":
      return `
        if application "CotEditor" is not running then
            error "CotEditor is not running"
        end if

        tell application "CotEditor"
          if (count of windows) = 0 then error "No window open"
          set activeDoc to front document
          if activeDoc is missing value then error "No active document"
          set docPath to path of activeDoc
          if docPath is missing value then error "No active document"
          return POSIX path of docPath
        end tell
      `;
    case "Nova":
      return `
        if application "Nova" is not running then
            error "Nova is not running"
        end if

        tell application "Nova"
          if (count of windows) = 0 then error "No window open"
          tell window 1
            set activeDoc to active document
            if activeDoc is missing value then error "No active document"
            set docPath to path of activeDoc
            return POSIX path of docPath
          end tell
        end tell
      `;
    case "Obsidian":
      return `
        if application "Obsidian" is not running then
            error "Obsidian is not running"
        end if

        tell application "System Events"
          tell process "Obsidian"
            if (count of windows) = 0 then error "No window open"
            set docPath to value of attribute "AXDocument" of window 1
            if docPath is missing value then error "No active document"
            return docPath
          end tell
        end tell
      `;
    case "Microsoft Word":
      return `
        if application "Microsoft Word" is not running then
            error "Microsoft Word is not running"
        end if

        tell application "Microsoft Word"
          if not (exists active document) then error "No active document"
          if (path of active document) is missing value then error "Document not saved"
          set docPath to (path of active document as text) & (name of active document)
          try
            set docAlias to file docPath
            return POSIX path of docAlias
          on error
            return docPath
          end try
        end tell
      `;
    case "Microsoft Excel":
      return `
        if application "Microsoft Excel" is not running then
            error "Microsoft Excel is not running"
        end if

        tell application "Microsoft Excel"
          if not (exists active workbook) then error "No active workbook"
          if (path of active workbook) is "" then error "Workbook not saved"
          set docPath to (path of active workbook) & (name of active workbook)
          try
            set docAlias to file docPath
            return POSIX path of docAlias
          on error
            return docPath
          end try
        end tell
      `;
    case "Microsoft PowerPoint":
      return `
        if application "Microsoft PowerPoint" is not running then
            error "Microsoft PowerPoint is not running"
        end if

        tell application "Microsoft PowerPoint"
          if not (exists active presentation) then error "No active presentation"
          if (path of active presentation) is "" then error "Presentation not saved"
          set docPath to (path of active presentation) & (name of active presentation)
          try
            set docAlias to file docPath
            return POSIX path of docAlias
          on error
            return docPath
          end try
        end tell
      `;
    case "Preview":
      return `
        if application "Preview" is not running then
            error "Preview is not running"
        end if

        tell application "Preview"
          if (count of documents) is 0 then error "No document open"
          set docPath to path of front document
          return POSIX path of docPath
        end tell
      `;
    case "Skim":
      return `
        if application "Skim" is not running then
            error "Skim is not running"
        end if

        tell application "Skim"
          if (count of windows) is 0 then error "No document open"
          set activeDoc to document of window 1
          if activeDoc is missing value then error "No document open"
          set docPath to file of activeDoc
          return POSIX path of docPath
        end tell
      `;
    case "PDF Expert":
      return `
        if application "PDF Expert" is not running then
            error "PDF Expert is not running"
        end if

        tell application "PDF Expert"
          if (count of windows) = 0 then error "No document open"
          tell window 1
            set activeDoc to active document
            if activeDoc is missing value then error "No document open"
            set docPath to path of activeDoc
            return POSIX path of docPath
          end tell
        end tell
      `;
    case "Adobe Acrobat":
    case "Adobe Acrobat Reader DC":
      return `
        if application "${app}" is not running then
            error "${app} is not running"
        end if

        tell application "${app}"
          if not (exists active doc) then error "No document open"
          set docPath to file alias of active doc
          return POSIX path of docPath
        end tell
      `;
  }
}

export async function getDocumentAppPath(app: DocumentApp) {
  const script = buildDocumentPathScript(app);
  const result = await runAppleScript(script);
  const normalized = normalizeFileManagerResult(result);
  if (!normalized) throw new Error(`${app} returned an empty path`);
  return normalized;
}

export async function resolveDocumentAppPathForOpen(app: DocumentApp) {
  const documentPath = await getDocumentAppPath(app);
  if (isProbablyUrlPath(documentPath)) {
    const mappedPath = await mapSharePointUrlToLocalPath(documentPath);
    return { documentPath, resolvedPath: mappedPath ?? "" };
  }
  return { documentPath, resolvedPath: documentPath };
}

export async function resolveOpenPath(pathValue: string) {
  if (!pathValue) return "";
  try {
    const stats = await stat(pathValue);
    if (stats.isFile()) return dirname(pathValue);
  } catch {
    // Ignore missing/invalid paths; open() will handle error reporting.
  }
  return pathValue;
}

function buildFileManagerPathScript(fileManager: FileManager) {
  switch (fileManager) {
    case "Finder":
      return `
        if application "Finder" is not running then
            error "Finder is not running"
        end if

        tell application "Finder"
          if (count of Finder windows) = 0 then error "No Finder window open"
          try
            set pathList to POSIX path of (folder of the front window as alias)
            return pathList
          on error
            error "Could not access Finder window path"
          end try
        end tell
      `;
    case "QSpace Pro":
      return `
        if application "QSpace Pro" is not running then
            error "QSpace Pro is not running"
        end if

        tell application "QSpace Pro"
          if (count of windows) = 0 then error "No QSpace Pro window open"

          try
            set sel to selected items of front window
            if (count of sel) > 0 then
              set fileItem to item 1 of sel
              try
                return urlstr of fileItem
              on error
                return POSIX path of fileItem
              end try
            end if
          end try

          try
            set sel to selection of front window
            if (count of sel) > 0 then
              set fileItem to item 1 of sel
              try
                return urlstr of fileItem
              on error
                return POSIX path of fileItem
              end try
            end if
          end try

          try
            set paneRoot to root item of activated pane of front window
            return urlstr of paneRoot
          end try

          try
            set winRoot to root item of front window
            return urlstr of winRoot
          end try

          return missing value
        end tell
      `;
    case "Bloom":
      return `
        if application "Bloom" is not running then
            error "Bloom is not running"
        end if

        tell application "Bloom"
          try
            set winSel to selection of front window
            if (count of winSel) > 0 then
              set item1 to item 1 of winSel
              try
                return POSIX path of item1
              on error
                return POSIX path of (item1 as alias)
              end try
            end if
          on error
            return rootURL of front window
          end try
        end tell
      `;
  }
}

export async function getFileManagerPath(fileManager: FileManager) {
  const script = buildFileManagerPathScript(fileManager);
  const result = await runAppleScript(script);
  const normalized = normalizeFileManagerResult(result);
  if (!normalized) throw new Error(`${fileManager} returned an empty path`);
  return normalized;
}
