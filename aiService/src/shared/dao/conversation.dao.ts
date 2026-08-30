// Importing modules
import Conversation from "../models/conversation.model.js";

// class to handle conversation data access operations
class ConversationDao {

	ConversationModel: typeof Conversation;

	constructor() {
		// initializing the conversation model
		this.ConversationModel = Conversation;
	}

	// function to find a conversation by id
	async findConversationById(id: string) {
		return await this.ConversationModel.findById(id);
	}

	// function to create a new conversation
	async createConversation(conversationData: Record<string, unknown>) {
		return await this.ConversationModel.create(conversationData);
	}

	// function to update a conversation by id
	async updateConversationById(id: string, updateData: Record<string, unknown>) {
		return await this.ConversationModel.findByIdAndUpdate(id, updateData, { new: true });
	}

}

export default ConversationDao;
