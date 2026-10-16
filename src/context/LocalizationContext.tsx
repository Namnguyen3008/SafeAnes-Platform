"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Locale, messages } from "@/i18n/messages";

interface LocalizationContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LocalizationContext = createContext<LocalizationContextType | null>(null);

const STORAGE_KEY = "safeanes_locale";
const DEFAULT_LOCALE: Locale = "vi";

function getNestedValue(obj: any, path: string): string | undefined {
  if (!obj || !path) return undefined;
  const parts = path.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

export function LocalizationProvider({
  children,
  initialLocale = DEFAULT_LOCALE,
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored === "en" || stored === "vi") {
        setLocaleState(stored);
      }
    } catch {
      // localStorage may fail in restricted sandbox
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_KEY, newLocale);
      document.cookie = `${STORAGE_KEY}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // ignore storage errors
    }
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      // 1. Check in active locale
      let val = getNestedValue(messages[locale], key);

      // 2. Fallback to English if missing or empty
      if (val === undefined && locale !== "en") {
        val = getNestedValue(messages.en, key);
      }

      // 3. If still missing, fallback to readable last key segment to never show raw cryptic paths
      if (val === undefined) {
        const segments = key.split(".");
        const last = segments[segments.length - 1];
        val = last.replace(/([A-Z])/g, " $1").trim();
      }

      // 4. Parameter interpolation: replace {paramName}
      if (params && val) {
        val = val.replace(/\{(\w+)\}/g, (_, match) => {
          return params[match] !== undefined ? String(params[match]) : `{${match}}`;
        });
      }

      return val;
    },
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t]
  );

  return (
    <LocalizationContext.Provider value={value}>
      {children}
    </LocalizationContext.Provider>
  );
}

export function useTranslation(namespacePrefix?: string) {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error("useTranslation must be used within a LocalizationProvider");
  }

  const { locale, setLocale, t: rootT } = context;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      if (namespacePrefix && !key.startsWith(namespacePrefix + ".")) {
        // Try namespaced key first
        const namespacedKey = `${namespacePrefix}.${key}`;
        const namespacedVal = getNestedValue(messages[locale], namespacedKey) ??
          getNestedValue(messages.en, namespacedKey);
        if (namespacedVal !== undefined) {
          return rootT(namespacedKey, params);
        }
      }
      return rootT(key, params);
    },
    [namespacePrefix, locale, rootT]
  );

  return {
    locale,
    setLocale,
    t,
  };
}

export const useI18n = useTranslation;
