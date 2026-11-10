import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IRateLimit extends Document {
  key: string;
  count: number;
  expireAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
    },
    count: {
      type: Number,
      required: true,
      default: 0,
    },
    expireAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: "rate_limits",
  },
);

RateLimitSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitModel: Model<IRateLimit> =
  mongoose.models.RateLimit ||
  mongoose.model<IRateLimit>("RateLimit", RateLimitSchema);
