# Başına Gelseydi — otomatik sinematik Shorts/Reels üretim sistemi

> "Ya bu gerçekten benim başıma gelseydi?" — kodla üretilen premium 2D animasyon hikâyeleri.
> İlk seri: **Ya Böyle Olsaydı?** · Bölüm 1: **Yerçekimi 10 saniyeliğine yok olsaydı?**

Her video **1080×1920, 30 fps, 50–60 sn**, Türkçe anlatıcı + Türkçe altyazı. Bütün görseller React/SVG/CSS ile
programatik olarak çizilir (fotoğraf, stok görsel veya slayt yok).

## Tek komutla bölüm üretimi

```bash
npm run bg:episode -- yercekimi          # ses → timeline → müzik/SFX → render → FFmpeg master → kapak → QC
npm run bg:episode -- yercekimi --preview  # yarım çözünürlükte hızlı ön izleme
npm run bg:new -- buzul "Buzullar bir gecede erirse?"   # yeni bölüm iskeleti (Root.tsx'e otomatik eklenir)
npm run dev                               # Remotion Studio (Basina-Gelseydi klasörü)
```

Çıktılar `out/<bölüm>/` altında: `<bölüm>_final.mp4`, `<bölüm>.tr.srt`, `<bölüm>_kapak.jpg`, `contact_sheet.jpg`,
`qc.json` (çözünürlük, fps, ses, LUFS raporu), `yayin_paketi.md` (başlıklar, açıklamalar, SEO, hashtag).

## Üretim hattı

```
konu → araştırma + senaryo kuralları → 55–60 sn anlatım metni (story.json + publish.md)
     → ElevenLabs (Türkçe ses, eleven_v4) + kelime zaman damgaları (Scribe)   scripts/data/<bölüm>/
     → scripts/prepare.mjs   : tempo, EQ, -14 LUFS ses + sahne kesmeleri ve "hit"ler kelimelere kilitli
     → scripts/bg-score.mjs  : özgün müzik + SFX (hikâye hit'leri + physics.ts çarpışmaları)
     → Remotion              : sahneler, kamera, parallax, karakter animasyonu, altyazı, HUD (sessiz render)
     → scripts/bg-master.mjs : FFmpeg — sidechain ducking (müzik sesi asla bastırmaz), loudnorm -14 LUFS,
                               H.264 High/yuv420p/BT.709, +faststart, gömülü Türkçe altyazı izi (mov_text)
```

## Teknoloji paylaşımı

| Katman | Kullanım |
| --- | --- |
| **Remotion** | Ana kompozisyon, zaman çizelgesi, sahne geçişleri, altyazılar, render (`src/channels/basina-gelseydi/ChannelVideo.tsx`) |
| **Motion Canvas** | `@motion-canvas/core` 3.17.2 (yerel motion-canvas deposuyla aynı sürüm) zamanlama/ara-değer fonksiyonları: kamera hareketleri, karakter tepkileri, sayaç ve kart animasyonları (`src/engine/modern/motion.ts`) |
| **FFmpeg** | Ses temizleme/tempo, miks, ducking, loudness, video kodlama, altyazı muxing, QC (`scripts/prepare.mjs`, `scripts/bg-master.mjs`) |

## Kanal motoru (`src/engine/modern`, `src/channels/basina-gelseydi`)

| Dosya | İçerik |
| --- | --- |
| `Person.tsx` | Eklemli 2D karakter: omuz/dirsek, kalça/diz, gövde, kafa; 9 yüz ifadesi, göz kırpma, nefes, yürüme; `POSES` (float, flail, jump, reach, hang, fall, sit…), `wobblePose` (havada savrulma), `CAST` (kalıcı kahraman **Kaan** + yan karakterler) |
| `City.tsx` | Gökyüzü, güneş, bulut, İstanbul silueti, deniz, vapur, detaylı apartman (balkon, çamaşır, klima, dükkân tabelası), sokak, lamba, ağaç, araba/taksi/minibüs/otobüs, simit tezgâhı, ince belli çay bardağı, martı, kedi, 12 eşya |
| `Fx.tsx` | Hız çizgileri, şok dalgası, toz bulutu, sıvı küre (yüzey gerilimi), glitch, sinematik ışık, letterbox |
| `motion.ts` | Motion Canvas easing'leri + `tween`, `keys`, `kick` (sarsıntı) yardımcıları |
| `brand.ts` | Kimlik: Anton + Montserrat (Türkçe karakterli, çevrimdışı), renk paleti |
| `ChannelVideo.tsx` | Bölüm kompozisyonu: sahne geçişleri, kelime-kelime Türkçe altyazı, marka etiketi, ilerleme çubuğu |

Bölüm klasörü (`src/stories/<bölüm>/`): `story.json` (senaryo kuralları, sahneler, hit'ler), `physics.ts`
(senaryo fiziği — sahneler VE ses tasarımı aynı simülasyonu okur), `world.tsx`, `scenes.tsx`, `Cover.tsx`, `publish.md`.

### Bölüm 1 — sahneler

| # | Sahne | Çekimler |
| --- | --- | --- |
| 1 | hook (0–4 sn) | Havada asılı sokak (flash-forward) → yükselen kahramana dikey whip-pan |
| 2 | sabah | İstanbul panoraması + vapur + martılar → trafik ve simitçi → çay yakın planı |
| 3 | kapanış | Eczane saati 08:46→08:47 → glitch + şok dalgası, ayaklar yerden kesilir → geri çekilen kamera, her şey yükselir |
| 4 | zıpla | "TEKRAR" 08:47:00 zıplayış → pencereler akarken takip çekimi + altimetre → direğe uzanma, kaçırma |
| 5 | dünya | Dönen Dünya: düz giden sen vs kıvrılan yer → durakta 1 m yükselen kalabalık (ölçü çizgisi) → çayın havada küre olması |
| 6 | askıda | 20 m yükseklikten süper geniş plan → donmuş kaosta yavaş pan → 8… 9… balkona tutunma |
| 7 | dönüş | 1,00 g — aşağıdan bakış, her şey yanından düşer → sokakta fizik-senkron çarpışmalar + toz |
| 8 | sonuç | Sersemlemiş insanlar → tepeden düşen taksi → yıkılmış sokağa vinç çekimi |
| 9 | final | Balkonda asılı kahramanın yüzüne dolly-in → "YERÇEKİMİ 2 KATI?" sonraki bölüm kartı |

## Yeni bölüm iş akışı (Claude ile)

Claude'a "**Yeni bölüm: <konu>**" demeniz yeterli. Claude: konuyu araştırır, senaryo kurallarını ve 55–60 sn'lik
metni yazar, `npm run bg:new` ile iskeleti açar, ElevenLabs'ta sesi ve kelime zamanlarını üretir
(`scripts/data/<bölüm>/voice_raw.mp3`, `words_raw.json`), sahneleri motor bileşenleriyle kodlar,
`publish.md` yayın paketini doldurur ve `npm run bg:episode -- <bölüm>` ile son MP4'ü alıp kontrol eder.

## Kaynaklar ve lisanslar

- Ses: ElevenLabs eleven_v4, "Eray | Cinematic Turkish Voice"; zaman damgaları ElevenLabs Scribe.
- Müzik ve efektler: `scripts/bg-score.mjs` ile prosedürel üretim (tamamen özgün).
- Yazı tipleri: Anton, Montserrat (SIL Open Font License) — `public/fonts`.

---

# La Voz del Legado — motor de Shorts históricos

Videos históricos verticales (1080×1920, 30 FPS) creados **100 % con código** en Remotion.
No usa plantillas: cada fondo, personaje, partícula, luz y transición está escrito en React/SVG.

## Flujo de producción

```
guion → voz (ElevenLabs) → transcripción con marcas de tiempo por palabra
      → scripts/prepare.mjs   → timeline.json  (escenas y "hits" sincronizados con la voz)
      → scripts/score.mjs     → score.wav      (música + SFX originales sincronizados al timeline)
      → Remotion              → MP4
```

```bash
npm run pompeya:build    # voz procesada + timeline + banda sonora
npm run dev              # Remotion Studio (vista previa en vivo)
npm run pompeya:render   # → out/pompeya_ultimo_dia.mp4
```

## Estructura

| Ruta | Qué hace |
| --- | --- |
| `src/engine/Camera.tsx` | Cámara virtual 2.5D con keyframes relativos (0..1), zoom, rotación, temblor; `Layer` = plano de parallax por profundidad |
| `src/engine/Character.tsx` | Personaje paramétrico: expresiones (feliz, aterrado, decidido, asombro…), parpadeo, respiración, ciclo de caminar/correr, brazos articulados, objetos |
| `src/engine/Light.tsx` | Rayos de luz volumétricos, resplandores, viñeta, etalonaje, grano de película, destellos, relámpagos volcánicos |
| `src/engine/Particles.tsx` | Ceniza, brasas, chispas, piedra pómez, polvo, vapor, aves (deterministas) |
| `src/engine/SceneShell.tsx` | Transiciones propias centradas en el corte: `whip`, `flash`, `smoke`, `zoom`, `fade` |
| `src/engine/Captions.tsx` | Subtítulos automáticos palabra por palabra desde la transcripción, con palabras clave resaltadas |
| `src/engine/Kinetic.tsx` | Títulos dorados animados, cifras animadas, marca de agua del canal |
| `src/engine/StoryVideo.tsx` | Composición genérica: escenas en el timeline, mezcla voz + música con *ducking* automático |
| `src/stories/pompeya/` | Primera historia: `story.json` (guion/escenas), `art.tsx` (ilustraciones), `scenes.tsx` (8 escenas) |

## Crear una nueva historia

1. Copia `src/stories/pompeya/` y edita `story.json`: cada escena tiene un `anchor` (primeras palabras
   de su frase en la narración), una `transition`, una `intensity` musical y un acorde. Los `hits`
   enlazan una palabra hablada con un evento (explosión, derrumbe, campana…).
2. Genera la narración en español y su transcripción con marcas de tiempo por palabra; guarda
   `voice_raw.mp3` y `words_raw.json` y apunta a ellos en `story.json`.
3. `node scripts/prepare.mjs <historia>` y `node scripts/score.mjs <historia>`.
4. Escribe las escenas reutilizando el motor y registra la composición en `src/Root.tsx`.

La duración de cada escena la decide la voz: si cambias la narración, todo (cortes, música, SFX,
subtítulos) se vuelve a sincronizar solo.

## Créditos de recursos

- Voz: ElevenLabs (voz «Japa – Narrador Cinematográfico Profundo»), acelerada ×1.17 sin cambiar el tono.
- Música y efectos: generados proceduralmente por `scripts/score.mjs` (originales, sin licencias externas).
- Tipografías: Cinzel y Montserrat (SIL Open Font License), incluidas en `public/fonts`.
