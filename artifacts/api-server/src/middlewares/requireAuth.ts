import { Request, Response, NextFunction } from "express";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * Server-side identity verification for Admin routes.
 * Checks active session, verifies identity against PostgreSQL users table,
 * and confirms active admin role on every request.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId))
      .limit(1);

    if (!user) {
      // User no longer exists in database — invalidate session immediately
      req.session.destroy(() => {});
      res.clearCookie("connect.sid", { path: "/" });
      res.clearCookie("sid", { path: "/" });
      res.status(401).json({ error: "Session invalid: user account not found" });
      return;
    }

    if (user.role !== "admin") {
      res.status(403).json({ error: "Forbidden: Admin privileges required" });
      return;
    }

    // Keep session role in sync with database
    req.session.role = "admin";
    req.user = user;
    next();
  } catch (err) {
    logger.error({ err, userId: req.session.userId }, "requireAdmin identity check error");
    res.status(500).json({ error: "Identity verification failed" });
  }
}

/**
 * Server-side identity verification for Client routes.
 * Checks active session, verifies identity against PostgreSQL users table,
 * and confirms client/admin access privileges on every request.
 */
export async function requireClient(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Client authentication required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId))
      .limit(1);

    if (!user) {
      // User no longer exists in database — invalidate session immediately
      req.session.destroy(() => {});
      res.clearCookie("connect.sid", { path: "/" });
      res.clearCookie("sid", { path: "/" });
      res.status(401).json({ error: "Session invalid: user account not found" });
      return;
    }

    if (user.role !== "client" && user.role !== "admin") {
      res.status(403).json({ error: "Forbidden: Client privileges required" });
      return;
    }

    req.session.role = user.role;
    req.user = user;
    next();
  } catch (err) {
    logger.error({ err, userId: req.session.userId }, "requireClient identity check error");
    res.status(500).json({ error: "Identity verification failed" });
  }
}

/**
 * Server-side identity verification for generic authenticated routes.
 * Checks active session and verifies user presence in database.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId))
      .limit(1);

    if (!user) {
      req.session.destroy(() => {});
      res.clearCookie("connect.sid", { path: "/" });
      res.clearCookie("sid", { path: "/" });
      res.status(401).json({ error: "Session invalid: user account not found" });
      return;
    }

    req.session.role = user.role;
    req.user = user;
    next();
  } catch (err) {
    logger.error({ err, userId: req.session.userId }, "requireAuth identity check error");
    res.status(500).json({ error: "Identity verification failed" });
  }
}
