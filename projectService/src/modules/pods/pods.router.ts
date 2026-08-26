// Importing modules
import express from "express";
import catchAsync from "../../shared/utils/catchAsync.util.js";
import PodsController from "./pods.controller.js";
import { createPodValidators } from "./pods.validator.js";
import { CreatePodRequest } from "./pods.type.js";

// making the router
const router = express.Router();

// creating an instance of the controller
const podsController = new PodsController();

// defining the routes
// router.get("/", createPodValidators, catchAsync<CreatePodRequest>(podsController.createPod));
router.get("/", catchAsync<CreatePodRequest>(podsController.createPod));

export default router;