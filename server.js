import express from "express";
import dotenv from "dotenv";
import { connectDB } from "./db.js";
import regRoutes from "./routes/registrations.js";
import adminRoutes from "./routes/admin.js";
import cors from "cors";

dotenv.config();

const app = express();

// ✅ Only ONE cors() with correct config
app.use(cors({
  origin: 'https://cache2k25-register.vercel.app',  // frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));

app.get("/", (_, res) => res.send("CACHE2K25 API running"));

// Routes
app.use("/api/admin", adminRoutes);
app.use("/api/registrations", regRoutes);

const PORT = process.env.PORT || 5000;
connectDB(process.env.MONGODB_URI).then(() => {
    app.listen(PORT, () => console.log("Server on", PORT));
});
