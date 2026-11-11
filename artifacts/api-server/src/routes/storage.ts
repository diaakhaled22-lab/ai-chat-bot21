import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { Router, type IRouter, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';

import {
  ObjectNotFoundError,
  ObjectStorageService,
  objectStorageClient,
} from '../lib/objectStorage';
import { requireClient } from '../middlewares/requireAuth';
import { isAllowedFileType } from '../lib/security';
import { setSafeObjectResponseHeaders } from '../lib/knowledgeFileSecurity';
import { db, companiesTable, companyKnowledgeFilesTable } from '@workspace/db';
import { eq, and } from 'drizzle-orm';
import { logger } from '../lib/logger';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Stream uploads to disk instead of memoryStorage to prevent memory exhaustion
const storageTempDir = path.join(os.tmpdir(), 'bot-manager-storage-uploads');
if (!fs.existsSync(storageTempDir)) {
  try {
    fs.mkdirSync(storageTempDir, { recursive: true });
  } catch (err) {
    logger.warn({ err }, 'Could not create storageTempDir');
  }
}

const storageDisk = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, storageTempDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${uniqueSuffix}-${safeName}`);
  },
});

const upload = multer({ storage: storageDisk, limits: { fileSize: 50 * 1024 * 1024 } });

/**
 * POST /storage/uploads
 *
 * Direct file upload — client sends multipart/form-data with a "file" field.
 * The server writes the file to GCS and returns { objectPath }.
 * This avoids needing the sidecar's signed-URL endpoint.
 */
router.post(
  '/storage/uploads',
  requireClient,
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const filePath = req.file.path;

    // Validate file type — only allow safe MIME types
    if (!isAllowedFileType(req.file.mimetype)) {
      if (filePath) fs.promises.unlink(filePath).catch(() => {});
      res.status(400).json({ error: `File type "${req.file.mimetype}" is not allowed. Allowed: CSV, JSON, Excel, and raster images.` });
      return;
    }

    try {
      const privateDir = objectStorageService.getPrivateObjectDir();
      const objectId = randomUUID();
      const fullPath = `${privateDir}/uploads/${objectId}`;

      // Parse bucket/object from path: /bucket-name/rest/of/path
      const parts = fullPath.replace(/^\//, '').split('/');
      const bucketName = parts[0];
      const objectName = parts.slice(1).join('/');

      const bucket = objectStorageClient.bucket(bucketName);
      const gcsFile = bucket.file(objectName);

      const fileBuffer = await fs.promises.readFile(filePath);

      await gcsFile.save(fileBuffer, {
        metadata: {
          contentType: req.file.mimetype || 'application/octet-stream',
          metadata: { uploadedByUserId: String(req.session.userId) },
        },
        resumable: false,
      });

      const objectPath = `/objects/${objectId}`;
      res.json({ objectPath, metadata: { name: req.file.originalname, size: req.file.size, contentType: req.file.mimetype } });
    } catch (error) {
      req.log.error({ err: error }, 'Error uploading file');
      res.status(500).json({ error: 'Failed to upload file' });
    } finally {
      if (filePath) {
        fs.promises.unlink(filePath).catch(() => {});
      }
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));
      setSafeObjectResponseHeaders(res, response.headers.get('content-type') || undefined);

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);

    // Verify that the user is authenticated (client or admin)
    if (!req.session?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Ownership check: admins can access all files; clients can only access
    // files that belong to their own company (prevents IDOR).
    if (req.session.role === "client") {
      const [company] = await db
        .select({ id: companiesTable.id })
        .from(companiesTable)
        .where(eq(companiesTable.clientId, req.session.userId))
        .limit(1);

      if (!company) {
        res.status(403).json({ error: "Access denied" });
        return;
      }

      // Check if any knowledge file owned by this company references this object
      const [ownedFile] = await db
        .select({ id: companyKnowledgeFilesTable.id })
        .from(companyKnowledgeFilesTable)
        .where(
          and(
            eq(companyKnowledgeFilesTable.companyId, company.id),
            eq(companyKnowledgeFilesTable.objectPath, objectPath)
          )
        )
        .limit(1);

      if (!ownedFile) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    setSafeObjectResponseHeaders(res, response.headers.get('content-type') || undefined, true);

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
