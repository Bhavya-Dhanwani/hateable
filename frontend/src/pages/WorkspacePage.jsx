import { motion } from 'motion/react';
import { ArrowLeft, Code2, Eye, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { filesApi } from '../api/files.js';
import { projectsApi } from '../api/projects.js';
import { LoadingScreen } from '../components/LoadingScreen.jsx';
import { LogoMark } from '../components/Logo.jsx';
import { ChatPanel } from '../components/workspace/ChatPanel.jsx';
import { CodeEditorPane } from '../components/workspace/CodeEditorPane.jsx';
import { FileExplorer } from '../components/workspace/FileExplorer.jsx';
import { PreviewPane } from '../components/workspace/PreviewPane.jsx';
import { DeployButton } from '../components/workspace/DeployButton.jsx';
import { withIngressPort } from '../utils/ingressUrl.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// One launch request per project, even when the effect runs twice (React StrictMode) or remounts.
const launches = new Map();
function launchOnce(projectId) {
  if (!launches.has(projectId)) {
    launches.set(
      projectId,
      projectsApi.launch(projectId).finally(() => launches.delete(projectId))
    );
  }
  return launches.get(projectId);
}

export function WorkspacePage() {
  const { projectId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  // Landing/new-project prompt is sent once; drop it from history so a reload doesn't resend it.
  const [initialPrompt] = useState(state?.initialPrompt);
  useEffect(() => {
    if (state?.initialPrompt) navigate('.', { replace: true, state: { project: state.project } });
  }, [state, navigate]);
  const [project, setProject] = useState(state?.project?._id === projectId ? state.project : null);
  const [startupError, setStartupError] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const [filePaths, setFilePaths] = useState([]);
  const [fileError, setFileError] = useState('');
  const [tabs, setTabs] = useState([]);
  const [activePath, setActivePath] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState('preview');
  const [previewKey, setPreviewKey] = useState(0);

  // Make sure the pod is up: relaunch stopped/failed projects (projectService reaps idle ones).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let current = await projectsApi.get(projectId);
        if (current.status !== 'running') {
          await launchOnce(projectId);
          // the launch may be another request's (202 "already starting"): wait for it to land
          for (let i = 0; i < 90 && current.status !== 'running'; i++) {
            current = await projectsApi.get(projectId);
            if (current.status === 'failed')
              throw new Error('The project runtime failed to start.');
            if (current.status !== 'running') await wait(2000);
          }
          if (current.status !== 'running')
            throw new Error('The project runtime took too long to start.');
        }
        if (active) setProject(current);
      } catch (e) {
        if (active) setStartupError(e.message);
      } finally {
        if (active) setIsStarting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId]);

  const refreshFiles = useCallback(async () => {
    setFileError('');
    try {
      setFilePaths(await filesApi.tree(projectId));
    } catch (e) {
      setFileError(e.message);
    }
  }, [projectId]);

  // The file server takes a few seconds after the pod starts — retry quietly.
  useEffect(() => {
    if (isStarting || startupError) return undefined;
    let active = true;
    (async () => {
      for (let attempt = 0; attempt < 15 && active; attempt++) {
        try {
          const paths = await filesApi.tree(projectId);
          if (active) {
            setFilePaths(paths);
            setFileError('');
          }
          return;
        } catch (e) {
          if (active) setFileError(e.message);
          await wait(2000);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [isStarting, startupError, projectId]);

  // After the agent writes files: refresh tree, reload open tabs, refresh preview.
  const onAgentEdit = useCallback(async () => {
    await refreshFiles();
    setPreviewKey((k) => k + 1);
    const openPaths = tabs.filter((t) => !t.isDirty).map((t) => t.path);
    if (!openPaths.length) return;
    try {
      const files = await filesApi.read(projectId, openPaths);
      setTabs((current) =>
        current.map((t) => (t.path in files && !t.isDirty ? { ...t, content: files[t.path] } : t))
      );
    } catch {
      /* tab keeps old content */
    }
  }, [projectId, refreshFiles, tabs]);

  async function openFile(path) {
    setActivePath(path);
    if (tabs.some((t) => t.path === path)) return;
    try {
      const files = await filesApi.read(projectId, [path]);
      setTabs((current) =>
        current.some((t) => t.path === path)
          ? current
          : [...current, { path, content: files[path] || '', isDirty: false }]
      );
    } catch (e) {
      setFileError(e.message);
    }
  }

  const changeFile = (path, content) =>
    setTabs((current) =>
      current.map((t) => (t.path === path ? { ...t, content, isDirty: true } : t))
    );

  async function saveFile(path) {
    const tab = tabs.find((t) => t.path === path);
    if (!tab?.isDirty) return;
    setIsSaving(true);
    try {
      await filesApi.update(projectId, { [path]: tab.content });
      setTabs((current) => current.map((t) => (t.path === path ? { ...t, isDirty: false } : t)));
      setPreviewKey((k) => k + 1);
    } catch (e) {
      setFileError(e.message);
    } finally {
      setIsSaving(false);
    }
  }

  function closeFile(path) {
    const tab = tabs.find((t) => t.path === path);
    if (tab?.isDirty && !window.confirm(`Close ${path} without saving?`)) return;
    const next = tabs.filter((t) => t.path !== path);
    setTabs(next);
    if (activePath === path) setActivePath(next.at(-1)?.path || null);
  }

  const isUnder = (path, source) => path === source || path.startsWith(`${source}/`);

  function relocateOpenPaths(source, destination) {
    const move = (p) => (isUnder(p, source) ? `${destination}${p.slice(source.length)}` : p);
    setTabs((current) => current.map((t) => ({ ...t, path: move(t.path) })));
    setActivePath((p) => p && move(p));
  }

  function removeOpenPaths(source) {
    setTabs((current) => current.filter((t) => !isUnder(t.path, source)));
    setActivePath((p) => (p && isUnder(p, source) ? null : p));
  }

  if (isStarting)
    return (
      <LoadingScreen
        label={`Waking up ${project?.projectName || 'your workspace'}`}
        detail="Provisioning the project runtime"
      />
    );

  if (startupError || !project) {
    return (
      <main className="grid min-h-svh place-items-center bg-ink px-5 text-center">
        <div>
          <LogoMark size={56} className="mx-auto mb-6 opacity-60 grayscale" />
          <p className="text-lg font-medium text-white">This workspace is having a moment.</p>
          <p className="mt-2 text-sm text-white/45">{startupError || 'Project not found.'}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Link
              to="/projects"
              className="flex h-9 items-center gap-2 rounded-full border border-line px-4 text-sm text-white/70 hover:bg-white/5"
            >
              <ArrowLeft className="size-3.5" /> Projects
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex h-9 items-center gap-2 rounded-full px-4 text-sm bg-white text-black hover:bg-white/90"
            >
              <RotateCcw className="size-3.5" /> Retry
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-svh overflow-hidden bg-ink text-white">
      <header className="flex h-12 items-center justify-between gap-3 border-b border-line bg-panel px-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/projects"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-white/45 hover:bg-white/5 hover:text-white"
            aria-label="Back to projects"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <LogoMark size={22} />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-medium">{project.projectName || 'Untitled'}</h1>
            <p className="flex items-center gap-1.5 text-[10px] text-emerald-400/90">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" /> live ·{' '}
              {project.projectType}
            </p>
          </div>
        </div>

        <div className="flex rounded-full border border-line bg-ink p-0.5" role="tablist">
          {[
            ['preview', Eye, 'Preview'],
            ['code', Code2, 'Code']
          ].map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className="relative flex h-7 items-center gap-1.5 rounded-full px-3 text-xs"
            >
              {mode === id && (
                <motion.span
                  layoutId="mode-pill"
                  className="absolute inset-0 rounded-full bg-white/10"
                  transition={{ type: 'spring', damping: 26, stiffness: 400 }}
                />
              )}
              <Icon className="relative size-3.5" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 items-center justify-end gap-2 sm:min-w-48">
          {fileError && (
            <button
              type="button"
              onClick={refreshFiles}
              title={fileError}
              className="flex max-w-48 items-center gap-1.5 truncate rounded-full bg-red-500/10 px-3 py-1 text-[11px] text-red-300"
            >
              <RotateCcw className="size-3 shrink-0" />{' '}
              <span className="truncate">Files unavailable</span>
            </button>
          )}
          <DeployButton projectId={projectId} />
        </div>
      </header>

      <div className="workspace-grid h-[calc(100svh-48px)]">
        <div className="min-h-0 min-w-0">
          {mode === 'code' ? (
            <div className="workspace-code-grid h-full">
              <FileExplorer
                runtimeId={projectId}
                filePaths={filePaths}
                activePath={activePath}
                onOpen={openFile}
                onRefresh={refreshFiles}
                onRelocate={relocateOpenPaths}
                onRemove={removeOpenPaths}
              />
              <CodeEditorPane
                tabs={tabs}
                activePath={activePath}
                onSelect={setActivePath}
                onClose={closeFile}
                onChange={changeFile}
                onSave={saveFile}
                isSaving={isSaving}
              />
            </div>
          ) : (
            <PreviewPane key={previewKey} previewUrl={withIngressPort(project.previewURL)} />
          )}
        </div>
        <ChatPanel
          projectId={projectId}
          initialPrompt={initialPrompt}
          onFilesChanged={onAgentEdit}
        />
      </div>
    </main>
  );
}
