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
- **Çoklu AI sağlayıcı** — OpenAI, Anthropic, OpenAI-uyumlu özel `base URL` ve **ChatGPT
  (Codex) ile giriş**. API anahtarları ve OAuth token'ları yalnızca sunucuda saklanır,
  istemciye asla gönderilmez.
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

## ChatGPT (Codex) ile giriş — deneysel

Mevcut `OpenAI` / `Anthropic` / `OpenAI uyumlu` türlerinin yanında, API anahtarı yerine
**kendi ChatGPT Plus/Pro hesabınızla** giriş yapan bir sağlayıcı türü vardır:
`OpenAI (ChatGPT ile giriş)`.

> ⚠️ **Bu resmî bir geliştirici girişi değildir.** Codex CLI için tanımlı sabit bir OAuth
> istemcisi (`app_EMoamEEZ73f0CkXaXp7hrann`) kullanır. OpenAI bu akışı tolere ediyor ama
> değiştirme veya engelleme hakkını saklı tutar; kullanım koşulları açısından gri alandır.
> Bu yüzden özellik arayüzde **“deneysel”** olarak etiketlenmiştir. Akış bozulursa
> düzeltilecek yer `src/lib/ai/codex*.ts` dosyalarıdır.

**Akış**

1. Ayarlar → Sağlayıcı ekle → tür olarak `OpenAI (ChatGPT ile giriş)` seçin.
2. **ChatGPT ile bağlan** butonuna basın; tarayıcıda OpenAI'ın yetkilendirme sayfası açılır.
3. ChatGPT Plus/Pro hesabınızla onaylayın. Sayfa ~2 sn'de bir sunucuyu yoklar; onay
   gelince sağlayıcı otomatik kaydedilir ve kartta **Bağlı** + hesap e-postası görünür.
4. **Bağlantıyı kes** token'ları (ve dolayısıyla sağlayıcıyı) siler.

**Nasıl çalışır**

- `redirect_uri` = `http://localhost:1455/auth/callback` sabittir; Next.js süreci bu portta
  **geçici bir HTTP listener** açar (`src/lib/ai/codex-auth-server.ts`). Port doluysa
  açıklayıcı bir hata döner.
- Token'lar **yalnızca sunucuda** (`.data/planner.json`) saklanır; istemciye yalnızca
  `connected` bilgisi ve e-posta döner.
- Sohbet istekleri **Responses API**'ye (`https://chatgpt.com/backend-api/codex/responses`)
  gider ve farklı SSE olayları (`response.output_text.delta`, `response.completed`)
  kullanır; bu fark `src/lib/ai/codex.ts` içinde normalize edilir. Token süresi dolduğunda
  `src/lib/ai/codex-token.ts` sessizce yeniler.
- Codex backend'i model listelemez; sabit bir varsayılan liste sunulur (elle düzenlenebilir).
- Uygulamada oturum kavramı yoktur: **sunucu genelinde tek bir ChatGPT hesabı** bağlanır,
  tüm tarayıcılar aynı hesabı kullanır.

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
| `POST /api/oauth/codex/start` | ChatGPT girişini başlat (`authUrl` + `state`) |
| `GET /api/oauth/codex/status?state=` | giriş durumu (`pending` / `connected` / `error`) |
| `GET /api/projects/[id]/export` | tek projeyi dışa aktar |
| `GET /api/export` | tüm verileri dışa aktar |
| `POST /api/projects/import` | proje / yedek içe aktar |
| `DELETE /api/data` | tüm projeleri sil |

## Mimari Notlar

- **AI soyutlaması** — `src/lib/ai/`: sağlayıcı adapter'ları (OpenAI, Anthropic, Codex)
  ortak bir `AIProvider` arayüzü uygular; SSE farkları adapter içinde normalize edilir.
- **Codex izolasyonu** — resmî olmayan OAuth akışı `codex-oauth.ts`, `codex-auth-server.ts`,
  `codex-token.ts` ve `codex.ts` dosyalarına hapsedilmiştir; akış değişirse tek dosyada
  düzeltilir.
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
