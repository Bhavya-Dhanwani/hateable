// Importing modules
import { Request, Response } from 'express';
import env from '../../shared/config/env.config.js';
import Workspace, { MEMBER_ROLES, MemberRole } from '../../shared/models/workspace.model.js';
import User from '../../shared/models/user.model.js';
import BadRequest from '../../shared/errors/BadRequest.error.js';
import Conflict from '../../shared/errors/Conflict.error.js';
import Forbidden from '../../shared/errors/Forbidden.error.js';
import NotFound from '../../shared/errors/NotFound.error.js';
import Ok from '../../shared/responses/Ok.response.js';
import Created from '../../shared/responses/Created.response.js';
import sendMail from '../../shared/utils/sendMail.util.js';
import { workspacesOf } from '../../shared/utils/workspaces.util.js';

type AuthedRequest = Request & { user?: { userId?: string; email?: string; name?: string } };

const caller = (req: Request) => {
  const user = (req as AuthedRequest).user;
  return { userId: user?.userId || '', email: (user?.email || '').toLowerCase(), name: user?.name };
};

// names go into the invite email's html
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const isRole = (role: unknown): role is MemberRole => MEMBER_ROLES.includes(role as MemberRole);

// class to handle Team plan workspaces: create, invite, accept, change roles, remove
class WorkspacesController {
  // function to load a workspace the caller may manage (its owner or an admin)
  private findManaged = async (req: Request) => {
    const workspace = await Workspace.findById(req.params.workspaceId);
    if (!workspace) throw new NotFound('Workspace not found');

    const { userId } = caller(req);
    const admin = workspace.members.some(
      (m) => m.userId === userId && m.status === 'active' && m.role === 'admin'
    );
    if (workspace.ownerId !== userId && !admin) {
      throw new Forbidden('Only the owner or an admin can manage this workspace');
    }
    return workspace;
  };

  // list the caller's workspaces (with members) and the invites waiting for them
  list = async (req: Request, res: Response) => {
    const { userId, email } = caller(req);
    const mine = await workspacesOf(userId);
    const docs = await Workspace.find({ _id: { $in: mine.map((w) => w.id) } });
    const owners = await User.find(
      { _id: { $in: docs.map((w) => w.ownerId) } },
      { name: 1, email: 1 }
    );
    const ownerOf = (id: string) => owners.find((o) => o._id.toString() === id);

    const invited = await Workspace.find({
      members: { $elemMatch: { email, status: 'invited' } }
    });

    return Ok(res, 'Workspaces fetched successfully', {
      workspaces: mine.map((w) => {
        const doc = docs.find((d) => d._id.toString() === w.id)!;
        const owner = ownerOf(doc.ownerId);
        return {
          ...w,
          owner: { userId: doc.ownerId, name: owner?.name, email: owner?.email },
          members: doc.members
        };
      }),
      invites: invited.map((w) => ({
        id: w._id.toString(),
        name: w.name,
        role: w.members.find((m) => m.email === email)?.role
      }))
    });
  };

  // create a workspace, Team plan only
  create = async (req: Request, res: Response) => {
    const { userId } = caller(req);
    const name = String(req.body?.name || '').trim();
    if (!name) throw new BadRequest('A workspace name is required');

    // the plan is read fresh, the token's copy can be up to one lifetime old
    const user = await User.findById(userId, { plan: 1 });
    if (user?.plan !== 'team') {
      throw new Forbidden('Shared workspaces are part of the Team plan');
    }

    const workspace = await Workspace.create({ name, ownerId: userId, members: [] });
    return Created(res, 'Workspace created', { workspace });
  };

  // invite someone by email with a role; they accept from their projects page
  invite = async (req: Request, res: Response) => {
    const workspace = await this.findManaged(req);
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const role = req.body?.role ?? 'editor';

    if (!/\S+@\S+\.\S+/.test(email)) throw new BadRequest('A valid email is required');
    if (!isRole(role)) throw new BadRequest(`role must be one of ${MEMBER_ROLES.join(', ')}`);

    const owner = await User.findById(workspace.ownerId, { email: 1 });
    if (owner?.email?.toLowerCase() === email || workspace.members.some((m) => m.email === email)) {
      throw new Conflict(`${email} is already in this workspace`);
    }

    workspace.members.push({ email, role, status: 'invited' });
    await workspace.save();

    sendMail(
      email,
      `You're invited to ${workspace.name} on Hateable`,
      `<p>${escapeHtml(caller(req).name || 'A teammate')} invited you to the <b>${escapeHtml(workspace.name)}</b> workspace as ${role}.</p>
       <p><a href="${env.FRONTEND_URL}/projects">Open Hateable</a> and sign in with this email to accept.</p>`
    );

    return Created(res, 'Invite sent', { workspace });
  };

  // accept an invite sent to the caller's email
  accept = async (req: Request, res: Response) => {
    const { userId, email, name } = caller(req);
    const workspace = await Workspace.findById(req.params.workspaceId);
    const member = workspace?.members.find((m) => m.email === email && m.status === 'invited');
    if (!workspace || !member) throw new NotFound('Invite not found');

    member.userId = userId;
    member.name = name;
    member.status = 'active';
    await workspace.save();

    return Ok(res, `Joined ${workspace.name}`, { workspace });
  };

  // change a member's role
  updateMember = async (req: Request, res: Response) => {
    const workspace = await this.findManaged(req);
    const member = workspace.members.id(String(req.params.memberId));
    if (!member) throw new NotFound('Member not found');
    if (!isRole(req.body?.role)) {
      throw new BadRequest(`role must be one of ${MEMBER_ROLES.join(', ')}`);
    }

    member.role = req.body.role;
    await workspace.save();
    return Ok(res, 'Role updated', { workspace });
  };

  // remove a member or cancel an invite; anyone may also remove themselves (leave)
  removeMember = async (req: Request, res: Response) => {
    const workspace = await Workspace.findById(req.params.workspaceId);
    const member = workspace?.members.id(String(req.params.memberId));
    if (!workspace || !member) throw new NotFound('Member not found');

    if (member.userId !== caller(req).userId) await this.findManaged(req);

    workspace.members.pull(member._id);
    await workspace.save();
    return Ok(res, 'Member removed', { workspace });
  };
}

export default WorkspacesController;
