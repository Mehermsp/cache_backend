import { Router } from "express";
import { Registration } from "../models/Registration.js";
import { customAlphabet } from "nanoid";
import ExcelJS from "exceljs";
import auth from "../middleware/auth.js";
import multer from "multer";
import cloudinary from "../utils/cloudinary.js";
import streamifier from "streamifier";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);
const router = Router();
const execAsync = promisify(exec);

// Multer setup (in-memory)
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * Registration endpoint
 */
router.post("/", upload.single("paymentProof"), async (req, res) => {
    try {
        const {
            name,
            contact,
            email,
            college,
            rollNumber,
            eventId,
            eventName,
            price,
            utr,
            paymentPhone,
            gameId,
            teamMembers,
        } = req.body;

        // Validate UTR (12 digits)
        if (!/^\d{12}$/.test(utr)) {
            return res
                .status(400)
                .json({ message: "Invalid UTR number (must be 12 digits)" });
        }

        // Validate phone (10 digits)
        if (!/^\d{10}$/.test(paymentPhone)) {
            return res
                .status(400)
                .json({ message: "Invalid phone number (must be 10 digits)" });
        }

        // Parse teamMembers if provided
        let parsedTeamMembers = [];
        if (teamMembers) {
            parsedTeamMembers = JSON.parse(teamMembers);
            // Validate team member data
            for (const member of parsedTeamMembers) {
                if (!member.name || !member.contact || !member.email || !member.rollNumber) {
                    return res
                        .status(400)
                        .json({ message: "All team member fields are required" });
                }
                if (member.gameId && !/^[a-zA-Z0-9_-]+$/.test(member.gameId)) {
                    return res
                        .status(400)
                        .json({ message: "Invalid game ID format for team member" });
                }
            }
        }

        // Validate gameId for primary participant if required
        if (gameId && !/^[a-zA-Z0-9_-]+$/.test(gameId)) {
            return res
                .status(400)
                .json({ message: "Invalid game ID format" });
        }

        // Upload screenshot to Cloudinary
        let proofUrl = null;
        if (req.file) {
            proofUrl = await new Promise((resolve, reject) => {
                const stream = cloudinary.uploader.upload_stream(
                    { folder: "cache2k25" },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result.secure_url);
                    }
                );
                streamifier.createReadStream(req.file.buffer).pipe(stream);
            });
        }

        const reg = await Registration.create({
            registrationId: "C25-" + nanoid(),
            name,
            contact,
            email,
            college,
            rollNumber,
            eventId,
            eventName,
            transactionAmount: Number(price) || 0,
            transactionDate: new Date(),
            paymentProof: proofUrl,
            utr,
            paymentPhone,
            gameId: gameId || null,
            teamMembers: parsedTeamMembers,
            verified: false,
        });

        res.json({ _id: reg._id, registrationId: reg.registrationId });
    } catch (e) {
        console.error(e);
        res.status(400).json({ message: "Invalid payload" });
    }
});

/**
 * Update verification status
 */
router.patch("/:id/verify", auth, async (req, res) => {
    try {
        const { verified } = req.body;
        const reg = await Registration.findByIdAndUpdate(
            req.params.id,
            { verified },
            { new: true }
        );
        if (!reg) {
            return res.status(404).json({ message: "Registration not found" });
        }
        res.json(reg);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * Admin: fetch all registrations
 */
router.get("/admin", auth, async (req, res) => {
    try {
        const regs = await Registration.find().sort({ createdAt: -1 });
        res.json(regs);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * Generate and download ticket as PDF
 */
router.get("/ticket/:id", auth, async (req, res) => {
    try {
        const reg = await Registration.findById(req.params.id);
        if (!reg) {
            return res.status(404).json({ message: "Registration not found" });
        }
        if (!reg.verified) {
            return res.status(400).json({ message: "Registration not verified" });
        }

        // Determine if the event is an esports event
        const isEsports = reg.eventName.includes("Esports");

        // Generate LaTeX content
        let teamMembersLatex = "";
        if (reg.teamMembers && reg.teamMembers.length > 0) {
            teamMembersLatex = reg.teamMembers
                .map((m) =>
                    isEsports
                        ? `\\item ${m.name} (Game ID: ${m.gameId || "N/A"})`
                        : `\\item ${m.name}`
                )
                .join("\n    ");
        }

        const latexContent = `
\\documentclass[a4paper]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{graphicx}
\\usepackage[T1]{fontenc}
\\usepackage{noto}
\\usepackage{xcolor}

\\definecolor{titleblue}{RGB}{0, 123, 255}
\\definecolor{headergray}{RGB}{100, 100, 100}

\\renewcommand{\\familydefault}{\\sfdefault}

\\begin{document}
\\pagestyle{empty}

\\begin{center}
    \\includegraphics[width=0.3\\textwidth]{https://res.cloudinary.com/your-cloudinary-id/image/upload/cache2k25/logo.png}
    \\vspace{10pt}
    \\textbf{\\Huge \\color{titleblue} Cache2k25 Event Ticket}
\\end{center}

\\vspace{20pt}

\\begin{center}
    \\Large \\textbf{Registration ID:} ${reg.registrationId} \\\\
    \\vspace{10pt}
    \\large \\textbf{Event:} ${reg.eventName} \\\\
    \\vspace{10pt}
\\end{center}

\\section*{Participants}
\\textbf{Primary Participant:} ${reg.name} \\\\
${isEsports && reg.gameId ? `\\textbf{Game ID:} ${reg.gameId} \\\\` : ""}
${teamMembersLatex ? `
\\vspace{10pt}
\\textbf{Team Members:}
\\begin{itemize}
    ${teamMembersLatex}
\\end{itemize}
` : ""}

\\vspace{20pt}

\\begin{center}
    \\small \\color{headergray} Please present this ticket at the Cache2k25 help desk on the event day.
\\end{center}

\\end{document}
`;

        // Write LaTeX content to a temporary file
        const tempDir = path.join(__dirname, "temp");
        await fs.mkdir(tempDir, { recursive: true });
        const texFile = path.join(tempDir, `ticket-${reg.registrationId}.tex`);
        await fs.writeFile(texFile, latexContent);

        // Compile LaTeX to PDF using latexmk
        await execAsync(`latexmk -pdf -outdir=${tempDir} ${texFile}`);

        // Read the generated PDF
        const pdfFile = path.join(tempDir, `ticket-${reg.registrationId}.pdf`);
        const pdfBuffer = await fs.readFile(pdfFile);

        // Set response headers for PDF download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=ticket-${reg.registrationId}.pdf`
        );

        // Send the PDF
        res.send(pdfBuffer);

        // Clean up temporary files
        await fs.unlink(texFile).catch(() => {});
        await fs.unlink(pdfFile).catch(() => {});
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to generate ticket" });
    }
});

/**
 * Export Excel
 */
router.get("/admin/export", auth, async (req, res) => {
    try {
        const regs = await Registration.find().sort({ createdAt: -1 });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Registrations");

        sheet.columns = [
            { header: "Registration ID", key: "registrationId", width: 20 },
            { header: "Name", key: "name", width: 20 },
            { header: "Contact", key: "contact", width: 20 },
            { header: "Email", key: "email", width: 25 },
            { header: "College", key: "college", width: 25 },
            { header: "Roll No", key: "rollNumber", width: 15 },
            { header: "Event", key: "eventName", width: 20 },
            { header: "Txn Date", key: "transactionDate", width: 25 },
            { header: "Amount", key: "transactionAmount", width: 15 },
            { header: "UTR", key: "utr", width: 20 },
            { header: "Payment Phone", key: "paymentPhone", width: 20 },
            { header: "Game ID", key: "gameId", width: 20 },
            { header: "Team Members", key: "teamMembers", width: 30 },
            { header: "Verified", key: "verified", width: 10 },
        ];

        regs.forEach((r) => {
            sheet.addRow({
                registrationId: r.registrationId,
                name: r.name,
                contact: r.contact,
                email: r.email,
                college: r.college,
                rollNumber: r.rollNumber,
                eventName: r.eventName,
                transactionDate: r.transactionDate,
                transactionAmount: r.transactionAmount,
                utr: r.utr,
                paymentPhone: r.paymentPhone,
                gameId: r.gameId || "N/A",
                teamMembers: r.teamMembers
                    ? r.teamMembers.map((m) => m.name).join(", ")
                    : "N/A",
                verified: r.verified ? "Yes" : "No",
            });
        });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", "attachment; filename=registrations.xlsx");

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ message: "Failed to export Excel" });
    }
});

export default router;