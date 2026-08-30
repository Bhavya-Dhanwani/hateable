// Importing modules
import Message from "../models/message.model.js";

// class to handle message data access operations
class MessageDao {

	MessageModel: typeof Message;

	constructor() {
		// initializing the message model
		this.MessageModel = Message;
	}

	// function to find messages by conversation id
	async findMessagesByConversationId(conversationId: string) {
		return await this.MessageModel.find({ conversationId }).sort({ createdAt: 1 });
	}

	// function to insert multiple messages
	async insertMessages(messages: Array<Record<string, unknown>>) {
		return await this.MessageModel.insertMany(messages);
	}

}

export default MessageDao;
