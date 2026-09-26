"use client";

import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { saveProjectSkills } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { SkillConfig } from "@/lib/types";

/**
 * Per-project skill selection.
 *
 * An empty selection is meaningful: it means "no project override", so every
 * globally enabled skill applies (shown as "All enabled skills").
 */
export function SkillPicker({
  projectId,
  skills,
  selected,
  onChange,
}: {
  projectId: string;
  skills: SkillConfig[];
  selected: string[] | null;
  onChange: (ids: string[] | null) => void;
}) {
  const { t, tr } = useI18n();
  const enabled = skills.filter((skill) => skill.enabled);
  const checked = new Set(selected ?? []);

  async function toggle(skillId: string, next: boolean) {
    const ids = new Set(selected ?? []);
    if (next) ids.add(skillId);
    else ids.delete(skillId);
    const list = [...ids];
    // Optimistic: the chat uses this state right away; a failed save reverts.
    onChange(list.length ? list : null);
    try {
      const result = await saveProjectSkills(projectId, list);
      onChange(result.skillIds);
    } catch {
      onChange(selected);
      toast.error(t.settings.skillsCard.saveFailed);
    }
  }

  const label =
    selected && selected.length
      ? tr("chat.skills.selected", { count: selected.length })
      : t.chat.skills.all;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs"
          data-testid="skill-picker"
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          {t.chat.skills.label}
          <span className="ml-1.5 text-muted-foreground">·</span>
          <span className="ml-1.5 text-muted-foreground" data-testid="skill-picker-summary">
            {enabled.length ? label : t.chat.skills.none}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <p className="text-sm font-medium">{t.chat.skills.label}</p>
          <p className="text-xs text-muted-foreground">{t.chat.skills.hint}</p>
        </div>
        {enabled.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            {t.chat.skills.none}
          </p>
        ) : (
          <div className="space-y-2" data-testid="skill-picker-list">
            {enabled.map((skill) => (
              <div key={skill.id} className="flex items-start gap-2">
                <Checkbox
                  id={`project-skill-${skill.id}`}
                  checked={checked.has(skill.id)}
                  onCheckedChange={(value) => void toggle(skill.id, value === true)}
                  data-testid="skill-picker-item"
                />
                <div className="min-w-0">
                  <Label
                    htmlFor={`project-skill-${skill.id}`}
                    className="text-sm font-normal"
                  >
                    {skill.name}
                  </Label>
                  <p className="truncate text-xs text-muted-foreground">
                    /{skill.slug}
                    {skill.description ? ` · ${skill.description}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
