import express, { Express } from "express";
import router from "./shared/routers/index.router.js";
import applyMiddlewares from "./shared/middlewares/index.middleware.js";
import notFoundHandler from "./shared/middlewares/NotFound.middleware.js";
import errorHandler from "./shared/middlewares/error.middleware.js";

function createApp(): Express {
    const app = express();

    // applying middlewares
    applyMiddlewares(app);

    // adding the index router to the app
    app.use("/api", router);

    // not found middleware for api
    app.use("/api", notFoundHandler);

    // fallback not found middleware
    app.use(notFoundHandler);

    // error handling middleware
    app.use(errorHandler);

    return app;
}

export default createApp;
