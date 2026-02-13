import {
  Action,
  ActionPanel,
  Clipboard,
  List,
  LocalStorage,
  Toast,
  getFrontmostApplication,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import { showFailureToast } from "@raycast/utils";
import { useEffect, useMemo, useState } from "react";
import {
  applicationToFileManager,
  clipboardToApplication,
  documentAppToApplication,
  documentAppToDocumentApp,
  fileManagerToApplication,
} from "./actors";
import {
  AppTarget,
  DOCUMENT_TARGETS,
  DocumentTarget,
  DOCUMENT_APPS,
  DocumentApp,
  FileManager,
  FILE_MANAGERS,
  isDocumentApp,
  isDocumentTarget,
  isFileManager,
  resolveDocumentAppPathForOpen,
  resolveOpenPath,
  Terminal,
  TERMINALS,
  getFileManagerPath,
} from "./detectors";

type Source = "Clipboard" | FileManager | Terminal | DocumentApp;

type Preferences = {
  showFinder: boolean;
  showQSpacePro: boolean;
  showBloom: boolean;
  showTerminal: boolean;
  showITerm: boolean;
  showKitty: boolean;
  showWarp: boolean;
  showWezTerm: boolean;
  showGhostty: boolean;
  showPreview: boolean;
  showSkim: boolean;
  showPDFExpert: boolean;
  showAcrobat: boolean;
  showAcrobatReader: boolean;
};

const DESTINATION_STORAGE_KEY = "enabledTargets";
const SOURCE_STORAGE_KEY = "hiddenSources";

const fileManagers: FileManager[] = FILE_MANAGERS;
const terminals: Terminal[] = TERMINALS;
const documentTargets: DocumentTarget[] = DOCUMENT_TARGETS;
const sources: Source[] = ["Clipboard", ...fileManagers, ...terminals, ...DOCUMENT_APPS];

function normalizeFrontmostName(name: string, bundleId?: string): Source | null {
  if (bundleId === "com.adobe.Acrobat.Pro") return "Adobe Acrobat";
  if (bundleId === "net.sourceforge.skim-app.skim") return "Skim";
  if (name === "iTerm2") return "iTerm";
  if (name === "Code") return "Visual Studio Code";
  if (name === "Code - Insiders") return "Visual Studio Code - Insiders";
  if (name === "Adobe Acrobat Pro") return "Adobe Acrobat";
  if (sources.includes(name as Source)) return name as Source;
  return null;
}

function displayName(value: Source | AppTarget) {
  if (value === "iTerm") return "iTerm2";
  if (value === "Visual Studio Code") return "VS Code";
  if (value === "Visual Studio Code - Insiders") return "VS Code - Insiders";
  if (value === "Adobe Acrobat Reader DC") return "Adobe Acrobat Reader";
  return value;
}

function buildDefaultEnabledTargets(preferences: Preferences) {
  const enabled: AppTarget[] = [];

  if (preferences.showFinder) enabled.push("Finder");
  if (preferences.showQSpacePro) enabled.push("QSpace Pro");
  if (preferences.showBloom) enabled.push("Bloom");
  if (preferences.showTerminal) enabled.push("Terminal");
  if (preferences.showITerm) enabled.push("iTerm");
  if (preferences.showKitty) enabled.push("kitty");
  if (preferences.showWarp) enabled.push("Warp");
  if (preferences.showWezTerm) enabled.push("WezTerm");
  if (preferences.showGhostty) enabled.push("Ghostty");

  if (preferences.showPreview) enabled.push("Preview");
  if (preferences.showSkim) enabled.push("Skim");
  if (preferences.showPDFExpert) enabled.push("PDF Expert");
  if (preferences.showAcrobat) enabled.push("Adobe Acrobat");
  if (preferences.showAcrobatReader) enabled.push("Adobe Acrobat Reader DC");

  return new Set(enabled);
}

function isTargetEnabled(target: AppTarget, preferences: Preferences) {
  switch (target) {
    case "Finder":
      return preferences.showFinder;
    case "QSpace Pro":
      return preferences.showQSpacePro;
    case "Bloom":
      return preferences.showBloom;
    case "Terminal":
      return preferences.showTerminal;
    case "iTerm":
      return preferences.showITerm;
    case "kitty":
      return preferences.showKitty;
    case "Warp":
      return preferences.showWarp;
    case "WezTerm":
      return preferences.showWezTerm;
    case "Ghostty":
      return preferences.showGhostty;
    case "Preview":
      return preferences.showPreview;
    case "Skim":
      return preferences.showSkim;
    case "PDF Expert":
      return preferences.showPDFExpert;
    case "Adobe Acrobat":
      return preferences.showAcrobat;
    case "Adobe Acrobat Reader DC":
      return preferences.showAcrobatReader;
    default:
      return true;
  }
}

function TargetList({ source, onChangeSource }: { source: Source; onChangeSource: () => void }) {
  const preferences = useMemo(() => getPreferenceValues<Preferences>(), []);
  const [debugPath, setDebugPath] = useState<string | null>(null);
  const [debugResolvedPath, setDebugResolvedPath] = useState<string | null>(null);
  const [enabledTargets, setEnabledTargets] = useState<Set<AppTarget> | null>(null);

  useEffect(() => {
    let isMounted = true;
    setDebugPath(null);
    setDebugResolvedPath(null);

    void (async () => {
      try {
        if (source === "Clipboard") {
          const text = (await Clipboard.readText()) ?? "";
          if (isMounted) setDebugPath(text || "(empty clipboard)");
          return;
        }

        if (isDocumentApp(source)) {
          const { documentPath, resolvedPath } = await resolveDocumentAppPathForOpen(source);
          if (isMounted) {
            setDebugPath(documentPath || "(empty document path)");
            setDebugResolvedPath(resolvedPath || "(no local match)");
          }
          return;
        }

        if (isFileManager(source)) {
          const path = await resolveOpenPath(await getFileManagerPath(source));
          if (isMounted) setDebugPath(path || "(empty file manager path)");
          return;
        }

        if (isMounted) setDebugPath("(terminal path unavailable)");
      } catch (err) {
        if (isMounted) {
          setDebugPath(`Error: ${String(err)}`);
          setDebugResolvedPath(null);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [source]);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const stored = await LocalStorage.getItem<string>(DESTINATION_STORAGE_KEY);
      if (!isMounted) return;

      if (stored) {
        try {
          const parsed = JSON.parse(stored) as AppTarget[];
          const next = new Set(parsed);
          const hasDocumentTargets = documentTargets.some((target) => next.has(target));
          if (!hasDocumentTargets) {
            const defaults = buildDefaultEnabledTargets(preferences);
            documentTargets.forEach((target) => {
              if (defaults.has(target)) next.add(target);
            });
          }
          setEnabledTargets(next);
          return;
        } catch {
          // Fall through to defaults.
        }
      }

      setEnabledTargets(buildDefaultEnabledTargets(preferences));
    })();

    return () => {
      isMounted = false;
    };
  }, [preferences]);

  const updateEnabledTargets = async (targets: Set<AppTarget> | null) => {
    if (!targets) return;
    setEnabledTargets(new Set(targets));
    await LocalStorage.setItem(DESTINATION_STORAGE_KEY, JSON.stringify(Array.from(targets)));
  };

  const resetEnabledTargets = async () => {
    await LocalStorage.removeItem(DESTINATION_STORAGE_KEY);
    setEnabledTargets(buildDefaultEnabledTargets(preferences));
  };

  const targets = useMemo(() => {
    let targetList: AppTarget[] = [];

    if (source === "Clipboard" || isDocumentApp(source)) {
      targetList = [...fileManagers, ...terminals, ...documentTargets] as AppTarget[];
    } else if (isFileManager(source)) {
      targetList = [...fileManagers.filter((manager) => manager !== source), ...terminals] as AppTarget[];
    } else {
      targetList = fileManagers as AppTarget[];
    }

    if (isDocumentApp(source)) {
      targetList = targetList.filter((target) => target !== source);
    }

    const allowed = targetList.filter((target) => isTargetEnabled(target, preferences));
    if (!enabledTargets) return allowed;
    return allowed.filter((target) => enabledTargets.has(target));
  }, [enabledTargets, preferences, source]);

  return (
    <List searchBarPlaceholder="Choose target app">
      {debugPath !== null ? (
        <List.Item
          title="Source Path"
          subtitle={debugPath}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Debug Path" content={debugPath} />
              <Action
                title="Enable All Destinations"
                onAction={async () => {
                  const allTargets = new Set<AppTarget>([...fileManagers, ...terminals, ...documentTargets]);
                  await updateEnabledTargets(allTargets);
                }}
              />
              <Action
                title="Disable All Destinations"
                onAction={async () => {
                  await updateEnabledTargets(new Set());
                }}
              />
              <Action title="Reset Destination Filters" onAction={resetEnabledTargets} />
            </ActionPanel>
          }
        />
      ) : null}
      {debugResolvedPath !== null ? (
        <List.Item
          title="Mapped Local Path"
          subtitle={debugResolvedPath}
          actions={
            <ActionPanel>
              <Action.CopyToClipboard title="Copy Mapped Path" content={debugResolvedPath} />
            </ActionPanel>
          }
        />
      ) : null}
      {targets.length === 0 ? (
        <List.EmptyView title="No destinations enabled" description="Enable targets in the command preferences." />
      ) : null}
      {targets.map((target) => (
        <List.Item
          key={target}
          title={displayName(target)}
          subtitle={`${displayName(source)} → ${displayName(target)}`}
          actions={
            <ActionPanel>
              <Action
                title={`Open in ${displayName(target)}`}
                onAction={async () => {
                  try {
                    if (source === "Clipboard") {
                      await clipboardToApplication(target as AppTarget);
                      return;
                    }

                    if (isDocumentApp(source)) {
                      if (isDocumentTarget(target)) {
                        await documentAppToDocumentApp(source, target as DocumentTarget);
                        return;
                      }

                      await documentAppToApplication(source, target as AppTarget);
                      return;
                    }

                    if (isFileManager(source)) {
                      await fileManagerToApplication(source, target as AppTarget);
                      return;
                    }

                    if (isFileManager(target as AppTarget)) {
                      await applicationToFileManager(source as Terminal, target as FileManager);
                      return;
                    }

                    await showToast(Toast.Style.Failure, "Unsupported combination");
                  } catch (err) {
                    await showFailureToast(err);
                  }
                }}
              />
              <Action
                title="Enable All Destinations"
                onAction={async () => {
                  const allTargets = new Set<AppTarget>([...fileManagers, ...terminals, ...documentTargets]);
                  await updateEnabledTargets(allTargets);
                }}
              />
              <Action
                title="Disable All Destinations"
                onAction={async () => {
                  await updateEnabledTargets(new Set());
                }}
              />
              <Action title="Reset Destination Filters" onAction={resetEnabledTargets} />
              <Action title="Change Source" onAction={onChangeSource} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function SourceList({ activeSource, onSelect }: { activeSource: Source | null; onSelect: (value: Source) => void }) {
  const [hiddenSources, setHiddenSources] = useState<Set<Source>>(new Set());

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const stored = await LocalStorage.getItem<string>(SOURCE_STORAGE_KEY);
      if (!isMounted) return;

      if (stored) {
        try {
          const parsed = JSON.parse(stored) as Source[];
          setHiddenSources(new Set(parsed));
          return;
        } catch {
          // Ignore invalid storage.
        }
      }
      setHiddenSources(new Set());
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateHiddenSources = async (next: Set<Source>) => {
    setHiddenSources(new Set(next));
    await LocalStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(Array.from(next)));
  };

  const showAllSources = async () => {
    await LocalStorage.removeItem(SOURCE_STORAGE_KEY);
    setHiddenSources(new Set());
  };

  const visibleSources = sources.filter((value) => !hiddenSources.has(value));

  return (
    <List searchBarPlaceholder="Choose source app">
      {activeSource ? (
        <List.Item
          title={`Active App (${displayName(activeSource)})`}
          subtitle="Use the frontmost app"
          actions={
            <ActionPanel>
              <Action title="Use Active App" onAction={() => onSelect(activeSource)} />
              {hiddenSources.has(activeSource) ? (
                <Action
                  title="Unhide Source"
                  onAction={async () => {
                    const next = new Set(hiddenSources);
                    next.delete(activeSource);
                    await updateHiddenSources(next);
                  }}
                />
              ) : null}
              <Action title="Show All Sources" onAction={showAllSources} />
            </ActionPanel>
          }
        />
      ) : null}
      {visibleSources.map((value) => (
        <List.Item
          key={value}
          title={displayName(value)}
          actions={
            <ActionPanel>
              <Action title={`Use ${displayName(value)}`} onAction={() => onSelect(value)} />
              <Action
                title="Hide Source"
                onAction={async () => {
                  const next = new Set(hiddenSources);
                  next.add(value);
                  await updateHiddenSources(next);
                }}
              />
              <Action title="Show All Sources" onAction={showAllSources} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

export default function Command() {
  const [source, setSource] = useState<Source | null>(null);
  const [activeSource, setActiveSource] = useState<Source | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const app = await getFrontmostApplication();
        const normalized = normalizeFrontmostName(app.name, app.bundleId);
        if (isMounted) {
          setActiveSource(normalized);
          setSource(normalized);
        }
      } catch (err) {
        await showFailureToast(err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return <List isLoading={isLoading} />;
  }

  if (!source) {
    return <SourceList activeSource={activeSource} onSelect={setSource} />;
  }

  return <TargetList source={source} onChangeSource={() => setSource(null)} />;
}
