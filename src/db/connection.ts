// Establishes the single Mongoose connection used by every model in this folder.
import mongoose from "mongoose";
import { config } from "../config/index.js";

export async function connectDB(): Promise<void> {
  await mongoose.connect(config.mongodbUri);
  console.log("MongoDB connected");
}
