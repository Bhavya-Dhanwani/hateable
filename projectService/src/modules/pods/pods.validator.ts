// Importing modules
import { body } from "express-validator";
import validateErrors from "../../shared/utils/validateErrors.util.js";

const createPodValidators = [

    // validating the name field in body
    body("name")
        .notEmpty()
        .withMessage("name is required")
        .isString()
        .withMessage("name must be a string"),

    body("projectType")
        .notEmpty()
        .withMessage("projectType is required")
        .isString()
        .withMessage("projectType must be a string")
        .isIn(["next-js", "next-ts", "node-js", "node-ts", "react-js", "react-ts", "mern-js", "mern-ts"])
        .withMessage("projectType must be one of: next-js, next-ts, node-js, node-ts, react-js, react-ts, mern-js, mern-ts"),

    // validating errors
    validateErrors

];

export { createPodValidators };