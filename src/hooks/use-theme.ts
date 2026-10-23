import { useEffect, useState } from "react";

export type ThemeName = "phosphor" | "cyberpunk" | "amber" | "matrix";

export interface ThemeOption {
  id: ThemeName;
  name: string;
  color: string;
  description: string;
}

export const THEMES: ThemeOption[] = [
  { id: "phosphor", name: "Phosphor Matrix", color: "#00ff66", description: "Classic emerald terminal" },
  { id: "cyberpunk", name: "Cyberpunk Neon", color: "#00e5ff", description: "Electric cyan & hot magenta" },
  { id: "amber", name: "Amber CRT", color: "#ffb000", description: "Retro mainframe glow" },
  { id: "matrix", name: "Stealth Matrix", color: "#39ff14", description: "Ultra deep black & electric lime" },
];

const THEME_STORAGE_KEY = "hobt0_active_theme";

export const getStoredTheme = (): ThemeName => {
  if (typeof window === "undefined") return "phosphor";
  return (localStorage.getItem(THEME_STORAGE_KEY) as ThemeName) || "phosphor";
};

export const applyTheme = (theme: ThemeName) => {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
};

export const useTheme = () => {
  const [theme, setThemeState] = useState<ThemeName>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
  };

  return { theme, setTheme, themes: THEMES };
};
