import createApp from "./src/app.js";
import env from "./src/shared/config/env.config.js";
import logger from "./src/shared/config/logger.config.js";
import connectDB from "./src/shared/config/db.config.js";
import { startIdleReaper } from "./src/shared/services/activity.service.js";
import { connectToBroker } from "./src/shared/services/broker.service.js";

async function startServer() {
	const app = createApp();

	await connectDB();
	await startIdleReaper();
	await connectToBroker();

	app.listen(env.PORT, () => {
		logger.info(`Server is running on port ${env.PORT}`);
	});
}

startServer();