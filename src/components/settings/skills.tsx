"use client";

import { Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveSkills } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { slugify } from "@/lib/skills";
import type { SkillConfig } from "@/lib/types";

type SkillDraft = {
  id?: string;
  name: string;
  description: string;
  body: string;
  category: string;
  enabled: boolean;
};

const EMPTY_DRAFT: SkillDraft = {
  name: "",
  description: "",
  body: "",
  category: "",
  enabled: true,
};

export function SkillsCard({
  skills,
  onChange,
}: {
  skills: SkillConfig[];
  onChange: (skills: SkillConfig[]) => void;
}) {
  const { t, tr } = useI18n();
  const [pendingDelete, setPendingDelete] = useState<SkillConfig | null>(null);

  const active = skills.filter((skill) => skill.enabled);
  const inactive = skills.filter((skill) => !skill.enabled);

  async function persist(next: SkillDraft[] | SkillConfig[]) {
    try {
      const saved = await saveSkills(next);
      onChange(saved.skills);
      toast.success(t.settings.skillsCard.saved);
    } catch {
      toast.error(t.settings.skillsCard.saveFailed);
    }
  }

  async function upsert(draft: SkillDraft) {
    const index = draft.id
      ? skills.findIndex((skill) => skill.id === draft.id)
      : -1;
    const next = [...skills];
    if (index >= 0) {
      next[index] = {
        ...skills[index],
        name: draft.name,
        description: draft.description,
        body: draft.body,
        category: draft.category || undefined,
        enabled: draft.enabled,
      };
    } else {
      // New skills get their id and slug from the server on save.
      next.push({
        id: "",
        slug: "",
        name: draft.name,
        description: draft.description,
        body: draft.body,
        category: draft.category || undefined,
        enabled: draft.enabled,
      });
    }
    await persist(next);
  }

  async function remove(skill: SkillConfig) {
    await persist(skills.filter((item) => item.id !== skill.id));
    setPendingDelete(null);
  }

  async function toggle(skill: SkillConfig, enabled: boolean) {
    await persist(
      skills.map((item) => (item.id === skill.id ? { ...item, enabled } : item)),
    );
  }

  function renderRow(skill: SkillConfig) {
    return (
      <div
        key={skill.id}
        className="flex items-center gap-3 rounded-lg border p-3"
        data-testid="skill-row"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium" data-testid="skill-name">
              {skill.name}
            </p>
            <Badge variant="outline" className="font-mono text-[10px]">
              /{skill.slug}
            </Badge>
            {skill.category ? (
              <Badge variant="secondary" className="text-[10px]">
                {skill.category}
              </Badge>
            ) : null}
          </div>
          {skill.description ? (
            <p className="truncate text-xs text-muted-foreground">
              {skill.description}
            </p>
          ) : null}
        </div>
        <Switch
          checked={skill.enabled}
          onCheckedChange={(checked) => void toggle(skill, checked)}
          aria-label={t.settings.skillsCard.enabled}
          data-testid="skill-enabled"
        />
        <SkillDialog
          skill={skill}
          onSubmit={upsert}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.settings.skillsCard.editSkill}
              data-testid="edit-skill"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          }
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.settings.skillsCard.deleteSkill}
          onClick={() => setPendingDelete(skill)}
          data-testid="delete-skill"
        >
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{t.settings.skillsCard.title}</CardTitle>
          <CardDescription>{t.settings.skillsCard.description}</CardDescription>
        </div>
        <AddSkillButton onSubmit={upsert} />
      </CardHeader>
      <CardContent className="space-y-3">
        {skills.length === 0 ? (
          <p
            className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"
            data-testid="skills-empty"
          >
            {t.settings.skillsCard.empty}
          </p>
        ) : (
          <>
            {active.length ? (
              <div className="space-y-3" data-testid="skills-active-group">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t.settings.skillsCard.activeGroup}
                </p>
                {active.map(renderRow)}
              </div>
            ) : null}
            {inactive.length ? (
              <div className="space-y-3" data-testid="skills-inactive-group">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t.settings.skillsCard.inactiveGroup}
                </p>
                {inactive.map(renderRow)}
              </div>
            ) : null}
          </>
        )}
      </CardContent>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.settings.skillsCard.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {tr("settings.skillsCard.deleteDescription", {
                name: pendingDelete?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && void remove(pendingDelete)}
              data-testid="confirm-delete-skill"
            >
              {t.common.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SkillDialog({
  skill,
  trigger,
  onSubmit,
}: {
  skill?: SkillConfig;
  trigger: React.ReactNode;
  onSubmit: (draft: SkillDraft) => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SkillDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(
      skill
        ? {
            id: skill.id,
            name: skill.name,
            description: skill.description,
            body: skill.body,
            category: skill.category ?? "",
            enabled: skill.enabled,
          }
        : EMPTY_DRAFT,
    );
  }, [open, skill]);

  // The slug is derived server-side; the preview mirrors the same rule.
  const slug = skill?.slug ?? slugify(draft.name || "");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) {
      toast.error(t.settings.skillsCard.nameRequired);
      return;
    }
    if (!draft.body.trim()) {
      toast.error(t.settings.skillsCard.bodyRequired);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        body: draft.body.trim(),
        category: draft.category.trim(),
      });
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
              {skill
                ? t.settings.skillsCard.editSkill
                : t.settings.skillsCard.add}
            </DialogTitle>
            <DialogDescription>
              {t.settings.skillsCard.description}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="skill-name">{t.settings.skillsCard.name}</Label>
              <Input
                id="skill-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                placeholder={t.settings.skillsCard.namePlaceholder}
                data-testid="skill-name-input"
              />
              <p className="text-xs text-muted-foreground">
                {t.settings.skillsCard.slug}:{" "}
                <span className="font-mono" data-testid="skill-slug-preview">
                  /{slug}
                </span>
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="skill-description">
                {t.settings.skillsCard.descriptionLabel}
              </Label>
              <Input
                id="skill-description"
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                placeholder={t.settings.skillsCard.descriptionPlaceholder}
                data-testid="skill-description-input"
              />
              <p className="text-xs text-muted-foreground">
                {t.settings.skillsCard.descriptionHint}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="skill-body">{t.settings.skillsCard.body}</Label>
              <Textarea
                id="skill-body"
                value={draft.body}
                onChange={(event) =>
                  setDraft({ ...draft, body: event.target.value })
                }
                rows={8}
                placeholder={t.settings.skillsCard.bodyPlaceholder}
                data-testid="skill-body-input"
              />
              <p className="text-xs text-muted-foreground">
                {t.settings.skillsCard.bodyHint}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="skill-category">
                {t.settings.skillsCard.category}
              </Label>
              <Input
                id="skill-category"
                value={draft.category}
                onChange={(event) =>
                  setDraft({ ...draft, category: event.target.value })
                }
                placeholder={t.settings.skillsCard.categoryPlaceholder}
                data-testid="skill-category-input"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>{t.settings.skillsCard.enabled}</Label>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, enabled: checked })
                }
                data-testid="skill-enabled-switch"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving} data-testid="save-skill">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddSkillButton({
  onSubmit,
}: {
  onSubmit: (draft: SkillDraft) => Promise<void>;
}) {
  const { t } = useI18n();
  return (
    <SkillDialog
      onSubmit={onSubmit}
      trigger={
        <Button data-testid="add-skill">
          <Plus className="mr-2 h-4 w-4" />
          {t.settings.skillsCard.add}
        </Button>
      }
    />
  );
}

export type { SkillDraft };
