// Importing modules
import { Request, Response, NextFunction, RequestHandler } from "express";

// function to wrap async express route handlers and forward rejections to next()
function asyncWrapper(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {

	return (req: Request, res: Response, next: NextFunction) => {
		fn(req, res, next).catch(next);
	};

}

export default asyncWrapper;
