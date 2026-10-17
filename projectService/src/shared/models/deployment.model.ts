// Importing modules
import mongoose from 'mongoose';

// Defining the schema for the Deployment model
const deploymentSchema = new mongoose.Schema(
  {
    // subdomain the site is served on: <slug>.<DEPLOY_DOMAIN>
    slug: {
      type: String,
      required: true,
      unique: true
    },

    // one deployment per project, redeploying replaces the snapshot
    projectId: {
      type: String,
      required: true,
      unique: true
    },

    userId: {
      type: String,
      required: true
    },

    projectType: {
      type: String,
      enum: [
        'next-js',
        'next-ts',
        'node-js',
        'node-ts',
        'react-js',
        'react-ts',
        'mern-js',
        'mern-ts'
      ],
      required: true
    },

    // bumped on every redeploy so the dashboard can show which snapshot is live
    version: {
      type: Number,
      default: 1
    },

    deployedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Making the model for the Deployment schema
const Deployment = mongoose.model('Deployment', deploymentSchema);

// Exporting the Deployment model
export default Deployment;
