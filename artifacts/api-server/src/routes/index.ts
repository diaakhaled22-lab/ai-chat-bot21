import { Router, type IRouter } from "express";
import { getExchangeRates } from "../lib/currencyRates";
import healthRouter from "./health";
import authRouter from "./auth";
import adminRouter from "./admin";
import clientRouter from "./client";
import webhookRouter from "./webhook";
import widgetRouter from "./widget";
import telegramRouter from "./telegram";
import messengerRouter from "./messenger";
import whatsappRouter from "./whatsapp";
import openaiRouter from "./openai";
import storageRouter from "./storage";
import knowledgeFilesRouter from "./knowledgeFiles";
import wordpressRouter from "./wordpress";
import restApiRouter from "./restApi";
import shopifyRouter from "./shopify";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminRouter);
router.use(clientRouter);
router.use(webhookRouter);
router.use(widgetRouter);
router.use(telegramRouter);
router.use(messengerRouter);
router.use(whatsappRouter);
router.use(openaiRouter);
router.use(storageRouter);
router.use(knowledgeFilesRouter);
router.use(wordpressRouter);
router.use(restApiRouter);
router.use(shopifyRouter);

// Public / client currency rates endpoint (auto-synced daily)
router.get(["/currency-rates", "/currencies/rates", "/exchange-rates"], async (_req, res) => {
  try {
    const data = await getExchangeRates();
    res.json(data);
  } catch {
    res.status(500).json({ error: "Failed to load exchange rates" });
  }
});

export default router;
