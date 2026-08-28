import { Request, Response, NextFunction } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || req.session.role !== "admin") {
    res.status(401).json({ error: "Admin access required" });
    return;
  }
  next();
}

export function requireClient(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || req.session.role !== "client") {
    res.status(401).json({ error: "Client access required" });
    return;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
