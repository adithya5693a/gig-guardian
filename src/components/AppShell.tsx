import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { languages, useI18n, type Language } from "@/lib/i18n";

export function AppShell({ children }: { children: ReactNode }) {
  const { language, setLanguage, t } = useI18n();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
              G
            </span>
            <span className="truncate text-lg font-extrabold tracking-tight">GigShield</span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1 text-sm font-medium">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {t("dashboard")}
            </Link>
            <Link
              to="/log"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {t("logJob")}
            </Link>
            <Link
              to="/assistant"
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground" }}
            >
              {t("aiChat")}
            </Link>
            <label className="sr-only" htmlFor="language-select">
              {t("language")}
            </label>
            <select
              id="language-select"
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
              className="max-w-24 rounded-md border border-border bg-secondary px-2 py-1.5 text-xs"
            >
              {Object.entries(languages).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}
