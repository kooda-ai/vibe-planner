# Vibe Planner — AI Destekli Proje Planlayıcı

Bir proje fikrini AI ile sohbet ederek **phase'lere (aşamalara)** bölen, her phase'i görev
listesi + not + durum ile yöneten ve tek tıkla **vibe coder** (örn. Dyad) uygulamasına
kopyalayabildiğiniz tek kullanıcılı bir web uygulaması.

## Özellikler

- **Dashboard** — proje kartları, phase/task ilerlemesi ve "Yeni Proje" akışı.
- **AI Sohbeti** — akıcı (streaming) yanıtlar; AI'ın ürettiği gizli JSON bloğu otomatik
  olarak phase'lere dönüşür ve sağ panele düşer.
- **Phase Paneli** — sürükle-bırak sıralama, yeniden adlandırma, elle phase/task ekleme,
  notlar ve durum (bekliyor / devam ediyor / tamamlandı).
- **Tek tıkla kopyalama** — phase başına veya tümü tek metinde, `# proje / ## phase / içerik`
  şablonuyla panoya (Sonner toast ile doğrulanır).
- **Çoklu AI sağlayıcı** — OpenAI, Anthropic ve OpenAI-uyumlu özel `base URL`. API anahtarları
  yalnızca sunucuda saklanır, istemciye asla gönderilmez.
- **Ayarlar** — sağlayıcı ekle/çıkar, model seçimi, tema, dil (TR/EN) ve export/import.
- **Tema & dil** — `next-themes` ile açık/koyu/sistem, hafif TR/EN sözlüğü.

## Kurulum

```bash
pnpm install      # veya npm install
pnpm dev          # http://localhost:3000
```

Uygulama kutudan çıktığı gibi çalışır: veriler `.data/planner.json` dosyasına yazılır
(`PLANNER_DATA_FILE` ortam değişkeni ile yol değiştirilebilir).

### İlk kullanım

1. **Ayarlar → AI Sağlayıcıları → Sağlayıcı ekle**: tür (OpenAI / Anthropic /
   OpenAI-uyumlu), ad, API anahtarı ve modelleri girin (modelleri "Modelleri çek" ile
   otomatik alabilirsiniz).
2. Varsayılan sağlayıcı ve modeli seçin.
3. Panelden bir proje oluşturun, sohbette fikrinizi anlatın
   (örn. _"marketplace uygulaması için MVP planı çıkar"_).
4. Phase'leri düzenleyip **Kopyala** ile vibe coder'a yapıştırın.

## Prisma + SQLite (opsiyonel)

`prisma/schema.prisma` projenin veri modelini birebir yansıtır. Prisma'nın
`query engine` binary'sinin üretilebildiği ortamlarda dosya tabanlı depoyu Prisma'ya
geçirmek için tek yapılacak, `src/lib/db.ts` içindeki fonksiyon gövdelerini aynı
imzalarla Prisma çağrılarına çevirmektir (soyutlama tam olarak bunun için var):

```bash
echo 'DATABASE_URL="file:./dev.db"' >> .env
npx prisma generate
npx prisma migrate dev --name init
```

## API Rotaları

| Rota | Açıklama |
| --- | --- |
| `GET/POST /api/projects` | proje listesi / yeni proje |
| `GET/PATCH/DELETE /api/projects/[id]` | proje detayı / güncelle / sil |
| `GET/POST /api/projects/[id]/phases` | phase listesi / yeni phase |
| `POST /api/projects/[id]/phases/reorder` | sıralama |
| `PATCH/DELETE /api/phases/[id]` | phase güncelle / sil |
| `POST /api/phases/[id]/tasks` | yeni görev |
| `PATCH/DELETE /api/tasks/[id]` | görev güncelle / sil |
| `POST /api/projects/[id]/chat` | streaming AI yanıtı + plan uygulama (NDJSON) |
| `GET/PUT /api/settings` | sağlayıcı ve model ayarları (anahtarlar gizli) |
| `POST /api/models` | seçili sağlayıcı için model listesi |
| `GET /api/projects/[id]/export` | tek projeyi dışa aktar |
| `GET /api/export` | tüm verileri dışa aktar |
| `POST /api/projects/import` | proje / yedek içe aktar |
| `DELETE /api/data` | tüm projeleri sil |

## Mimari Notlar

- **AI soyutlaması** — `src/lib/ai/`: sağlayıcı adapter'ları (OpenAI, Anthropic) ortak bir
  `AIProvider` arayüzü uygular; SSE farkları adapter içinde normalize edilir.
- **Streaming + JSON** — sistem talimatı modelden önce serbest metin, en sonda tek bir
  ```` ```json ```` bloğu ister. Sunucu stream'i tamponlar, kapanış fence'ini görünce JSON'u
  ayıklar; gövde metni akıtılırken JSON kısmı gizlenir.
- **Güncelleme stratejisi** — AI mevcut bir phase'i `id` vererek günceller, `id` yoksa yeni
  phase eklenir. **Silme işlemi yapılmaz** (veri kaybını önlemek için; kullanıcı elle siler).
- **Geçersiz JSON** — parse başarısız olursa phase'ler değişmez ve kullanıcıya
  "AI geçerli bir plan üretemedi" uyarısı gösterilir.
- **Depolama soyutlaması** — tüm veri erişimi `src/lib/db.ts` içinde tek noktada toplanmıştır.
- **Bağlam penceresi** — prompt'a son 20 mesaj + phase özeti gönderilir.

## Testler

```bash
# Playwright e2e testleri (dev sunucusu açıkken)
npx playwright test
```

`e2e-tests/` altında dashboard proje oluşturma ve phase yönetimi (ekle, yeniden
adlandır, görev, durum, kopyalama, silme) akışları kapsanır.

## Teknoloji

Next.js 15 (App Router) · TypeScript · Tailwind CSS · Shadcn/UI · Prisma (referans şema) ·
`@dnd-kit` · `next-themes` · Sonner · Zod · Recharts.
