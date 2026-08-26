// Utility to catch errors in async route handlers and forward them to the global error handler
import { Request, Response, NextFunction, RequestHandler } from "express";

const catchAsync = <Req extends Request = Request, Res extends Response = Response>(
    fn: (req: Req, res: Res, next: NextFunction) => Promise<any>
): RequestHandler<any, any, any, any> => {
    return (req, res, next) => {
        fn(req as unknown as Req, res as unknown as Res, next).catch(next);
    };
};

export default catchAsync;
