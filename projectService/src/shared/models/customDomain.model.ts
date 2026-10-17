// Importing modules
import mongoose from 'mongoose';

// Defining the schema for a custom domain connected to a deployment
const customDomainSchema = new mongoose.Schema(
  {
    // lowercase hostname, e.g. www.shop.com; a domain can belong to one deployment only
    domain: {
      type: String,
      required: true,
      unique: true
    },

    // the deployment it serves, and who added it
    slug: {
      type: String,
      required: true,
      index: true
    },

    projectId: {
      type: String,
      required: true,
      index: true
    },

    userId: {
      type: String,
      required: true
    },

    // value of the TXT record at _hateable.<domain> that proves the user controls the domain
    token: {
      type: String,
      required: true
    },

    // traffic for the domain is only served once the TXT record checked out
    verified: {
      type: Boolean,
      default: false
    },

    verifiedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Making the model for the custom domain schema
const CustomDomain = mongoose.model('CustomDomain', customDomainSchema);

// Exporting the custom domain model
export default CustomDomain;
