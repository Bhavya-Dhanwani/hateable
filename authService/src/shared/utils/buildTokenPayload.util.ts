import { workspacesOf } from './workspaces.util.js';

async function buildTokenPayload(user: Record<string, unknown> | object) {
  const u = user as {
    _id: { toString(): string };
    name?: string;
    email?: string;
    isVerified?: boolean;
    plan?: string;
    phone?: string;
    phoneVerified?: boolean;
  };
  const tokenPayload = {
    _id: u._id,
    userId: u._id.toString(),
    name: u.name,
    email: u.email,
    isVerified: u.isVerified,
    plan: u.plan,
    phone: u.phone,
    phoneVerified: u.phoneVerified,
    // projectService and aiService check shared-project access against this, so membership
    // changes reach them on the next refresh (within one access-token lifetime)
    workspaces: await workspacesOf(u._id.toString())
  };
  return tokenPayload;
}

export default buildTokenPayload;
