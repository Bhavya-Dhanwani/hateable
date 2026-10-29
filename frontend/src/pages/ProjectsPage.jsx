import { motion } from 'motion/react';
import { ArrowUpRight, KeyRound, LogOut, Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { projectsApi } from '../api/projects.js';
import { authApi } from '../api/auth.js';
import { selectedWorkspace, workspacesApi } from '../api/workspaces.js';
import { RoleBadge } from '../components/RoleBadge.jsx';
import { useAuth } from '../auth/auth-context.js';
import HeroGlow from '../components/bits/HeroGlow.jsx';
import { useHeartbreak } from '../components/heartbreak-context.js';
import SpotlightCard from '../components/bits/SpotlightCard.jsx';
import { Logo, LogoMark } from '../components/Logo.jsx';
import { CreateProjectDialog } from '../components/CreateProjectDialog.jsx';
import { ApiKeysDialog } from '../components/ApiKeysDialog.jsx';
import { PaymentDialog } from '../components/PaymentDialog.jsx';
import { usePublicConfig } from '../api/payments.js';
import { projectNameFrom, takePendingPrompt } from '../utils/pendingPrompt.js';

const STATUS = {
  starting: 'bg-amber-400',
  updating: 'bg-amber-400',
  running: 'bg-emerald-400',
  failed: 'bg-red-400',
  stopped: 'bg-white/30'
};

const timeAgo = (value) => {
  const minutes = Math.round((Date.now() - new Date(value)) / 60000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  if (minutes < 1440) return rtf.format(-Math.round(minutes / 60), 'hour');
  return rtf.format(-Math.round(minutes / 1440), 'day');
};

export function ProjectsPage() {
  const { user, setUser, logout } = useAuth();
  const { go } = useHeartbreak();
  const navigate = useNavigate();
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [pending] = useState(takePendingPrompt);
  const [isCreateOpen, setIsCreateOpen] = useState(Boolean(pending));
  const [busy, setBusy] = useState(false);
  const [isKeysOpen, setIsKeysOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const config = usePublicConfig();
  const canUpgrade = config?.upiEnabled && (user.plan ?? 'free') !== 'team';

  // Team workspaces: the one shown ('' = personal), the caller's workspaces and pending invites
  const [workspaceId, setWorkspaceId] = useState(selectedWorkspace.get);
  const [teams, setTeams] = useState({ workspaces: [], invites: [] });
  const [newTeamName, setNewTeamName] = useState(null);
  const workspace = teams.workspaces.find((w) => w.id === workspaceId);
  // a workspace the caller left or lost access to falls back to personal projects
  const shownId = workspace ? workspaceId : '';

  const loadTeams = () =>
    workspacesApi
      .list()
      .then(setTeams)
      .catch(() => {});
  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    projectsApi
      .list(shownId)
      .then(setProjects)
      .catch((e) => {
        setError(e.message);
        setProjects([]);
      });
  }, [shownId]);

  function pick(id) {
    if (id !== shownId) setProjects(null);
    selectedWorkspace.set(id);
    setWorkspaceId(id);
    setError('');
  }

  // membership reaches the access token on refresh: refresh before showing the workspace
  async function joinAndShow(id) {
    const session = await authApi.refresh();
    setUser(session.user);
    await loadTeams();
    pick(id);
  }

  async function createTeam(event) {
    event.preventDefault();
    try {
      const { workspace: created } = await workspacesApi.create(newTeamName.trim());
      setNewTeamName(null);
      await joinAndShow(created._id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function accept(id) {
    try {
      await workspacesApi.accept(id);
      await joinAndShow(id);
    } catch (e) {
      setError(e.message);
    }
  }

  const [createError, setCreateError] = useState('');

  // A landing-page prompt (if any) is sent to the AI once the workspace opens.
  async function create({ name, projectType }) {
    setBusy(true);
    setCreateError('');
    try {
      const project = await projectsApi.create(name, projectType, shownId);
      navigate(`/projects/${project._id}`, { state: { project, initialPrompt: pending?.prompt } });
    } catch (e) {
      setCreateError(e.message);
      setBusy(false);
    }
  }

  const firstName = user.name?.split(' ')[0] || 'there';

  return (
    <main className="grain relative isolate min-h-svh overflow-hidden bg-ink">
      <HeroGlow className="absolute -top-[22rem] left-1/2 -z-10 h-[38rem] w-[min(150vw,70rem)] -translate-x-1/2 opacity-60" />
      <header className="relative z-10 border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/">
              <Logo size={24} />
            </Link>
            {(teams.workspaces.length > 0 || user.plan === 'team') && (
              <select
                value={shownId}
                onChange={(e) =>
                  e.target.value === '+' ? setNewTeamName('') : pick(e.target.value)
                }
                aria-label="Workspace"
                className="h-9 max-w-44 truncate rounded-full border border-line bg-panel px-3 text-sm text-white outline-none focus:border-white/30"
              >
                <option value="">Personal</option>
                {teams.workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
                {user.plan === 'team' && <option value="+">+ New workspace</option>}
              </select>
            )}
            {workspace && (
              <Link
                to={`/workspaces/${workspace.id}`}
                className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3 text-xs text-white/60 transition hover:bg-white/5 hover:text-white"
              >
                <Users className="size-3.5" /> Members
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-right text-xs sm:block">
              <span className="block text-white/80">{user.name}</span>
              <span className="block text-white/35">{user.email}</span>
              {user.phoneVerified && <span className="block text-white/35">{user.phone}</span>}
            </span>
            <span className="grid size-9 place-items-center rounded-full bg-white/10 text-sm font-medium text-white">
              {user.name?.[0]?.toUpperCase()}
            </span>
            {canUpgrade && (
              <button
                type="button"
                onClick={() => setIsPayOpen(true)}
                className="hidden h-9 items-center rounded-full bg-white px-4 text-sm font-medium text-black transition hover:bg-white/90 sm:flex"
              >
                Upgrade
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsKeysOpen(true)}
              className="grid size-9 place-items-center rounded-full border border-line text-white/50 transition hover:bg-white/5 hover:text-white"
              aria-label="API keys"
              title="Your API keys"
            >
              <KeyRound className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => go('/login', { replace: true, onCovered: logout })}
              className="grid size-9 place-items-center rounded-full border border-line text-white/50 transition hover:bg-white/5 hover:text-white"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-6xl px-5 py-14">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Hey {firstName}, what are we building?
            </h1>
            <p className="mt-2 text-white/45">
              {workspace
                ? `Shared projects in ${workspace.name}.`
                : 'Pick up where you left off, or start something new.'}
            </p>
          </div>
          {workspace?.role !== 'viewer' && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium bg-white text-black hover:bg-white/90 transition active:scale-95"
            >
              <Plus className="size-4" /> New project
            </button>
          )}
        </div>

        {newTeamName !== null && (
          <form onSubmit={createTeam} className="mt-6 flex flex-wrap items-center gap-2">
            <input
              autoFocus
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Workspace name"
              aria-label="Workspace name"
              className="h-10 min-w-0 flex-1 rounded-full border border-line bg-panel px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30 sm:max-w-xs"
            />
            <button
              type="submit"
              disabled={!newTeamName.trim()}
              className="h-10 rounded-full bg-white px-4 text-sm font-medium text-black disabled:opacity-40"
            >
              Create workspace
            </button>
            <button
              type="button"
              onClick={() => setNewTeamName(null)}
              className="h-10 rounded-full px-3 text-sm text-white/50 hover:text-white"
            >
              Cancel
            </button>
          </form>
        )}

        {teams.invites.map((invite) => (
          <div
            key={invite.id}
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-sm"
          >
            <span className="text-white/70">
              You're invited to <b className="text-white">{invite.name}</b> as {invite.role}.
            </span>
            <button
              type="button"
              onClick={() => accept(invite.id)}
              className="h-8 rounded-full bg-white px-4 text-xs font-medium text-black hover:bg-white/90"
            >
              Accept
            </button>
          </div>
        ))}

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {!projects &&
            Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-60 animate-pulse rounded-2xl border border-line bg-panel" />
            ))}

          {projects?.length === 0 && workspace?.role !== 'viewer' && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="group col-span-full flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 transition hover:border-white/30 hover:bg-white/[0.02]"
            >
              <LogoMark size={56} className="mb-5 transition group-hover:scale-110" />
              <span className="text-lg font-medium text-white">Nothing here. Yet.</span>
              <span className="mt-1 text-sm text-white/45">
                Name it, pick a stack, start building.
              </span>
            </button>
          )}

          {projects?.map((project, i) => {
            return (
              <motion.div
                key={project._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <SpotlightCard
                  as={Link}
                  to={`/projects/${project._id}`}
                  state={{ project }}
                  className="group block rounded-2xl border border-line bg-panel transition duration-300 hover:-translate-y-1 hover:border-white/15"
                >
                  <div className="relative h-32 overflow-hidden rounded-t-2xl border-b border-line bg-raised">
                    <div className="grid-fade absolute inset-0" />
                    <span className="absolute -right-1 -bottom-9 font-serif text-[7rem] leading-none text-white/[0.06] italic transition duration-500 group-hover:text-white/[0.14]">
                      {(project.projectName || 'U')[0]}
                    </span>
                    <span className="absolute bottom-3 left-4 font-mono text-[11px] text-white/45">
                      {project.projectType}
                    </span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="flex min-w-0 items-center gap-2 font-medium text-white">
                        <span className="truncate">{project.projectName || 'Untitled'}</span>
                        {project.role && project.role !== 'owner' && (
                          <RoleBadge role={project.role} />
                        )}
                      </h2>
                      <ArrowUpRight className="size-4 shrink-0 text-white/30 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
                    </div>
                    <p className="mt-2 flex items-center gap-2 text-xs text-white/40">
                      <span
                        className={`size-1.5 rounded-full ${STATUS[project.status] || STATUS.stopped} ${project.status === 'running' ? 'animate-pulse' : ''}`}
                      />
                      {project.status} · {timeAgo(project.updatedAt)}
                    </p>
                  </div>
                </SpotlightCard>
              </motion.div>
            );
          })}
        </section>
      </div>

      <CreateProjectDialog
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={create}
        busy={busy}
        error={createError}
        defaultName={pending ? projectNameFrom(pending.prompt) : ''}
        defaultType={pending?.projectType}
      />

      <ApiKeysDialog open={isKeysOpen} onClose={() => setIsKeysOpen(false)} />

      <PaymentDialog open={isPayOpen} plan="pro" onClose={() => setIsPayOpen(false)} />
    </main>
  );
}
