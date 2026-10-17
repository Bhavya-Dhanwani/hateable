// Importing modules
import mongoose from 'mongoose';

// Defining the schema for a user's connected GitHub account
const githubAccountSchema = new mongoose.Schema(
  {
    // one GitHub account per hateable user
    userId: {
      type: String,
      required: true,
      unique: true
    },

    login: {
      type: String,
      required: true
    },

    // OAuth token, AES-256-GCM encrypted (crypto.util.ts); never sent to the browser
    token: {
      type: String,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Making the model for the GitHub account schema
const GithubAccount = mongoose.model('GithubAccount', githubAccountSchema);

// Exporting the GitHub account model
export default GithubAccount;
