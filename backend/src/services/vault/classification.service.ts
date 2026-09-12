import type { SmartCategory } from "../../config/vault.js";

const CATEGORY_KEYWORDS: Record<Exclude<SmartCategory, "Inbox">, string[]> = {
  Bills: [
    "invoice",
    "bill",
    "receipt",
    "payment",
    "upi",
    "gst",
    "tax",
    "statement",
    "transaction",
    "amount",
    "rupee",
    "rs.",
    "₹",
  ],
  Work: [
    "project",
    "meeting",
    "client",
    "sprint",
    "deadline",
    "deliverable",
    "standup",
    "roadmap",
    "proposal",
  ],
  Study: [
    "syllabus",
    "exam",
    "lecture",
    "assignment",
    "chapter",
    "notes",
    "university",
    "college",
    "semester",
    "homework",
  ],
  Career: [
    "resume",
    "cv",
    "interview",
    "job",
    "offer",
    "salary",
    "linkedin",
    "hiring",
    "cover letter",
    "experience",
  ],
  Legal: [
    "contract",
    "agreement",
    "nda",
    "terms",
    "clause",
    "signature",
    "legal",
    "compliance",
  ],
  Personal: [
    "passport",
    "aadhaar",
    "pan",
    "insurance",
    "medical",
    "prescription",
    "travel",
    "ticket",
  ],
};

export function classifyDocumentText(
  text: string,
  title: string,
): SmartCategory {
  const haystack = `${title} ${text}`.toLowerCase();
  let bestCategory: SmartCategory = "Inbox";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = keywords.reduce(
      (sum, keyword) => sum + (haystack.includes(keyword) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as SmartCategory;
    }
  }

  return bestScore > 0 ? bestCategory : "Inbox";
}
