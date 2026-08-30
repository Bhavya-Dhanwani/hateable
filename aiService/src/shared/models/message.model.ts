// Importing modules
import mongoose, { Document, Schema } from "mongoose";

export interface IMessage extends Document {
	conversationId: mongoose.Types.ObjectId;
	role: "user" | "assistant" | "system" | "tool";
	content?: string;
	toolCalls?: Array<{
		id: string;
		type: string;
		name: string;
		args: Record<string, unknown>;
	}>;
	toolCallId?: string;
	name?: string;
	tokensUsed?: {
		promptTokens: number;
		completionTokens: number;
		totalTokens: number;
	};
	createdAt: Date;
	updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
	{
		conversationId: {
			type: Schema.Types.ObjectId,
			ref: "Conversation",
			required: true,
		},
		role: {
			type: String,
			enum: ["user", "assistant", "system", "tool"],
			required: true,
		},
		content: {
			type: String,
			required: false,
		},
		toolCalls: [
			{
				id: { type: String, required: true },
				type: { type: String, required: true },
				name: { type: String, required: true },
				args: { type: Schema.Types.Mixed, required: true },
			},
		],
		toolCallId: {
			type: String,
			required: false,
		},
		name: {
			type: String,
			required: false,
		},
		tokensUsed: {
			promptTokens: { type: Number, default: 0 },
			completionTokens: { type: Number, default: 0 },
			totalTokens: { type: Number, default: 0 },
		},
	},
	{
		timestamps: true,
	}
);

// index for retrieving conversation history quickly in chronological order
messageSchema.index({ conversationId: 1, createdAt: 1 });

const Message = mongoose.model<IMessage>("Message", messageSchema);

export default Message;
