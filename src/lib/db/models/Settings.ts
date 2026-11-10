import mongoose, { Schema, type Document, type Model } from "mongoose";
import {
  DATE_FORMATS,
  THEME_OPTIONS,
  type DashboardRange,
  type DateFormatOption,
  type ThemeOption,
} from "@/lib/constants";

export interface ISettings extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  currencyCode: string;
  currencySymbol: string;
  dateFormat: DateFormatOption;
  theme: ThemeOption;
  defaultDashboardRange: Exclude<DashboardRange, "CUSTOM">;
  createdAt: Date;
  updatedAt: Date;
}

const SettingsSchema = new Schema<ISettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    currencyCode: {
      type: String,
      required: true,
      default: "BDT",
      maxlength: 10,
    },
    currencySymbol: {
      type: String,
      required: true,
      default: "৳",
      maxlength: 8,
    },
    dateFormat: {
      type: String,
      enum: DATE_FORMATS,
      required: true,
      default: "DD MMM YYYY",
    },
    theme: {
      type: String,
      enum: THEME_OPTIONS,
      required: true,
      default: "system",
    },
    defaultDashboardRange: {
      type: String,
      enum: ["TODAY", "WEEK", "MONTH", "YEAR"],
      required: true,
      default: "MONTH",
    },
  },
  {
    timestamps: true,
    collection: "settings",
  },
);

export const SettingsModel: Model<ISettings> =
  mongoose.models.Settings ||
  mongoose.model<ISettings>("Settings", SettingsSchema);
