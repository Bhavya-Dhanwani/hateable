import { useEffect, useEffectEvent, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Download, ExternalLink, File, FileCode2, Image as ImageIcon, Save, X } from 'lucide-react';
import { filesApi } from '../../api/files.js';
import { languageForPath } from '../../utils/fileTree.js';

// Monaco's built-in TS checker defaults to no JSX and can't see the project's node_modules
// (they live in the pod), so every .tsx showed bogus "--jsx flag" / "cannot find module" errors.
// Enable JSX + modern settings and keep only syntax errors; Vite in the pod does the real checking.
function configureTypeScript(monaco) {
  const ts = monaco.typescript ?? monaco.languages.typescript; // API moved in newer Monaco
  const options = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    isolatedModules: true
  };
  const diagnostics = { noSemanticValidation: true, noSyntaxValidation: false };
  for (const defaults of [ts.typescriptDefaults, ts.javascriptDefaults]) {
    defaults.setCompilerOptions(options);
    defaults.setDiagnosticsOptions(diagnostics);
  }
}

// An image file: shown as the image, on a checkerboard so transparency is visible.
function ImagePreview({ src, name }) {
  const [size, setSize] = useState(null);
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div className="ide-scroll grid min-h-0 flex-1 place-items-center overflow-auto p-6">
        {failed ? (
          <p className="text-xs text-zinc-500">This image could not be displayed.</p>
        ) : (
          <img
            src={src}
            alt={name}
            onLoad={(e) =>
              setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
            }
            onError={() => setFailed(true)}
            className="max-h-full max-w-full rounded border border-white/8 object-contain [image-rendering:auto]"
            style={{
              backgroundImage: 'repeating-conic-gradient(#1f1f23 0% 25%, #141416 0% 50%)',
              backgroundSize: '16px 16px'
            }}
          />
        )}
      </div>
      <div className="flex h-8 shrink-0 items-center justify-between border-t border-white/8 px-3 font-mono text-[11px] text-zinc-500">
        <span>{size ? `${size.w} × ${size.h}px` : name}</span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 hover:text-white"
        >
          Open <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

// Fonts, PDFs, media, archives: not editable here, but downloadable.
function BinaryNotice({ src, name }) {
  return (
    <div className="grid h-full place-items-center px-8 text-center">
      <div>
        <File className="mx-auto mb-4 size-8 text-zinc-700" />
        <p className="text-sm font-bold text-zinc-400">{name} is a binary file</p>
        <p className="mt-1 text-xs text-zinc-600">It can't be edited as text.</p>
        <a
          href={src}
          download={name}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15"
        >
          <Download className="size-3.5" /> Download
        </a>
      </div>
    </div>
  );
}

export function CodeEditorPane({
  projectId,
  tabs,
  activePath,
  onSelect,
  onClose,
  onChange,
  onSave,
  isSaving,
  readOnly = false
}) {
  const activeTab = tabs.find((tab) => tab.path === activePath);
  const saveActive = useEffectEvent(() => {
    if (activeTab && !readOnly) onSave(activeTab.path);
  });

  useEffect(() => {
    function handleKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveActive();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <section className="flex min-h-0 min-w-0 flex-col bg-ink">
      <div className="flex h-11 shrink-0 border-b border-white/8 bg-panel">
        <div className="ide-scroll flex min-w-0 flex-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.path}
              className={`group flex h-11 min-w-36 max-w-52 shrink-0 items-center gap-2 border-r border-white/8 px-3 text-xs font-semibold ${tab.path === activePath ? 'border-t-2 border-t-white/70 bg-ink text-zinc-200' : 'border-t-2 border-t-transparent text-zinc-500 hover:bg-white/3 hover:text-zinc-300'}`}
              type="button"
              onClick={() => onSelect(tab.path)}
              title={tab.path}
            >
              {tab.kind === 'image' ? (
                <ImageIcon className="size-3.5 shrink-0 text-emerald-400" />
              ) : tab.kind === 'binary' ? (
                <File className="size-3.5 shrink-0 text-zinc-500" />
              ) : (
                <FileCode2 className="size-3.5 shrink-0 text-sky-400" />
              )}
              <span className="min-w-0 flex-1 truncate">{tab.path.split('/').pop()}</span>
              {tab.isDirty && (
                <span
                  className="size-1.5 shrink-0 rounded-full bg-amber-400"
                  title="Unsaved changes"
                />
              )}
              <span
                className="grid size-5 shrink-0 place-items-center rounded opacity-0 hover:bg-white/10 group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.path);
                }}
                role="button"
                aria-label={`Close ${tab.path}`}
                title="Close"
              >
                <X className="size-3" />
              </span>
            </button>
          ))}
        </div>
        {activeTab && !readOnly && (activeTab.kind ?? 'text') === 'text' && (
          <button
            className="flex w-11 shrink-0 items-center justify-center border-l border-white/8 text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-40"
            type="button"
            onClick={() => onSave(activeTab.path)}
            disabled={isSaving || !activeTab.isDirty}
            aria-label="Save file"
            title="Save file"
          >
            <Save className="size-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {activeTab?.kind === 'image' ? (
          <ImagePreview
            // the version bumps after an AI edit, so a regenerated image is fetched again
            key={`${activeTab.path}#${activeTab.version}`}
            src={`${filesApi.rawUrl(projectId, activeTab.path)}&v=${activeTab.version}`}
            name={activeTab.path.split('/').pop()}
          />
        ) : activeTab?.kind === 'binary' ? (
          <BinaryNotice
            src={filesApi.rawUrl(projectId, activeTab.path)}
            name={activeTab.path.split('/').pop()}
          />
        ) : activeTab ? (
          <Editor
            path={activeTab.path}
            language={languageForPath(activeTab.path)}
            value={activeTab.content}
            theme="hateable"
            beforeMount={(monaco) => {
              configureTypeScript(monaco);
              monaco.editor.defineTheme('hateable', {
                base: 'vs-dark',
                inherit: true,
                rules: [{ token: 'comment', foreground: '5c5c66', fontStyle: 'italic' }],
                colors: {
                  'editor.background': '#09090b',
                  'editor.lineHighlightBackground': '#ffffff08',
                  'editorLineNumber.foreground': '#3f3f46',
                  'editorLineNumber.activeForeground': '#e4e4e7',
                  'editorCursor.foreground': '#ff4d6d',
                  'editor.selectionBackground': '#ffffff1f',
                  // same scrollbar as the rest of the app (styles.css)
                  'scrollbarSlider.background': '#ffffff1f',
                  'scrollbarSlider.hoverBackground': '#ffffff3d',
                  'scrollbarSlider.activeBackground': '#ff4d6d99',
                  'scrollbar.shadow': '#00000000'
                }
              });
            }}
            onChange={(value) => onChange(activeTab.path, value || '')}
            options={{
              readOnly,
              automaticLayout: true,
              fontFamily: 'JetBrains Mono Variable',
              fontLigatures: true,
              fontSize: 13,
              lineHeight: 21,
              minimap: { enabled: false },
              padding: { top: 14 },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              tabSize: 2,
              wordWrap: 'on',
              scrollbar: {
                useShadows: false,
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10,
                verticalSliderSize: 6,
                horizontalSliderSize: 6
              },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true
            }}
            loading={
              <div className="grid h-full place-items-center text-xs font-semibold text-zinc-600">
                Loading editor...
              </div>
            }
          />
        ) : (
          <div className="grid h-full place-items-center px-8 text-center">
            <div>
              <FileCode2 className="mx-auto mb-4 size-8 text-zinc-700" />
              <p className="text-sm font-bold text-zinc-500">Select a file to start editing</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
