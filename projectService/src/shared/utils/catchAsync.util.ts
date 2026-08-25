// Utility to catch errors in async route handlers and forward them to the global error handler
import { Request, Response, NextFunction, RequestHandler } from "express";

const catchAsync = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

export default catchAsync;
