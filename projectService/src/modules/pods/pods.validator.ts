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

    // validating errors
    validateErrors

];

export { createPodValidators };