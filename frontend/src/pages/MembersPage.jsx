import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { projectsApi } from '../api/projects.js';
import { workspacesApi } from '../api/workspaces.js';
import { useAuth } from '../auth/auth-context.js';
import { RoleBadge } from '../components/RoleBadge.jsx';

const ROLES = ['admin', 'editor', 'viewer'];

const field =
  'h-10 rounded-full border border-line bg-panel px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30';

// members, invites and roles of a Team workspace, plus its AI usage per member and project
export function MembersPage() {
  const { workspaceId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(null);
  const [usage, setUsage] = useState(null);
  const [projects, setProjects] = useState([]);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');

  // bumped after every change so names, roles and usage reload together
  const [version, setVersion] = useState(0);

  useEffect(() => {
    workspacesApi
      .list()
      .then(({ workspaces }) => {
        const found = workspaces.find((w) => w.id === workspaceId);
        if (!found) return navigate('/projects', { replace: true });
        setWorkspace(found);
        // usage and project names are extras: the members list works without them
        workspacesApi.usage(workspaceId).then(setUsage, () => {});
        projectsApi.list(workspaceId).then(setProjects, () => {});
      })
      .catch((e) => setError(e.message));
  }, [workspaceId, navigate, version]);

  const run = (action) => async (event) => {
    event?.preventDefault?.();
    setError('');
    try {
      await action();
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!workspace) {
    return (
      <main className="grid min-h-svh place-items-center bg-ink text-sm text-white/45">
        {error || 'Loading workspace…'}
      </main>
    );
  }

  const canManage = workspace.role === 'owner' || workspace.role === 'admin';
  const people = [
    { _id: 'owner', ...workspace.owner, role: 'owner', status: 'active' },
    ...workspace.members
  ];
  const nameOf = (id) => {
    const person = people.find((p) => p.userId === id);
    return person?.name || person?.email || 'Former member';
  };
  const projectName = (id) => projects.find((p) => p._id === id)?.projectName || 'Deleted project';

  return (
    <main className="min-h-svh bg-ink text-white">
      <div className="mx-auto max-w-4xl px-5 py-10">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-white/45 hover:text-white"
        >
          <ArrowLeft className="size-4" /> Projects
        </Link>
        <h1 className="mt-6 flex items-center gap-3 text-3xl font-semibold tracking-tight">
          {workspace.name} <RoleBadge role={workspace.role} />
        </h1>
        <p className="mt-2 text-white/45">
          Everyone here shares the workspace&apos;s projects and its Team plan AI allowance.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        <section className="mt-10">
          <h2 className="text-lg font-medium">Members</h2>
          {canManage && (
            <form
              onSubmit={run(async () => {
                await workspacesApi.invite(workspaceId, email.trim(), role);
                setEmail('');
              })}
              className="mt-4 flex flex-wrap gap-2"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                aria-label="Email to invite"
                className={`${field} min-w-0 flex-1`}
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                aria-label="Role"
                className={field}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="h-10 rounded-full bg-white px-5 text-sm font-medium text-black hover:bg-white/90"
              >
                Invite
              </button>
            </form>
          )}

          <ul className="mt-4 divide-y divide-white/5 rounded-2xl border border-line bg-panel">
            {people.map((m) => {
              const isMe = m.userId === user.userId;
              return (
                <li key={m._id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-white/85">
                      {m.name || m.email} {isMe && <span className="text-white/35">(you)</span>}
                    </span>
                    <span className="block truncate text-xs text-white/35">
                      {m.email}
                      {m.status === 'invited' && ' · invite pending'}
                    </span>
                  </span>
                  {canManage && m.role !== 'owner' ? (
                    <select
                      value={m.role}
                      onChange={(e) =>
                        run(() => workspacesApi.setRole(workspaceId, m._id, e.target.value))()
                      }
                      aria-label={`Role of ${m.email}`}
                      className="h-8 rounded-full border border-line bg-ink px-3 text-xs text-white"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <RoleBadge role={m.role} />
                  )}
                  {m.role !== 'owner' && (canManage || isMe) && (
                    <button
                      type="button"
                      onClick={run(async () => {
                        await workspacesApi.remove(workspaceId, m._id);
                        if (isMe) navigate('/projects');
                      })}
                      className="grid size-8 place-items-center rounded-full text-white/40 hover:bg-red-500/15 hover:text-red-300"
                      aria-label={isMe ? 'Leave workspace' : `Remove ${m.email}`}
                      title={isMe ? 'Leave' : 'Remove'}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="text-lg font-medium">AI usage</h2>
          {!usage ? (
            <p className="mt-3 text-sm text-white/40">Usage is not available right now.</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-white/45">
                {usage.used} of {usage.limit} shared messages used in the last 24 hours.
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-rose-400"
                  style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }}
                />
              </div>
              {usage.rows.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-2xl border border-line bg-panel">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-white/40">
                      <tr>
                        <th className="px-4 py-2.5 font-normal">Member</th>
                        <th className="px-4 py-2.5 font-normal">Project</th>
                        <th className="px-4 py-2.5 text-right font-normal">Last 24h</th>
                        <th className="px-4 py-2.5 text-right font-normal">All time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {usage.rows.map((r) => (
                        <tr key={`${r.userId}:${r.projectId}`}>
                          <td className="px-4 py-2.5 text-white/80">{nameOf(r.userId)}</td>
                          <td className="px-4 py-2.5 text-white/60">{projectName(r.projectId)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{r.last24h}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{r.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
