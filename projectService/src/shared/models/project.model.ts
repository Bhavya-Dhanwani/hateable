import mongoose from "mongoose";

// Defining the schema for the Project model
const projectSchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ["starting", "running", "updating", "failed", "stopped"],
        default: "starting"
    },
    projectName: {
        type: String,
        required: false
    },
    projectType: {
        type: String,
        enum: ["next-js", "next-ts", "node-js", "node-ts", "react-js", "react-ts", "mern-js", "mern-ts"],
        required: true
    },
    userId: {
        type: String,
        required: false
    },
    podName: {
        type: String,
        required: false
    },
    serviceName: {
        type: String,
        required: false
    },
    previewURL: {
        type: String,
        required: false
    }
}, {
    timestamps: true
});

// Making the model for the Project schema
const Project = mongoose.model("Project", projectSchema);

// Exporting the Project model
export default Project;
