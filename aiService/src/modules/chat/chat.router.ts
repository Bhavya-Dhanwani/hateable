// Importing modules
import express, { RequestHandler } from "express";
import ChatController from "./chat.controller.js";
import authMiddleware from "../../shared/middlewares/auth.middleware.js";
import asyncWrapper from "../../shared/utils/asyncWrapper.util.js";

// making the router
const router = express.Router();

// creating a chat controller instance
const chatController = new ChatController();

/*
	@route POST /api/chat
	@desc Chat with the AI agent
	@access Private
*/
router.post("/", authMiddleware as RequestHandler, asyncWrapper(chatController.chatHandler) as RequestHandler);

// exporting the router
export default router;
