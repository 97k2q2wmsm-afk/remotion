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
