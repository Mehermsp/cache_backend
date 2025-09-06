import mongoose from "mongoose";
export async function connectDB(uri) {
    mongoose.set("strictQuery", true);
    await mongoose.connect(uri, { dbName: "cache2k25" });
    console.log("Mongo connected");
}
