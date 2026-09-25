"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import en from "./dictionaries/en";
import tr, { type Dictionary } from "./dictionaries/tr";

export type Locale = "tr" | "en";

export const LOCALES: Locale[] = ["tr", "en"];

const DICTIONARIES: Record<Locale, Dictionary> = {
  tr: tr as unknown as Dictionary,
  en,
};

const STORAGE_KEY = "planner.locale";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Dictionary;
  /** Looks up a dot-separated key and replaces `{name}` placeholders. */
  tr: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function lookup(dict: Dictionary, key: string): string | undefined {
  let current: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(text: string, vars?: Record<string, string | number>) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    vars[name] === undefined ? match : String(vars[name]),
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Always start with TR so server and first client render agree, then apply
  // the stored preference after mount.
  const [locale, setLocaleState] = useState<Locale>("tr");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "tr" || stored === "en") setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const dict = DICTIONARIES[locale];
    return {
      locale,
      setLocale,
      t: dict,
      tr: (key, vars) => interpolate(lookup(dict, key) ?? key, vars),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return context;
}
