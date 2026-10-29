import mongoose from 'mongoose';

// A user's own provider API key (BYOK). The secret is stored encrypted (crypto.util); `last4` is
// kept plain just for display. Used to build a personal Router when the plan's allowance is spent.
const apiKeySchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    provider: { type: String, required: true }, // a ProviderId from the catalog
    model: { type: String, required: false }, // optional override; else the provider default
    keyEnc: { type: String, required: true }, // AES-256-GCM blob
    last4: { type: String, required: true }
  },
  { timestamps: true }
);

const ApiKey = mongoose.model('ApiKey', apiKeySchema);

export default ApiKey;
