// Importing modules
import express from 'express';
import WorkspacesController from './workspaces.controller.js';
import authMiddleware from '../../shared/middlewares/auth.middleware.js';

// making the router, every route needs a signed-in user
const router = express.Router();
const workspacesController = new WorkspacesController();
router.use(authMiddleware);

/*
    @route GET /api/auth/workspaces
    @desc The caller's workspaces with their members, and invites waiting for them
    @access Private
*/
router.get('/', workspacesController.list);

/*
    @route POST /api/auth/workspaces
    @desc Create a workspace: body { name }, Team plan only
    @access Private
*/
router.post('/', workspacesController.create);

/*
    @route POST /api/auth/workspaces/:workspaceId/invites
    @desc Invite by email: body { email, role }, owner or admin
    @access Private
*/
router.post('/:workspaceId/invites', workspacesController.invite);

/*
    @route POST /api/auth/workspaces/:workspaceId/accept
    @desc Accept an invite sent to the caller's email
    @access Private
*/
router.post('/:workspaceId/accept', workspacesController.accept);

/*
    @route PATCH /api/auth/workspaces/:workspaceId/members/:memberId
    @desc Change a member's role: body { role }, owner or admin
    @access Private
*/
router.patch('/:workspaceId/members/:memberId', workspacesController.updateMember);

/*
    @route DELETE /api/auth/workspaces/:workspaceId/members/:memberId
    @desc Remove a member or cancel an invite (owner or admin), or leave
    @access Private
*/
router.delete('/:workspaceId/members/:memberId', workspacesController.removeMember);

// exporting the router
export default router;
