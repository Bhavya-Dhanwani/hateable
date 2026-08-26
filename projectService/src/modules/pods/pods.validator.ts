// Importing modules
import { query } from "express-validator";
import validateErrors from "../../shared/utils/validateErrors.util.js";

const createPodValidators = [

    // validating the podName field
    query("podName")
        .notEmpty()
        .withMessage("podName is required")
        .isString()
        .withMessage("podName must be a string")
        .custom((value) => {
            // Kubernetes DNS-1123 label constraints:
            // - contains only lowercase alphanumeric characters or '-'
            // - starts with an alphanumeric character
            // - ends with an alphanumeric character
            // - max 63 characters
            const dns1123Regex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
            if (!dns1123Regex.test(value)) {
                throw new Error("podName must consist of lowercase alphanumeric characters or '-', and must start and end with an alphanumeric character");
            }
            if (value.length > 63) {
                throw new Error("podName must be at most 63 characters long");
            }
            return true;
        }),

    // validating the projectId field
    query("projectId")
        .notEmpty()
        .withMessage("projectId is required")
        .isString()
        .withMessage("projectId must be a string"),

    // validating errors
    validateErrors

];

export { createPodValidators };