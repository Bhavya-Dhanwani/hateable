// Importing modules
import express from "express";
import healthRouter from "./health.router.js";

// making the router
const router = express.Router();

// mounting the public routers
router.use("/health", healthRouter);

// exporting the router
export default router;
