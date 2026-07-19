import * as React from "react";

/**
 * Theme is light by default, user-switchable (dark or follow-the-OS). The
 * `.dark` class on <html> is applied synchronously by a boot script in
 * index.html to avoid a flash; this provider owns changes after mount and
 * keeps localStorage in sync.
 */
export type Theme = "dark" | "light" | "system";

const THEME_KEY = "relay.theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(theme: Theme): "dark" | "light" {
  return theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", resolve(theme) === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "dark" || stored === "system" ? stored : "light";
  });

  const setTheme = React.useCallback((next: Theme) => {
    localStorage.setItem(THEME_KEY, next);
    setThemeState(next);
  }, []);

  React.useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
