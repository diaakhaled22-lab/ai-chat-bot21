import { db, adminConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface CurrencyRatesData {
  base: "USD";
  rates: Record<string, number>;
  lastUpdated: string;
  nextUpdate?: string;
  source: "live" | "cache" | "fallback";
  autoSync: boolean;
}

export const FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  SAR: 3.75,
  AED: 3.6725,
  EGP: 56.09,
  KWD: 0.307,
  QAR: 3.64,
  BHD: 0.376,
  OMR: 0.385,
  JOD: 0.709,
  EUR: 0.92,
  GBP: 0.77,
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PRIMARY_API = "https://open.er-api.com/v6/latest/USD";
const BACKUP_API = "https://api.exchangerate-api.com/v4/latest/USD";

/**
 * Fetch live rates from public exchange rate providers.
 */
async function fetchFromNetwork(): Promise<{ rates: Record<string, number>; timestamp: string } | null> {
  const timeoutSignal = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };

  // Try primary API
  try {
    const res = await fetch(PRIMARY_API, { signal: timeoutSignal(6000) });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data && data.rates && typeof data.rates === "object") {
        return {
          rates: {
            ...FALLBACK_RATES,
            ...data.rates,
            USD: 1.0,
          },
          timestamp: data.time_last_update_utc || new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    logger.warn({ err }, "Primary exchange rate API failed, trying backup...");
  }

  // Try backup API
  try {
    const res = await fetch(BACKUP_API, { signal: timeoutSignal(6000) });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data && data.rates && typeof data.rates === "object") {
        return {
          rates: {
            ...FALLBACK_RATES,
            ...data.rates,
            USD: 1.0,
          },
          timestamp: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    logger.warn({ err }, "Backup exchange rate API failed as well");
  }

  return null;
}

/**
 * Get current exchange rates from cache or fetch live.
 */
export async function getExchangeRates(forceSync = false): Promise<CurrencyRatesData> {
  try {
    const [row] = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, "currency_exchange_rates"));

    let cachedData: CurrencyRatesData | null = null;
    if (row && row.value) {
      try {
        cachedData = JSON.parse(row.value) as CurrencyRatesData;
      } catch {
        cachedData = null;
      }
    }

    const now = Date.now();
    const lastUpdatedMs = cachedData?.lastUpdated ? new Date(cachedData.lastUpdated).getTime() : 0;
    const isExpired = now - lastUpdatedMs > CACHE_TTL_MS;

    // If cache is fresh and not forcing sync, return cached rates
    if (cachedData && !isExpired && !forceSync) {
      return {
        ...cachedData,
        source: "cache",
      };
    }

    // If autoSync is disabled by admin and we're not forcing, return manual rates
    if (cachedData && cachedData.autoSync === false && !forceSync) {
      return {
        ...cachedData,
        source: "cache",
      };
    }

    // Fetch live rates
    const live = await fetchFromNetwork();
    if (live) {
      const freshData: CurrencyRatesData = {
        base: "USD",
        rates: live.rates,
        lastUpdated: new Date().toISOString(),
        nextUpdate: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        source: "live",
        autoSync: cachedData ? cachedData.autoSync : true,
      };

      await saveExchangeRates(freshData);
      logger.info(
        {
          SAR: freshData.rates.SAR,
          AED: freshData.rates.AED,
          EGP: freshData.rates.EGP,
        },
        "Auto-synced daily live currency exchange rates"
      );

      return freshData;
    }

    // If network failed, return cached data if available, or fallback
    if (cachedData) {
      return {
        ...cachedData,
        source: "cache",
      };
    }

    // Default fallback
    return {
      base: "USD",
      rates: FALLBACK_RATES,
      lastUpdated: new Date().toISOString(),
      source: "fallback",
      autoSync: true,
    };
  } catch (err) {
    logger.error({ err }, "Error getting exchange rates");
    return {
      base: "USD",
      rates: FALLBACK_RATES,
      lastUpdated: new Date().toISOString(),
      source: "fallback",
      autoSync: true,
    };
  }
}

/**
 * Persist exchange rates data to database.
 */
export async function saveExchangeRates(data: CurrencyRatesData): Promise<void> {
  const json = JSON.stringify(data);
  const [existing] = await db
    .select()
    .from(adminConfigTable)
    .where(eq(adminConfigTable.key, "currency_exchange_rates"));

  if (existing) {
    await db
      .update(adminConfigTable)
      .set({ value: json })
      .where(eq(adminConfigTable.key, "currency_exchange_rates"));
  } else {
    await db.insert(adminConfigTable).values({
      key: "currency_exchange_rates",
      value: json,
    });
  }
}
