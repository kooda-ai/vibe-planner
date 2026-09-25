"use client";

import { ListChecks, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export function AppHeader() {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-[1800px] items-center gap-3 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
          data-testid="app-logo"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ListChecks className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">{t.app.name}</span>
        </Link>

        <nav className="ml-2 flex items-center gap-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn(pathname === "/" && "bg-accent text-accent-foreground")}
          >
            <Link href="/" data-testid="nav-dashboard">
              {t.nav.dashboard}
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={cn(
              pathname.startsWith("/settings") && "bg-accent text-accent-foreground",
            )}
          >
            <Link href="/settings" data-testid="nav-settings">
              <Settings className="mr-2 h-4 w-4" />
              {t.nav.settings}
            </Link>
          </Button>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
