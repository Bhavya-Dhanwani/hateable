// Importing modules
import Workspace from '../models/workspace.model.js';
import User from '../models/user.model.js';

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';

/**
 * The workspaces a user can act in, with their role: the ones they own and the ones they
 * accepted an invite to. Only workspaces whose owner is still on the Team plan count, so a
 * downgrade switches sharing off without deleting anything.
 */
export async function workspacesOf(userId: string) {
  const workspaces = await Workspace.find({
    $or: [{ ownerId: userId }, { members: { $elemMatch: { userId, status: 'active' } } }]
  });
  const teamOwners = new Set(
    (
      await User.find(
        { _id: { $in: [...new Set(workspaces.map((w) => w.ownerId))] }, plan: 'team' },
        { _id: 1 }
      )
    ).map((u) => u._id.toString())
  );

  return workspaces
    .filter((w) => teamOwners.has(w.ownerId))
    .map((w) => ({
      id: w._id.toString(),
      name: w.name,
      role: (w.ownerId === userId
        ? 'owner'
        : w.members.find((m) => m.userId === userId)?.role) as WorkspaceRole
    }));
}
