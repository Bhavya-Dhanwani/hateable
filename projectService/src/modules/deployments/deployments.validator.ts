// Importing modules
import { param, query } from 'express-validator';
import validateErrors from '../../shared/utils/validateErrors.util.js';

const projectIdValidators = [
  // validating the project id in the url, an invalid ObjectId would crash the lookup
  param('projectId').isMongoId().withMessage('projectId must be a valid id'),

  // validating errors
  validateErrors
];

const analyticsValidators = [
  // validating the project id in the url
  param('projectId').isMongoId().withMessage('projectId must be a valid id'),

  // validating the range of the daily chart
  query('days')
    .optional()
    .isInt({ min: 1, max: 30 })
    .withMessage('days must be a number between 1 and 30'),

  // validating errors
  validateErrors
];

export { projectIdValidators, analyticsValidators };
