// Importing module
import mongoose from 'mongoose';

// roles a member can be given; the owner is ownerId and is not in members
export const MEMBER_ROLES = ['admin', 'editor', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

// a Team plan workspace: projects in it are shared with its members
const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [60, 'Name must be at most 60 characters long']
    },

    ownerId: {
      type: String,
      required: true,
      index: true
    },

    // invites are members with status "invited" and no userId until they accept
    members: [
      {
        email: { type: String, required: true, lowercase: true, trim: true },
        userId: { type: String, required: false },
        name: { type: String, required: false },
        role: { type: String, enum: MEMBER_ROLES, default: 'editor' },
        status: { type: String, enum: ['invited', 'active'], default: 'invited' }
      }
    ]
  },
  { timestamps: true }
);

workspaceSchema.index({ 'members.userId': 1 });
workspaceSchema.index({ 'members.email': 1 });

// making the model for the workspace schema
const Workspace = mongoose.model('Workspace', workspaceSchema);

// exporting the workspace model
export default Workspace;
