import { Router } from "express";
import multer from "multer";
import { db, companiesTable, companyKnowledgeFilesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { CreateClientKnowledgeFileBody } from "@workspace/api-zod";
import { requireClient } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { processKnowledgeFile, extractTextFromBuffer, KnowledgeFileType } from "../lib/knowledgeFiles";
import { indexKnowledgeFileChunks, retrieveRelevantKnowledgeChunks } from "../lib/knowledgeRag";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const FILE_TYPE_BY_EXTENSION: Record<string, KnowledgeFileType> = {
  pdf: "pdf",
  xlsx: "excel",
  xls: "excel",
  csv: "csv",
  json: "json",
  txt: "txt",
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
    chunkCount: file.chunkCount ?? 0,
    createdAt: file.createdAt.toISOString(),
  };
}

// POST /client/company/knowledge-files/upload  (multipart — direct upload, support PDF books, Excel, CSV, JSON, TXT)
router.post(
  "/client/company/knowledge-files/upload",
  requireClient,
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(413).json({ error: "حجم الملف كبير جداً. الحد الأقصى المسموح به هو 100 ميجابايت." });
          return;
        }
        res.status(400).json({ error: `خطأ أثناء رفع الملف: ${err.message}` });
        return;
      } else if (err) {
        res.status(400).json({ error: err.message || "Failed to upload file" });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "لم يتم اختيار أي ملف للرفع" });
      return;
    }

    const ext = req.file.originalname.split(".").pop()?.toLowerCase() ?? "";
    const fileType = FILE_TYPE_BY_EXTENSION[ext];
    if (!fileType) {
      res.status(400).json({ error: `صيغة الملف .${ext} غير مدعومة. الصيغ المسموحة: PDF, Excel, CSV, JSON, TXT.` });
      return;
    }

    const company = await getOwnedCompany(req.session.userId!);
    if (!company) {
      res.status(400).json({ error: "يرجى إعداد بيانات شركتك قبل إضافة ملفات المعرفة" });
      return;
    }

    try {
      const text = await extractTextFromBuffer(fileType, req.file.buffer, req.file.originalname);
      const trimmed = text.trim();
      if (!trimmed) {
        res.status(422).json({
          error: "تعذر استخراج نصوص قابلة للقراءة من هذا الملف. إذا كان ملف الـ PDF عبارة عن صور ممسوحة ضوئياً (Scanned Images)، يرجى التأكد من احتوائه على طبقة نصوص أو رفعه كنسخة نصية.",
        });
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
          extractedText: trimmed.slice(0, 2_000_000), // Supports large books and long documents
        })
        .returning();

      // Automatically chunk and index file into semantic vector chunks
      const chunkCount = await indexKnowledgeFileChunks(file.id, company.id, trimmed);
      file.chunkCount = chunkCount;

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
        fileType: fileType as any,
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

// POST /client/company/knowledge-files/semantic-search (Test RAG search)
router.post("/client/company/knowledge-files/semantic-search", async (req, res) => {
  try {
    const company = await getOwnedCompany(req.session.userId!);
    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    const { query } = req.body as { query?: string };
    if (!query || typeof query !== "string" || !query.trim()) {
      res.status(400).json({ error: "Query is required" });
      return;
    }

    const results = await retrieveRelevantKnowledgeChunks(company.id, query.trim(), 5);
    res.json({
      query: query.trim(),
      count: results.length,
      results,
    });
  } catch (err) {
    logger.error({ err }, "Semantic search test error");
    res.status(500).json({ error: "Failed to perform semantic search" });
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
