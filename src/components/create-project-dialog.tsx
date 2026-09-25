"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { createProject } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export function CreateProjectDialog({
  trigger,
  onCreated,
}: {
  trigger?: React.ReactNode;
  onCreated?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error(t.createProject.nameRequired);
      return;
    }
    setSaving(true);
    try {
      const { project } = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setOpen(false);
      setName("");
      setDescription("");
      onCreated?.();
      router.push(`/projects/${project.id}`);
    } catch {
      toast.error(t.createProject.failed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button data-testid="new-project-button">
            <Plus className="mr-2 h-4 w-4" />
            {t.dashboard.newProject}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t.createProject.title}</DialogTitle>
            <DialogDescription>{t.createProject.description}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">{t.createProject.name}</Label>
              <Input
                id="project-name"
                data-testid="project-name-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t.createProject.namePlaceholder}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-description">
                {t.createProject.projectDescription}
              </Label>
              <Textarea
                id="project-description"
                data-testid="project-description-input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t.createProject.projectDescriptionPlaceholder}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={saving} data-testid="create-project-submit">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t.createProject.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
