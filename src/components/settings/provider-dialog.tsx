"use client";

import { Loader2, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConnectChatGpt } from "@/components/settings/connect-chatgpt";
import { fetchModels } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  CODEX_MODELS,
  CODEX_PROVIDER_TYPE,
  PROVIDER_TYPES,
  type ProviderSummary,
  type ProviderType,
} from "@/lib/types";

export interface ProviderFormValue {
  id?: string;
  name: string;
  type: ProviderType;
  baseUrl?: string;
  apiKey: string;
  models: string[];
}

export function ProviderDialog({
  provider,
  trigger,
  onSubmit,
}: {
  provider?: ProviderSummary;
  trigger: React.ReactNode;
  onSubmit: (value: ProviderFormValue) => Promise<void>;
}) {
  const { t, tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<ProviderType>("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(provider?.name ?? "");
    setType(provider?.type ?? "openai");
    setBaseUrl(provider?.baseUrl ?? "");
    setApiKey("");
    setModels((provider?.models ?? []).join(", "));
  }, [open, provider]);

  const isCodex = type === CODEX_PROVIDER_TYPE;

  /**
   * The server already stored the tokens and the provider row; this only
   * applies the name/model edits the user made in the form on top of it.
   */
  async function handleConnected(connected: ProviderSummary) {
    await onSubmit({
      id: connected.id,
      name: name.trim() || connected.name,
      type: CODEX_PROVIDER_TYPE,
      apiKey: "",
      models: models
        .split(",")
        .map((model) => model.trim())
        .filter(Boolean),
    });
    setOpen(false);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error(t.settings.nameRequired);
      return;
    }
    // A Codex provider gets its credential from the browser login, not a key.
    if (!isCodex && !provider && !apiKey.trim()) {
      toast.error(t.settings.keyRequired);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        id: provider?.id,
        name: name.trim(),
        type,
        baseUrl: isCodex ? undefined : baseUrl.trim() || undefined,
        apiKey: isCodex ? "" : apiKey.trim(),
        models: models
          .split(",")
          .map((model) => model.trim())
          .filter(Boolean),
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function loadModels() {
    setFetching(true);
    try {
      const { models: found } = await fetchModels({
        providerId: provider?.id,
        type,
        apiKey: apiKey.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      });
      if (found.length) {
        setModels(found.join(", "));
        toast.success(tr("settings.fetched", { count: found.length }));
        // A Codex provider was created by the login flow, so the fetched
        // catalogue has to be written back for it to become the default.
        if (isCodex && provider) {
          await onSubmit({
            id: provider.id,
            name: name.trim() || provider.name,
            type: CODEX_PROVIDER_TYPE,
            apiKey: "",
            models: found,
          });
        }
      } else {
        toast.warning(t.settings.fetchFailed);
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (isCodex && (code === "codex_reconnect_required" || code === "codex_not_connected")) {
        toast.error(t.settings.codexNoToken);
      } else if (code.startsWith("Provider error")) {
        toast.error(code);
      } else {
        toast.error(t.settings.fetchFailed);
      }
    } finally {
      setFetching(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {provider ? t.settings.editProvider : t.settings.addProvider}
            </DialogTitle>
            <DialogDescription>{t.settings.providersDescription}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="provider-name">{t.settings.providerName}</Label>
              <Input
                id="provider-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t.settings.providerNamePlaceholder}
                data-testid="provider-name-input"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t.settings.providerType}</Label>
              <Select
                value={type}
                onValueChange={(value) => {
                  const next = value as ProviderType;
                  setType(next);
                  // The Codex backend lists no models, so seed the built-in
                  // catalogue instead of leaving the field empty.
                  if (next === CODEX_PROVIDER_TYPE && !models.trim()) {
                    setModels(CODEX_MODELS.join(", "));
                  }
                }}
              >
                <SelectTrigger data-testid="provider-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t.settings.types[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCodex ? (
              <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
                <p className="text-xs font-medium">{t.settings.codexExperimental}</p>
                <ConnectChatGpt onConnected={handleConnected} compact />
              </div>
            ) : (
              <>
                {type !== "anthropic" ? (
                  <div className="grid gap-2">
                    <Label htmlFor="provider-base-url">{t.settings.baseUrl}</Label>
                    <Input
                      id="provider-base-url"
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder={t.settings.baseUrlPlaceholder}
                      data-testid="provider-base-url-input"
                    />
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <Label htmlFor="provider-api-key">{t.settings.apiKey}</Label>
                  <Input
                    id="provider-api-key"
                    type="password"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={t.settings.apiKeyPlaceholder}
                    data-testid="provider-api-key-input"
                  />
                  {provider ? (
                    <p className="text-xs text-muted-foreground">
                      {t.settings.apiKeyKeep}
                    </p>
                  ) : null}
                </div>
              </>
            )}

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="provider-models">{t.settings.models}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadModels()}
                  disabled={fetching}
                  data-testid="fetch-models"
                >
                  {fetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  {t.settings.fetchModels}
                </Button>
              </div>
              <Input
                id="provider-models"
                value={models}
                onChange={(event) => setModels(event.target.value)}
                placeholder={t.settings.modelsPlaceholder}
                data-testid="provider-models-input"
              />
              <p className="text-xs text-muted-foreground">
                {isCodex ? t.settings.codexModelsHint : t.settings.modelsHint}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving} data-testid="save-provider">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddProviderButton({
  onSubmit,
}: {
  onSubmit: (value: ProviderFormValue) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <ProviderDialog
      onSubmit={onSubmit}
      trigger={
        <Button data-testid="add-provider-button">
          <Plus className="mr-2 h-4 w-4" />
          {t.settings.addProvider}
        </Button>
      }
    />
  );
}
