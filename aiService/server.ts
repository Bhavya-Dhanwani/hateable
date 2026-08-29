import createApp from "./src/app.js";
import env from "./src/shared/config/env.config.js";
import logger from "./src/shared/config/logger.config.js";
import connectDB from "./src/shared/config/db.config.js";
import { connectToBroker, startProjectConsumer } from "./src/shared/services/broker.service.js";

async function startServer() {
	const app = createApp();

	await connectDB();
	await connectToBroker();
	await startProjectConsumer();

	app.listen(env.PORT, () => {
		logger.info(`AI Service is running on port ${env.PORT}`);
	});
}

startServer();
