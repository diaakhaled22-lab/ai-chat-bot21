import { Router } from "express";
import multer from "multer";
import { db, companiesTable, companyKnowledgeFilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateClientKnowledgeFileBody } from "@workspace/api-zod";
import { requireClient } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { processKnowledgeFile, extractTextFromBuffer, KnowledgeFileType } from "../lib/knowledgeFiles";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const FILE_TYPE_BY_EXTENSION: Record<string, KnowledgeFileType> = {
  pdf: "pdf", xlsx: "excel", xls: "excel", csv: "csv", json: "json",
};

router.use("/client/company/knowledge-files", requireClient);

async function getOwnedCompany(clientId: number) {
  const [company] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.clientId, clientId))
    .limit(1);
  return company;
}

function serialize(file: typeof companyKnowledgeFilesTable.$inferSelect) {
  return {
    id: file.id,
    companyId: file.companyId,
    fileName: file.fileName,
    fileType: file.fileType,
    objectPath: file.objectPath,
    sourceUrl: file.sourceUrl,
    fileSize: file.fileSize,
    status: file.status,
    errorMessage: file.errorMessage,
    createdAt: file.createdAt.toISOString(),
  };
}

// POST /client/company/knowledge-files/upload  (multipart — direct upload, no GCS)
router.post(
  "/client/company/knowledge-files/upload",
  requireClient,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "";
    const fileType = FILE_TYPE_BY_EXTENSION[ext];
    if (!fileType) {
      res.status(400).json({ error: `Unsupported file type: .${ext}. Use PDF, Excel, CSV, or JSON.` });
      return;
    }

    const company = await getOwnedCompany(req.session.userId!);
    if (!company) {
      res.status(400).json({ error: "Configure your company before adding knowledge files" });
      return;
    }

    try {
      const text = await extractTextFromBuffer(fileType, req.file.buffer, req.file.originalname);
      const trimmed = text.trim();
      if (!trimmed) {
        res.status(422).json({ error: "No readable text or data was found in this file." });
        return;
      }

      const [file] = await db
        .insert(companyKnowledgeFilesTable)
        .values({
          companyId: company.id,
          fileName: req.file.originalname,
          fileType,
          fileSize: req.file.size,
          status: "ready",
          extractedText: trimmed.slice(0, 20_000),
        })
        .returning();

      res.status(201).json(serialize(file));
    } catch (err) {
      logger.error({ err }, "Upload knowledge file error");
      res.status(422).json({ error: err instanceof Error ? err.message : "Failed to process file" });
    }
  },
);

// GET /client/company/knowledge-files
router.get("/client/company/knowledge-files", async (req, res) => {
  try {
    const company = await getOwnedCompany(req.session.userId!);
    if (!company) {
      res.json([]);
      return;
    }

    const files = await db
      .select()
      .from(companyKnowledgeFilesTable)
      .where(eq(companyKnowledgeFilesTable.companyId, company.id))
      .orderBy(companyKnowledgeFilesTable.createdAt);

    res.json(files.map(serialize));
  } catch (err) {
    logger.error({ err }, "List knowledge files error");
    res.status(500).json({ error: "Failed to list knowledge files" });
  }
});

// POST /client/company/knowledge-files
router.post("/client/company/knowledge-files", async (req, res) => {
  try {
    const parsed = CreateClientKnowledgeFileBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid payload",
        details: parsed.error.issues.map((i) => i.message).join(", "),
      });
      return;
    }

    const { fileName, fileType, objectPath, sourceUrl, fileSize } = parsed.data;

    if (fileType === "google_sheet" && !sourceUrl) {
      res.status(400).json({ error: "sourceUrl is required for Google Sheet links" });
      return;
    }
    if (fileType !== "google_sheet" && !objectPath) {
      res.status(400).json({ error: "objectPath is required for uploaded files" });
      return;
    }

    const company = await getOwnedCompany(req.session.userId!);
    if (!company) {
      res.status(400).json({ error: "Configure your company before adding knowledge files" });
      return;
    }

    const [file] = await db
      .insert(companyKnowledgeFilesTable)
      .values({
        companyId: company.id,
        fileName,
        fileType,
        objectPath: objectPath ?? null,
        sourceUrl: sourceUrl ?? null,
        fileSize: fileSize ?? null,
        status: "processing",
      })
      .returning();

    void processKnowledgeFile(file.id);

    res.status(201).json(serialize(file));
  } catch (err) {
    logger.error({ err }, "Create knowledge file error");
    res.status(500).json({ error: "Failed to register knowledge file" });
  }
});

// DELETE /client/company/knowledge-files/:id
router.delete("/client/company/knowledge-files/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const company = await getOwnedCompany(req.session.userId!);
    if (!company) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const deleted = await db
      .delete(companyKnowledgeFilesTable)
      .where(and(eq(companyKnowledgeFilesTable.id, id), eq(companyKnowledgeFilesTable.companyId, company.id)))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Delete knowledge file error");
    res.status(500).json({ error: "Failed to delete knowledge file" });
  }
});

export default router;
