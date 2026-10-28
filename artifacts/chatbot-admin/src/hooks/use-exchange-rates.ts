import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export type SupportedCurrency = "USD" | "SAR" | "AED" | "EGP" | "KWD" | "QAR" | "EUR" | "GBP";

export interface CurrencyMetadata {
  code: SupportedCurrency;
  symbol: string;
  nameAr: string;
  nameEn: string;
  flag: string;
}

export const CURRENCY_METADATA: Record<SupportedCurrency, CurrencyMetadata> = {
  USD: {
    code: "USD",
    symbol: "$",
    nameAr: "دولار أمريكي",
    nameEn: "US Dollar",
    flag: "🇺🇸",
  },
  SAR: {
    code: "SAR",
    symbol: "ر.س",
    nameAr: "ريال سعودي",
    nameEn: "Saudi Riyal",
    flag: "🇸🇦",
  },
  AED: {
    code: "AED",
    symbol: "د.إ",
    nameAr: "درهم إماراتي",
    nameEn: "UAE Dirham",
    flag: "🇦🇪",
  },
  EGP: {
    code: "EGP",
    symbol: "ج.م",
    nameAr: "جنيه مصري",
    nameEn: "Egyptian Pound",
    flag: "🇪🇬",
  },
  KWD: {
    code: "KWD",
    symbol: "د.ك",
    nameAr: "دينار كويتي",
    nameEn: "Kuwaiti Dinar",
    flag: "🇰🇼",
  },
  QAR: {
    code: "QAR",
    symbol: "ر.ق",
    nameAr: "ريال قطري",
    nameEn: "Qatari Riyal",
    flag: "🇶🇦",
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    nameAr: "يورو",
    nameEn: "Euro",
    flag: "🇪🇺",
  },
  GBP: {
    code: "GBP",
    symbol: "£",
    nameAr: "جنيه إسترليني",
    nameEn: "British Pound",
    flag: "🇬🇧",
  },
};

export const DEFAULT_FALLBACK_RATES: Record<string, number> = {
  USD: 1.0,
  SAR: 3.75,
  AED: 3.6725,
  EGP: 56.09,
  KWD: 0.307,
  QAR: 3.64,
  EUR: 0.92,
  GBP: 0.77,
};

export interface CurrencyRatesResponse {
  base: "USD";
  rates: Record<string, number>;
  lastUpdated: string;
  nextUpdate?: string;
  source: "live" | "cache" | "fallback";
  autoSync: boolean;
}

export function useExchangeRates() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery<CurrencyRatesResponse>({
    queryKey: ["currency-rates"],
    queryFn: () => customFetch("/api/currency-rates"),
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: 60 * 60 * 1000, // Auto-refetch every hour in background
  });

  const rates: Record<string, number> = {
    ...DEFAULT_FALLBACK_RATES,
    ...(data?.rates || {}),
    USD: 1.0,
  };

  const syncMutation = useMutation({
    mutationFn: () =>
      customFetch("/api/admin/currency-rates/sync", {
        method: "POST",
      }),
    onSuccess: (freshData: any) => {
      queryClient.setQueryData(["currency-rates"], freshData);
      queryClient.invalidateQueries({ queryKey: ["currency-rates"] });
    },
  });

  const getRate = (currencyCode: string): number => {
    return rates[currencyCode] || 1.0;
  };

  const convert = (amountInUsd: number, targetCurrency: string): number => {
    const rate = getRate(targetCurrency);
    return amountInUsd * rate;
  };

  const formatPrice = (amountInUsd: number, targetCurrency: SupportedCurrency): string => {
    const val = convert(amountInUsd, targetCurrency);
    const meta = CURRENCY_METADATA[targetCurrency] || CURRENCY_METADATA.USD;
    return `${Math.round(val).toLocaleString()} ${meta.symbol}`;
  };

  return {
    rates,
    getRate,
    convert,
    formatPrice,
    lastUpdated: data?.lastUpdated || null,
    source: data?.source || "fallback",
    autoSync: data?.autoSync !== false,
    isLoading,
    isError,
    refetch,
    syncLiveRates: syncMutation.mutate,
    isSyncing: syncMutation.isPending,
  };
}
