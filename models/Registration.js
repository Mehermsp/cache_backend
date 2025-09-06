import mongoose from "mongoose";

const RegistrationSchema = new mongoose.Schema(
    {
        registrationId: { type: String, required: true },
        name: String,
        contact: String,
        email: String,
        college: String,
        rollNumber: String,
        eventId: String,
        eventName: String,
        transactionDate: { type: Date, default: Date.now },
        transactionAmount: Number,
        utr: String,
        paymentPhone: String,
        paymentProof: String,
        gameId: String, // For primary participant's game ID (esports)
        teamMembers: [
            {
                name: String,
                contact: String,
                email: String,
                rollNumber: String,
                gameId: String, // For team member's game ID (esports)
            },
        ],
        verified: { type: Boolean, default: false }, // New field for payment verification
    },
    { timestamps: true }
);

export const Registration = mongoose.model("Registration", RegistrationSchema);
