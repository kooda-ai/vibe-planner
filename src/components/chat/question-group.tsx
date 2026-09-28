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
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const freeText = locale === "tr" ? "Kendim yazayım / Diğer" : "Write my own / Other";
  const recommended = locale === "tr" ? "Önerilen" : "Recommended";
  const nextLabel = locale === "tr" ? "Sonraki" : "Next";
  const submitLabel = locale === "tr" ? "Yanıtı gönder" : "Send answer";
  const question = group.questions[index];
  if (!question) return null;
  const answer = group.questions.map((item) => `${item.prompt}: ${[...(answers[item.id] ?? []), other[item.id]].filter(Boolean).join(", ") || "(no selection)"}`).join("\n");
  const advance = () => {
    if (index < group.questions.length - 1) {
      setIndex((current) => current + 1);
      return;
    }
    onSubmit(answer);
  };
  return <Card className="border-primary/20"><CardContent className="space-y-4 p-4">
    <p className="text-xs text-muted-foreground">{index + 1} / {group.questions.length}</p>
    <fieldset className="space-y-2" key={question.id}>
      <legend className="mb-2 text-sm font-medium">{question.prompt}</legend>
      {question.options.map((option) => {
        const selected = (answers[question.id] ?? []).includes(option.label);
        return <button key={option.label} type="button" aria-pressed={selected} className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${selected ? "border-primary bg-primary/5" : ""}`} onClick={() => setAnswers((current) => ({ ...current, [question.id]: question.multiple ? selected ? (current[question.id] ?? []).filter((value) => value !== option.label) : [...(current[question.id] ?? []), option.label] : [option.label] }))}>
          <span>{option.label}</span>{option.recommended ? <span className="text-xs text-primary">{recommended}</span> : null}
        </button>;
      })}
      {question.allowFreeText ? <div className="space-y-2"><label className="text-xs text-muted-foreground" htmlFor={`question-other-${question.id}`}>{freeText}</label><textarea id={`question-other-${question.id}`} className="w-full rounded-md border bg-background p-2 text-sm" value={other[question.id] ?? ""} onChange={(event) => setOther((current) => ({ ...current, [question.id]: event.target.value }))} /></div> : null}
    </fieldset>
    <Button type="button" size="sm" onClick={advance}>{index < group.questions.length - 1 ? nextLabel : submitLabel}</Button>
  </CardContent></Card>;
}
