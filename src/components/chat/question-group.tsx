"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export interface QuestionGroupData {
  questions: Array<{ id: string; prompt: string; multiple: boolean; allowFreeText: boolean; options: Array<{ label: string; recommended?: boolean }> }>;
}

export function QuestionGroup({ group, onSubmit }: { group: QuestionGroupData; onSubmit: (answer: string) => void }) {
  const { locale } = useI18n();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const freeText = locale === "tr" ? "Kendim yazayım / Diğer" : "Write my own / Other";
  const recommended = locale === "tr" ? "Önerilen" : "Recommended";
  const submit = locale === "tr" ? "Yanıtları gönder" : "Send answers";
  return <Card className="border-primary/20"><CardContent className="space-y-4 p-4">
    {group.questions.map((question) => <fieldset key={question.id} className="space-y-2">
      <legend className="text-sm font-medium">{question.prompt}</legend>
      {question.options.map((option) => {
        const selected = (answers[question.id] ?? []).includes(option.label);
        return <button key={option.label} type="button" aria-pressed={selected} className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${selected ? "border-primary bg-primary/5" : ""}`} onClick={() => setAnswers((current) => ({ ...current, [question.id]: question.multiple ? selected ? current[question.id].filter((value) => value !== option.label) : [...(current[question.id] ?? []), option.label] : [option.label] }))}>
          <span>{option.label}</span>{option.recommended ? <span className="text-xs text-primary">{recommended}</span> : null}
        </button>;
      })}
      {question.allowFreeText ? <div className="space-y-2"><label className="text-xs text-muted-foreground">{freeText}</label><textarea className="w-full rounded-md border bg-background p-2 text-sm" value={other[question.id] ?? ""} onChange={(event) => setOther((current) => ({ ...current, [question.id]: event.target.value }))} /></div> : null}
    </fieldset>)}
    <Button type="button" size="sm" onClick={() => onSubmit(group.questions.map((q) => `${q.prompt}: ${[...(answers[q.id] ?? []), other[q.id]].filter(Boolean).join(", ") || "(no selection)"}`).join("\n"))}>{submit}</Button>
  </CardContent></Card>;
}
