import mongoose, { Document, Schema } from "mongoose";

export interface IConversation extends Document {
    projectId: string;
    userId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
    {
        projectId: {
            type: String,
            required: true,
        },
        userId: {
            type: String,
            required: true,
        },
        title: {
            type: String,
            default: "New Conversation",
        },
    },
    {
        timestamps: true,
    }
);

// Add index on projectId and userId for fast querying
conversationSchema.index({ projectId: 1, userId: 1 });

const Conversation = mongoose.model<IConversation>("Conversation", conversationSchema);

export default Conversation;
