import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, "../docs/snapbridge-product-roadmap.docx");

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
}

function para(text, opts = {}) {
  return new Paragraph({
    children: [new TextRun({ text, ...opts })],
    spacing: { after: 120 },
  });
}

function bullet(text) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } });
}

function tableRow(cells, header = false) {
  return new TableRow({
    children: cells.map(
      (c) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: c, bold: header })] })],
          width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
        }),
    ),
  });
}

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        heading("SnapBridge — Product Roadmap (5 Phases)"),
        para("Version 2.0 | September 2026", { italics: true }),
        para(""),

        heading("Product Vision", HeadingLevel.HEADING_2),
        para(
          "SnapBridge is a Personal Capture & Knowledge OS. Users capture text, screenshots, and documents from any device — organize them automatically — search and ask questions across everything — and run smart flows (interview prep, study plans, contract compare, etc.).",
        ),
        para("One-line pitch: Capture anything → organize itself → ask anything → act on it.", { bold: true }),

        heading("Core Principles", HeadingLevel.HEADING_2),
        bullet("No third-party data integrations — no email forwarding, no external calendar/mail APIs"),
        bullet("User brings the data — copy/paste, upload files, share from device, screenshot capture"),
        bullet("Own the pipeline — OCR, indexing, search, and AI run on our backend"),
        bullet("Phase by phase — ship capture first, intelligence second, agents last"),
        bullet("Privacy first — user data stays in our storage; export and delete anytime"),

        heading("Phase 1 — Foundation & Capture Sync", HeadingLevel.HEADING_1),
        para("Goal: Reliable cross-device capture. Timeline: Weeks 1–6. Status: Auth complete.", { italics: true }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            tableRow(["#", "Feature", "Description"], true),
            tableRow(["1", "Auth", "Sign up, login, Google OAuth, email verification, password reset, profile avatar"]),
            tableRow(["2", "Device Pairing", "QR code to link phone ↔ laptop. Trusted device list, revoke"]),
            tableRow(["3", "Clipboard Sync", "Copy text on phone → paste on laptop. Real-time via WebSocket"]),
            tableRow(["4", "Capture History", "Timeline of synced clips. Search, star, pin, delete"]),
          ],
        }),
        para(""),

        heading("Phase 2 — Vault + Semantic Search (CURRENT)", HeadingLevel.HEADING_1),
        para("Goal: Manual upload vault with vector embeddings and natural-language Q&A. Timeline: Weeks 7–12.", { italics: true }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            tableRow(["#", "Feature", "Description"], true),
            tableRow(["1", "Document Vault", "Upload PDF, DOCX, images via Cloudinary signed upload"]),
            tableRow(["2", "Text Extraction", "PDF parse, DOCX parse, OCR for images (BullMQ worker)"]),
            tableRow(["3", "Chunking + Embeddings", "OpenAI embeddings stored in MongoDB Atlas Vector Search"]),
            tableRow(["4", "Semantic Ask", "Natural-language questions with vector search + optional AI answer"]),
            tableRow(["5", "Smart Folders", "Auto-classify: Bills, Work, Study, Career, Legal, Personal"]),
            tableRow(["6", "Manual Folders", "User folders, move documents"]),
            tableRow(["7", "Screenshot Vault", "Image uploads via same pipeline"]),
            tableRow(["8", "Keyword Fallback", "MongoDB text index when vector score is low"]),
          ],
        }),
        para("Stack: MongoDB Atlas Vector Search (no Pinecone), BullMQ, OpenAI embeddings.", { italics: true }),
        para(""),

        heading("Phase 3 — Projects & Advanced Intelligence", HeadingLevel.HEADING_1),
        para("Goal: Project workspaces, scoped Q&A, PDF chat UI. Timeline: Weeks 13–18.", { italics: true }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            tableRow(["#", "Feature", "Description"], true),
            tableRow(["1", "Projects", "Workspaces per topic — MongoDB refs"]),
            tableRow(["2", "Folder Q&A", "Ask scoped to folder or project"]),
            tableRow(["3", "PDF Chat UI", "Chat panel per document with citations"]),
            tableRow(["4", "Entity Extraction", "Auto-detect people, dates, amounts"]),
            tableRow(["5", "Duplicate Detection", "Flag similar documents"]),
            tableRow(["6", "Timeline View", "Browse uploads chronologically"]),
            tableRow(["7", "Saved Searches", "Save frequent queries"]),
            tableRow(["8", "Hybrid Search UI", "Universal search bar"]),
          ],
        }),
        para(""),

        heading("Phase 4 — Smart Flows & Actions", HeadingLevel.HEADING_1),
        para("Goal: User gives a goal → agent finds docs → analyzes → generates plan. Timeline: Weeks 17–24.", { italics: true }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            tableRow(["#", "Feature", "Description"], true),
            tableRow(["1", "Smart Flows", "Hub for all agent-powered workflows"]),
            tableRow(["2", "Interview Prep", "Resume + JD + notes → gap analysis → prep plan"]),
            tableRow(["3", "Study Planner", "Notes/syllabus → daily schedule + quiz cards"]),
            tableRow(["4", "Compare Documents", "Side-by-side contract/offer analysis"]),
            tableRow(["5", "Finance Insights", "Bills + statements → spending summary → budget plan"]),
            tableRow(["6", "Tasks", "Extract commitments from meeting notes"]),
            tableRow(["7", "Meeting Follow-up", "Notes → tasks, deadlines, decisions"]),
            tableRow(["8", "Job Match", "Resume + JD → match score, missing skills"]),
          ],
        }),
        para(""),

        heading("Phase 5 — Advanced Intelligence & Platform", HeadingLevel.HEADING_1),
        para("Goal: Power-user features and platform maturity. Timeline: Months 7–12.", { italics: true }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            tableRow(["#", "Feature", "Description"], true),
            tableRow(["1", "Knowledge Graph", "Visual map of document/project connections"]),
            tableRow(["2", "Mock Interview", "AI practice based on resume + JD"]),
            tableRow(["3", "Insights Dashboard", "Spending, study progress, capture stats"]),
            tableRow(["4", "Custom Flows", "User-defined auto-triggers on upload"]),
            tableRow(["5", "Progress Tracking", "Flow completion, daily tasks, streaks"]),
            tableRow(["6", "Audio Transcription", "Upload audio → transcribe → searchable"]),
            tableRow(["7", "Video Notes", "Upload video → transcribe → index"]),
            tableRow(["8", "Structured Extract", "Pull amount, date, order ID from bills"]),
            tableRow(["9", "Sensitive Blur", "Auto-blur OTP/card hints in screenshots"]),
            tableRow(["10", "Data Export", "Export all data as ZIP. Full account deletion"]),
            tableRow(["11", "Desktop App", "System tray quick paste + vault"]),
            tableRow(["12", "Biometric Lock", "Fingerprint / Face ID on mobile"]),
          ],
        }),
        para(""),

        heading("Explicitly Out of Scope", HeadingLevel.HEADING_2),
        bullet("Email forwarding / inbox integration"),
        bullet("Gmail / Outlook / Notion sync"),
        bullet("External calendar integration"),
        bullet("Team / shared workspaces (personal use first)"),
        bullet("Third-party data APIs — user copies/uploads manually only"),

        heading("Current Progress", HeadingLevel.HEADING_2),
        bullet("Phase 1 — Auth: Complete"),
        bullet("Phase 1 — Device Pairing, Clipboard Sync, Capture History: Not started"),
        bullet("Phase 2–5: Planned"),

        para(""),
        para("SnapBridge / CaptureOS — Internal document. Version 2.0", { italics: true, size: 20 }),
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync(outPath, buffer);
console.log(`Written: ${outPath}`);
