import mongoose from "mongoose";
import env from "./env.config.js";
import logger from "./logger.config.js";

async function connectDB() {
    try {
        mongoose.set("strictQuery", false);
        await mongoose.connect(env.MONGO_URI);
        logger.info("Connected to the database");
    } catch (error) {
        logger.error(error, "Error connecting to the database");
    }
}

export default connectDB;
