import express from "express";
import healthRouter from "./health.router.js";
import chatRouter from "../../modules/chat/chat.router.js";

const router = express.Router();

router.use("/health", healthRouter);
router.use("/chat", chatRouter);

export default router;
