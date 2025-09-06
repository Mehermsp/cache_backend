import express from "express";
import jwt from "jsonwebtoken";

const router = express.Router();

// POST /api/admin/login
router.post("/login", (req, res) => {
    const { email, password } = req.body;

    // hardcode for now, replace with DB later
    if (
        email === process.env.ADMIN_MAIL &&
        password === process.env.ADMIN_PASS
    ) {
        if (!process.env.JWT_SECRET) {
            return res
                .status(500)
                .json({ message: "JWT_SECRET not configured" });
        }
        const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
            expiresIn: "1h",
        });
        return res.json({ token });
    }

    res.status(401).json({ message: "Invalid credentials" });
});

export default router;
