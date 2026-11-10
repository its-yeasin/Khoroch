"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import type { ThemeOption } from "@/lib/constants";

interface ThemeContextValue {
  theme: ThemeOption;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeOption) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeOption>(() => {
    if (typeof window === "undefined") return "system";
    const stored = window.localStorage.getItem("sw_theme") as ThemeOption | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
    return "system";
  });

  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(mq.matches ? "dark" : "light");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? systemTheme : theme;

  useEffect(() => {
    const root = document.documentElement;
    if (resolvedTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute(
        "content",
        resolvedTheme === "dark" ? "#0B0F17" : "#0D9488",
      );
    }
  }, [resolvedTheme]);

  const setTheme = (next: ThemeOption) => {
    setThemeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sw_theme", next);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
