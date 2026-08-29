import mongoose from "mongoose";

// Defining the schema for the Project model
const projectSchema = new mongoose.Schema({
    projectId: {
        type: String,
        required: true,
        unique: true
    },
    podName: {
        type: String,
        required: false
    },
    serviceName: {
        type: String,
        required: false
    },
    userId: {
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
