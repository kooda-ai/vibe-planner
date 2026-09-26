"use client";

import {
  Download,
  KeyRound,
  Pencil,
  Plug,
  PlugZap,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { LanguageToggle } from "@/components/language-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { MCPServersCard } from "@/components/settings/mcp-servers";
import {
  AddProviderButton,
  ProviderDialog,
  type ProviderFormValue,
} from "@/components/settings/provider-dialog";
import { SkillsCard } from "@/components/settings/skills";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  disconnectCodexProvider,
  fetchSettings,
  resetAllData,
  saveSettings,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  CODEX_PROVIDER_TYPE,
  type AppSettings,
  type MCPServerConfig,
  type ProviderSummary,
  type SkillConfig,
} from "@/lib/types";

export default function SettingsPage() {
  const { t, tr } = useI18n();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ProviderSummary | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await fetchSettings());
    } catch {
      toast.error(t.settings.saveFailed);
    } finally {
      setLoading(false);
    }
  }, [t.settings.saveFailed]);

  useEffect(() => {
    void load();
  }, [load]);

  async function persist(payload: unknown, success = true) {
    try {
      const next = await saveSettings(payload);
      setSettings(next);
      if (success) toast.success(t.settings.saved);
    } catch {
      toast.error(t.settings.saveFailed);
    }
  }

  async function upsertProvider(value: ProviderFormValue) {
    if (!settings) return;
    const providers: ProviderFormValue[] = settings.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      type: provider.type,
      baseUrl: provider.baseUrl,
      apiKey: "",
      models: provider.models,
    }));
    const index = value.id
      ? providers.findIndex((provider) => provider.id === value.id)
      : -1;
    if (index >= 0) {
      providers[index] = { ...providers[index], ...value };
    } else {
      providers.push(value);
    }
    await persist({
      providers,
      defaultProviderId: settings.defaultProviderId ?? value.id,
    });
  }

  async function removeProvider(provider: ProviderSummary) {
    if (!settings) return;
    const providers = settings.providers
      .filter((item) => item.id !== provider.id)
      .map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        baseUrl: item.baseUrl,
        apiKey: "",
        models: item.models,
      }));
    await persist({
      providers,
      defaultProviderId:
        settings.defaultProviderId === provider.id
          ? (providers[0]?.id ?? "")
          : settings.defaultProviderId,
    });
    setPendingDelete(null);
  }

  /** Unlinks the ChatGPT account by dropping the provider row that holds its tokens. */
  async function disconnectCodex(provider: ProviderSummary) {
    try {
      setSettings(await disconnectCodexProvider(provider.id));
      toast.success(t.settings.disconnected);
    } catch {
      toast.error(t.settings.disconnectFailed);
    }
  }

  async function importFile(file: File) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const response = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("import_failed");
      const result = (await response.json()) as { imported: number };
      toast.success(tr("settings.importDone", { count: result.imported }));
    } catch {
      toast.error(t.settings.importFailed);
    }
  }

  const defaultProvider = settings?.providers.find(
    (provider) => provider.id === settings.defaultProviderId,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="settings-title">
          {t.settings.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.settings.subtitle}</p>
      </div>

      {/* Providers */}
      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{t.settings.providers}</CardTitle>
            <CardDescription>{t.settings.providersDescription}</CardDescription>
          </div>
          <AddProviderButton onSubmit={upsertProvider} />
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <Skeleton className="h-16 rounded-lg" />
          ) : settings && settings.providers.length > 0 ? (
            settings.providers.map((provider) => {
              const isCodex = provider.type === CODEX_PROVIDER_TYPE;
              return (
                <div
                  key={provider.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                  data-testid="provider-row"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    {isCodex ? (
                      <PlugZap className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p
                        className="truncate text-sm font-medium"
                        data-testid="provider-name"
                      >
                        {provider.name}
                      </p>
                      {provider.id === settings.defaultProviderId ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {t.settings.defaultProvider}
                        </Badge>
                      ) : null}
                      {isCodex && provider.connected ? (
                        <Badge
                          variant="secondary"
                          className="text-[10px] text-emerald-600 dark:text-emerald-400"
                          data-testid="codex-badge"
                        >
                          <Plug className="mr-1 h-3 w-3" />
                          {t.settings.connected}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.settings.types[provider.type]}
                      {provider.baseUrl ? ` · ${provider.baseUrl}` : ""}
                      {provider.accountEmail ? ` · ${provider.accountEmail}` : ""}
                      {provider.models.length
                        ? ` · ${provider.models.slice(0, 2).join(", ")}${
                            provider.models.length > 2 ? "…" : ""
                          }`
                        : ""}
                    </p>
                    {isCodex ? (
                      provider.connected ? null : (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {t.settings.codexNoToken}
                        </p>
                      )
                    ) : !provider.hasApiKey ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t.settings.keyRequired}
                      </p>
                    ) : null}
                  </div>
                  {isCodex && provider.connected ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void disconnectCodex(provider)}
                      data-testid="disconnect-chatgpt"
                    >
                      {t.settings.disconnect}
                    </Button>
                  ) : null}
                  <ProviderDialog
                    provider={provider}
                    onSubmit={upsertProvider}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t.settings.editProvider}
                        data-testid="edit-provider"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.settings.deleteProvider}
                    onClick={() => setPendingDelete(provider)}
                    data-testid="delete-provider"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              );
            })
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {t.settings.noProviders}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.settings.defaultModel}</CardTitle>
          <CardDescription>{t.settings.providersDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {settings && settings.providers.length > 0 ? (
            <>
              <div className="grid gap-2">
                <Label>{t.settings.defaultProvider}</Label>
                <Select
                  value={settings.defaultProviderId ?? ""}
                  onValueChange={(value) => void persist({ defaultProviderId: value })}
                >
                  <SelectTrigger data-testid="default-provider-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {settings.providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="default-model">{t.settings.defaultModel}</Label>
                {defaultProvider && defaultProvider.models.length > 0 ? (
                  <Select
                    value={settings.defaultModel ?? defaultProvider.models[0]}
                    onValueChange={(value) => void persist({ defaultModel: value })}
                  >
                    <SelectTrigger data-testid="default-model-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {defaultProvider.models.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="default-model"
                    value={settings.defaultModel ?? ""}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        defaultModel: event.target.value,
                      })
                    }
                    onBlur={(event) => void persist({ defaultModel: event.target.value })}
                    placeholder={t.settings.modelsPlaceholder}
                    data-testid="default-model-input"
                  />
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              {t.settings.noDefaultModel}
            </p>
          )}
        </CardContent>
      </Card>

      {/* MCP servers */}
      {settings ? (
        <MCPServersCard
          servers={settings.mcpServers}
          onChange={(mcpServers: MCPServerConfig[]) =>
            setSettings({ ...settings, mcpServers })
          }
        />
      ) : null}

      {/* Skills */}
      {settings ? (
        <SkillsCard
          skills={settings.skills}
          onChange={(skills: SkillConfig[]) =>
            setSettings({ ...settings, skills })
          }
        />
      ) : null}

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.settings.appearance}</CardTitle>
          <CardDescription>{t.settings.appearanceDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <Label>{t.theme.label}</Label>
            <ThemeToggle />
          </div>
          <div className="flex items-center gap-3">
            <Label>{t.language.label}</Label>
            <LanguageToggle />
          </div>
        </CardContent>
      </Card>

      {/* Data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t.settings.data}</CardTitle>
          <CardDescription>{t.settings.dataDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/api/export";
              toast.success(t.settings.exportDone);
            }}
            data-testid="export-all"
          >
            <Download className="mr-2 h-4 w-4" />
            {t.settings.exportAll}
          </Button>
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            data-testid="import-button"
          >
            <Upload className="mr-2 h-4 w-4" />
            {t.settings.import}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            data-testid="import-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.target.value = "";
            }}
          />
          <p className="text-xs text-muted-foreground">{t.settings.importHint}</p>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base text-destructive">
            {t.settings.dangerZone}
          </CardTitle>
          <CardDescription>{t.settings.resetDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => setConfirmReset(true)}
            data-testid="reset-data"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {t.settings.reset}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.settings.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.settings.deleteDescription.replace(
                "{name}",
                pendingDelete?.name ?? "",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && void removeProvider(pendingDelete)}
              data-testid="confirm-delete-provider"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.settings.resetTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.settings.resetDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await resetAllData();
                  toast.success(t.settings.resetDone);
                } catch {
                  toast.error(t.settings.resetFailed);
                }
                setConfirmReset(false);
              }}
              data-testid="confirm-reset-data"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
