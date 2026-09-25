import type { ChatMessage } from "./types";
import type { Phase, Project } from "../types";

/** How many past chat messages are sent as context (simple context window). */
export const CONTEXT_MESSAGE_LIMIT = 20;

const JSON_SCHEMA_GUIDE = `\`\`\`json
{
  "phases": [
    {
      "id": "mevcut phase id'si ya da yeni phase için null",
      "title": "Phase başlığı",
      "description": "Bu phase'de ne yapılacağının kısa açıklaması",
      "notes": "Opsiyonel notlar",
      "status": "pending | in_progress | done",
      "tasks": [{ "content": "Yapılacak iş", "done": false }]
    }
  ]
}
\`\`\``;

export function buildSystemPrompt(
  project: Project,
  phases: Phase[],
  locale: "tr" | "en",
): string {
  const language = locale === "tr" ? "Turkish" : "English";
  const phaseContext = phases.length
    ? phases
        .map((phase) => {
          const tasks = phase.tasks
            .map((task) => `      - [${task.done ? "x" : " "}] ${task.content}`)
            .join("\n");
          return [
            `  - id: ${phase.id}`,
            `    title: ${phase.title}`,
            `    status: ${phase.status}`,
            phase.description ? `    description: ${phase.description}` : null,
            tasks ? `    tasks:\n${tasks}` : null,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n")
    : "  (henüz phase yok)";

  return `Sen bir kıdemli ürün ve yazılım planlama asistanısın. Kullanıcı, bir vibe coding aracına (örn. Dyad) adım adım yapıştıracağı bir proje planı hazırlıyor.

Şu an çalıştığın proje:
  Ad: ${project.name}
  Açıklama: ${project.description || "(yok)"}

Projenin mevcut phase'leri:
${phaseContext}

GÖREVİN
- Kullanıcının fikrini dinle, akıcı ve somut bir planlama yazısı yaz.
- Planı uygulanabilir phase'lere (aşamalara) böl. Her phase bağımsız olarak kopyalanıp bir vibe coder'a yapıştırılabilir olmalı.
- Yazı dili: ${language}.
- Yazıda markdown başlık kullanma; kısa paragraflar ve madde işaretleri kullan. Sohbetin okunması kolay olsun.

ÇIKTI FORMATI (çok önemli)
1. Önce serbest açıklama yaz (yorum, öneri, dikkat edilecekler).
2. Cevabın EN SONUNA, tam olarak bir tane \`\`\`json kod bloğu ekle. Başka kod bloğu kullanma, JSON'u açıklamayla karıştırma.
3. JSON şu şemaya uymalı:
${JSON_SCHEMA_GUIDE}

PHASE GÜNCELLEME KURALLARI
- Mevcut bir phase'i değiştiriyorsan o phase'in "id" değerini AYNEN kullan.
- Yeni phase ekliyorsan "id": null ver.
- Phase SİLME. Hiçbir phase'i yanıttan çıkararak silme; yalnızca ekle veya güncelle.
- "status" alanını yalnızca anlamlıysa ver; çoğu zaman "pending" doğrudur.
- Her phase'de 3-7 arası net, doğrulanabilir görev (task) olsun.
- Kullanıcı sadece sohbet ediyorsa (plan istemiyorsa) yine de en sona \`{"phases": []}\` bloğunu ekle.`;
}

export function buildChatMessages(options: {
  project: Project;
  phases: Phase[];
  history: ChatMessage[];
  prompt: string;
  locale: "tr" | "en";
}): ChatMessage[] {
  const { project, phases, history, prompt, locale } = options;
  return [
    { role: "system", content: buildSystemPrompt(project, phases, locale) },
    ...history.slice(-CONTEXT_MESSAGE_LIMIT),
    { role: "user", content: prompt },
  ];
}
