"use client";

import {
  AlertTriangle,
  ChevronDown,
  ClipboardPaste,
  Loader2,
  Pencil,
  Plus,
  Server,
  Terminal,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteMCPServer,
  importMCPServers,
  saveMCPServers,
  testMCPServer,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import {
  MCP_TRANSPORT_TYPES,
  type MCPServerConfig,
  type MCPToolInfo,
  type MCPTransportType,
} from "@/lib/types";

/**
 * Transient draft of a server while the dialog is open. Secrets come back from
 * the server masked (empty values), which is what `mergeSecrets` in the API
 * route expects when saving.
 */
export type ServerDraft = {
  id?: string;
  name: string;
  transport: MCPTransportType;
  command: string;
  args: string;
  env: string;
  url: string;
  headers: string;
  enabled: boolean;
};

/** `KEY=VALUE` lines <-> record, for the env/headers textareas. */
function parseLines(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function formatLines(record: Record<string, string> | undefined): string {
  if (!record) return "";
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

const EMPTY_DRAFT: ServerDraft = {
  name: "",
  transport: "stdio",
  command: "",
  args: "",
  env: "",
  url: "",
  headers: "",
  enabled: true,
};

export function MCPServersCard({
  servers,
  onChange,
}: {
  servers: MCPServerConfig[];
  onChange: (servers: MCPServerConfig[]) => void;
}) {
  const { t, tr } = useI18n();
  const [pendingDelete, setPendingDelete] = useState<MCPServerConfig | null>(null);
  /** Test results per server id, kept outside the persisted settings. */
  const [tools, setTools] = useState<Record<string, MCPToolInfo[]>>({});
  const [status, setStatus] = useState<Record<string, "idle" | "connected" | "error">>(
    {},
  );
  const [testing, setTesting] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function test(server: MCPServerConfig) {
    setTesting(server.id);
    try {
      const result = await testMCPServer(server.id);
      if ("error" in result) {
        setStatus((prev) => ({ ...prev, [server.id]: "error" }));
        setTools((prev) => ({ ...prev, [server.id]: [] }));
        toast.error(
          tr("settings.mcp.toolsFailed", { error: result.error }),
        );
      } else {
        setStatus((prev) => ({ ...prev, [server.id]: "connected" }));
        setTools((prev) => ({ ...prev, [server.id]: result.tools }));
        setExpanded(server.id);
        toast.success(tr("settings.mcp.toolsFound", { count: result.tools.length }));
      }
    } finally {
      setTesting(null);
    }
  }

  /**
   * Toggles one tool's auto-approve. The value lives in its own settings key on
   * the server, so it is saved together with the server row.
   */
  async function toggleTool(
    server: MCPServerConfig,
    tool: MCPToolInfo,
    autoApprove: boolean,
  ) {
    const next = servers.map((item) =>
      item.id === server.id
        ? {
            ...item,
            tools: [{ toolName: tool.toolName, autoApprove }],
          }
        : item,
    );
    try {
      const saved = await saveMCPServers(next);
      onChange(saved.servers);
      setTools((prev) => ({
        ...prev,
        [server.id]: (prev[server.id] ?? []).map((item) =>
          item.name === tool.name ? { ...item, autoApprove } : item,
        ),
      }));
    } catch {
      toast.error(t.settings.mcp.saveFailed);
    }
  }

  async function remove(server: MCPServerConfig) {
    try {
      const saved = await deleteMCPServer(server.id);
      onChange(saved.servers);
      toast.success(t.settings.mcp.saved);
    } catch {
      toast.error(t.settings.mcp.saveFailed);
    }
    setPendingDelete(null);
  }

  async function upsert(draft: ServerDraft) {
    const isStdio = draft.transport === "stdio";
    const entry = {
      id: draft.id,
      name: draft.name,
      transport: draft.transport,
      enabled: draft.enabled,
      ...(isStdio
        ? {
            command: draft.command,
            args: draft.args.split(/\s+/).filter(Boolean),
            env: parseLines(draft.env),
          }
        : { url: draft.url, headers: parseLines(draft.headers) }),
    };
    // The server assigns an id to a new entry; an edit replaces its own row.
    const index = draft.id
      ? servers.findIndex((server) => server.id === draft.id)
      : -1;
    const next = [...servers];
    if (index >= 0) next[index] = { ...servers[index], ...entry } as MCPServerConfig;
    else next.push(entry as MCPServerConfig);

    try {
      const saved = await saveMCPServers(
        next.map((server) => ({
          id: server.id,
          name: server.name,
          transport: server.transport,
          command: server.command,
          args: server.args,
          url: server.url,
          enabled: server.enabled,
          // Secrets are intentionally omitted: an empty value means "keep".
        })),
      );
      onChange(saved.servers);
      toast.success(t.settings.mcp.saved);
    } catch {
      toast.error(t.settings.mcp.saveFailed);
    }
  }

  async function toggleEnabled(server: MCPServerConfig, enabled: boolean) {
    const next = servers.map((item) =>
      item.id === server.id ? { ...item, enabled } : item,
    );
    try {
      const saved = await saveMCPServers(
        next.map((item) => ({
          id: item.id,
          name: item.name,
          transport: item.transport,
          command: item.command,
          args: item.args,
          url: item.url,
          enabled: item.enabled,
        })),
      );
      onChange(saved.servers);
    } catch {
      toast.error(t.settings.mcp.saveFailed);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{t.settings.mcp.title}</CardTitle>
          <CardDescription>{t.settings.mcp.description}</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <ImportDialog onImported={(next) => onChange(next)} existing={servers} />
          <AddServerButton onSubmit={upsert} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p
          className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
          data-testid="mcp-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t.settings.mcp.experimental}</span>
        </p>

        {servers.length === 0 ? (
          <p
            className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
            data-testid="mcp-empty"
          >
            {t.settings.mcp.empty}
          </p>
        ) : (
          servers.map((server) => {
            const state = status[server.id] ?? "idle";
            const serverTools = tools[server.id] ?? [];
            return (
              <div
                key={server.id}
                className="rounded-lg border p-3"
                data-testid="mcp-server-row"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    {server.transport === "stdio" ? (
                      <Terminal className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Server className="h-4 w-4 text-muted-foreground" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className="truncate text-sm font-medium"
                        data-testid="mcp-server-name"
                      >
                        {server.name}
                      </p>
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {server.transport}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={
                          state === "connected"
                            ? "text-[10px] text-emerald-600 dark:text-emerald-400"
                            : state === "error"
                              ? "text-[10px] text-destructive"
                              : "text-[10px]"
                        }
                        data-testid="mcp-status"
                      >
                        {state === "connected"
                          ? t.settings.mcp.statusConnected
                          : state === "error"
                            ? t.settings.mcp.statusError
                            : t.settings.mcp.statusIdle}
                      </Badge>
                      {!server.enabled ? (
                        <Badge variant="outline" className="text-[10px]">
                          {t.settings.mcp.enabled}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {server.transport === "stdio"
                        ? [server.command, ...(server.args ?? [])].join(" ")
                        : server.url}
                    </p>
                  </div>
                  <Switch
                    checked={server.enabled}
                    onCheckedChange={(checked) => void toggleEnabled(server, checked)}
                    aria-label={t.settings.mcp.enabled}
                    data-testid="mcp-server-enabled"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void test(server)}
                    disabled={testing === server.id}
                    data-testid="mcp-test-server"
                  >
                    {testing === server.id ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {testing === server.id
                      ? t.settings.mcp.listing
                      : t.settings.mcp.listTools}
                  </Button>
                  <ServerDialog
                    server={server}
                    onSubmit={upsert}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t.settings.mcp.editServer}
                        data-testid="edit-mcp-server"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.settings.mcp.deleteServer}
                    onClick={() => setPendingDelete(server)}
                    data-testid="delete-mcp-server"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>

                {state === "connected" ? (
                  <Collapsible
                    open={expanded === server.id}
                    onOpenChange={(open) =>
                      setExpanded(open ? server.id : null)
                    }
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-7 px-2 text-xs text-muted-foreground"
                        data-testid="mcp-toggle-tools"
                      >
                        <ChevronDown className="mr-1 h-3.5 w-3.5" />
                        {t.settings.mcp.toolsExpanded} ·{" "}
                        {tr("settings.mcp.summarize", { count: serverTools.length })}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div
                        className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2"
                        data-testid="mcp-tool-list"
                      >
                        {serverTools.length === 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {t.settings.mcp.noTools}
                          </p>
                        ) : (
                          serverTools.map((tool) => (
                            <div
                              key={tool.name}
                              className="flex items-center gap-3"
                              data-testid="mcp-tool-row"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-mono text-xs">
                                  {tool.toolName}
                                </p>
                                {tool.description ? (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {tool.description}
                                  </p>
                                ) : null}
                              </div>
                              <Label
                                htmlFor={`tool-${tool.name}`}
                                className="text-xs text-muted-foreground"
                              >
                                {t.settings.mcp.autoApprove}
                              </Label>
                              <Switch
                                id={`tool-${tool.name}`}
                                checked={tool.autoApprove}
                                onCheckedChange={(checked) =>
                                  void toggleTool(server, tool, checked)
                                }
                                data-testid="mcp-tool-auto-approve"
                              />
                            </div>
                          ))
                        )}
                        <p className="pt-1 text-xs text-muted-foreground">
                          {t.settings.mcp.autoApproveHint}
                        </p>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.settings.mcp.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("settings.mcp.deleteDescription", {
                name: pendingDelete?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && void remove(pendingDelete)}
              data-testid="confirm-delete-mcp-server"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ServerDialog({
  server,
  trigger,
  onSubmit,
}: {
  server?: MCPServerConfig;
  trigger: React.ReactNode;
  onSubmit: (draft: ServerDraft) => Promise<void>;
}) {
  const { t, tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ServerDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(
      server
        ? {
            id: server.id,
            name: server.name,
            transport: server.transport,
            command: server.command ?? "",
            args: (server.args ?? []).join(" "),
            // Values are masked server-side; showing the keys hints at what is
            // stored without ever round-tripping the secret.
            env: formatLines(server.env),
            url: server.url ?? "",
            headers: formatLines(server.headers),
            enabled: server.enabled,
          }
        : EMPTY_DRAFT,
    );
  }, [open, server]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) {
      toast.error(t.settings.mcp.nameRequired);
      return;
    }
    if (draft.transport === "stdio" && !draft.command.trim()) {
      toast.error(t.settings.mcp.commandRequired);
      return;
    }
    if (draft.transport !== "stdio" && !draft.url.trim()) {
      toast.error(t.settings.mcp.urlRequired);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ ...draft, name: draft.name.trim() });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {server ? t.settings.mcp.editServer : t.settings.mcp.add}
            </DialogTitle>
            <DialogDescription>{t.settings.mcp.description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="mcp-name">{t.settings.mcp.name}</Label>
              <Input
                id="mcp-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                placeholder={t.settings.mcp.namePlaceholder}
                data-testid="mcp-name-input"
              />
            </div>

            <div className="grid gap-2">
              <Label>{t.settings.mcp.transport}</Label>
              <Select
                value={draft.transport}
                onValueChange={(value) =>
                  setDraft({ ...draft, transport: value as MCPTransportType })
                }
              >
                <SelectTrigger data-testid="mcp-transport-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MCP_TRANSPORT_TYPES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {t.settings.mcp.transports[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {draft.transport === "stdio" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-command">{t.settings.mcp.command}</Label>
                  <Input
                    id="mcp-command"
                    value={draft.command}
                    onChange={(event) =>
                      setDraft({ ...draft, command: event.target.value })
                    }
                    placeholder={t.settings.mcp.commandPlaceholder}
                    data-testid="mcp-command-input"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-args">{t.settings.mcp.args}</Label>
                  <Input
                    id="mcp-args"
                    value={draft.args}
                    onChange={(event) =>
                      setDraft({ ...draft, args: event.target.value })
                    }
                    placeholder={t.settings.mcp.argsPlaceholder}
                    data-testid="mcp-args-input"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-env">{t.settings.mcp.env}</Label>
                  <Textarea
                    id="mcp-env"
                    value={draft.env}
                    onChange={(event) =>
                      setDraft({ ...draft, env: event.target.value })
                    }
                    rows={3}
                    className="font-mono text-xs"
                    data-testid="mcp-env-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.settings.mcp.envHint}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-url">{t.settings.mcp.url}</Label>
                  <Input
                    id="mcp-url"
                    value={draft.url}
                    onChange={(event) =>
                      setDraft({ ...draft, url: event.target.value })
                    }
                    placeholder={t.settings.mcp.urlPlaceholder}
                    data-testid="mcp-url-input"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="mcp-headers">{t.settings.mcp.headers}</Label>
                  <Textarea
                    id="mcp-headers"
                    value={draft.headers}
                    onChange={(event) =>
                      setDraft({ ...draft, headers: event.target.value })
                    }
                    rows={3}
                    className="font-mono text-xs"
                    data-testid="mcp-headers-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t.settings.mcp.headersHint}
                  </p>
                </div>
              </>
            )}

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>{t.settings.mcp.enabled}</Label>
                <p className="text-xs text-muted-foreground">
                  {t.settings.mcp.enabledHint}
                </p>
              </div>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, enabled: checked })
                }
                data-testid="mcp-enabled-switch"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving} data-testid="save-mcp-server">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddServerButton({
  onSubmit,
}: {
  onSubmit: (draft: ServerDraft) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <ServerDialog
      onSubmit={onSubmit}
      trigger={
        <Button data-testid="add-mcp-server">
          <Plus className="mr-2 h-4 w-4" />
          {t.settings.mcp.add}
        </Button>
      }
    />
  );
}

function ImportDialog({
  existing,
  onImported,
}: {
  existing: MCPServerConfig[];
  onImported: (servers: MCPServerConfig[]) => void;
}) {
  const { t, tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      const parsed = await importMCPServers(json);
      // Imported servers are appended; the id is assigned by the server when
      // the merged list is saved.
      const saved = await saveMCPServers([
        ...existing.map((server) => ({
          id: server.id,
          name: server.name,
          transport: server.transport,
          command: server.command,
          args: server.args,
          url: server.url,
          enabled: server.enabled,
        })),
        ...parsed.servers,
      ]);
      onImported(saved.servers);
      toast.success(
        tr("settings.mcp.importDone", { count: parsed.servers.length }),
      );
      setJson("");
      setOpen(false);
    } catch {
      toast.error(t.settings.mcp.importFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="import-mcp-servers">
          <ClipboardPaste className="mr-2 h-4 w-4" />
          {t.settings.mcp.import}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.settings.mcp.importTitle}</DialogTitle>
          <DialogDescription>{t.settings.mcp.importDescription}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-4">
          <Textarea
            value={json}
            onChange={(event) => setJson(event.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder={t.settings.mcp.importPlaceholder}
            data-testid="mcp-import-input"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving || !json.trim()}
            data-testid="submit-mcp-import"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t.settings.mcp.importSubmit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

