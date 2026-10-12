# cache-meter

Claude-Code-Mod: Prompt-Cache und Token-Nutzung auf einen Blick.

```text
● cache 42m ■■■■■■■■■■■■■■□□□□□□ 93% hit · ☀ Kontext 9% (Auto-Compact 97%) [ Compact ]
```

## Was er zeigt

**Band über dem Prompt**

| Teil | Bedeutung | Quelle |
|---|---|---|
| `● cache 42m` | Restlaufzeit des Prompt-Caches im Hauptthread. Grün = warm, gelb = weniger als 17 % TTL übrig, rot `abgelaufen` / `leer` | Zeit der letzten Antwort (`turn.step`) + TTL |
| `■■■□□` | dieselbe Restzeit als Balken (bis 20 Zellen, schrumpft mit der Breite) | |
| `93% hit` | Trefferquote der letzten Anfrage: gelesen ÷ (neu + gelesen + geschrieben) | `turn.step` → `usage` |
| `☀ Kontext 9%` | Kontextfüllung gegen das Modellfenster; Symbol nach Abstand zum Auto-Compact-Punkt (☀ ☁ ☂ ☇ ↯) | `session.measure` |
| `(Auto-Compact 97%)` | wo Auto-Compact auslöst, auf derselben Skala | `$.session.usage({ breakdown: 'summary' })`, lokal geschätzt, kein API-Aufruf |
| `↻` | `/keepwarm` läuft | |
| `Neuschreiben ≈ …` | bei abgelaufenem Cache: was die nächste Anfrage neu in den Cache schreibt (Dollar nur, wenn Claude Code es selbst geschätzt hat: Resume, Modellwechsel) | |
| `[ Compact ]` | `/compact` per Knopf (geht nicht, während ein Turn läuft → Toast) | `$.session.compact()` |

**Pane `/tokens`**: jede Anfrage des Hauptthreads als gestapelter Balken (aus Cache gelesen / in Cache geschrieben / neu), Summen Hauptthread und Subagenten, Kosten wie `/cost`, Rate-Limits (5 Stunden, 7 Tage) mit Reset-Zeit, Kontext-Verlauf als Sparkline, Keepwarm-Bilanz.

**`/keepwarm [30m … 8h | aus]`** (ohne Angabe 2h): Sobald weniger als 17 % der TTL übrig sind (bei 60m ≈ 10 min), schickt der Mod eine Mini-Anfrage über das Gespräch (`$.model.fork`, Antwort „warm“). Der Cache-Lesevorgang frischt die TTL auf. **Kosten:** jeder Ping liest den ganzen Kontext aus dem Cache (≈ 10 % des Eingabepreises) und zählt aufs Abo-Kontingent. Schaltet sich nach dem Fenster, bei abgelaufenem/leerem Cache oder bei einem Fehler selbst ab. Verwirft nie eine Nachricht.

## Die TTL ist eine Annahme

Die API meldet die Cache-TTL nicht je Anfrage. Reihenfolge:

1. Einstellung `cacheTtl` = `60m` oder `5m` → fest.
2. Claude Code meldet sie beim Modellwechsel (`classic.PostModelSwitch` → `cache_ttl`) → „gemeldet“.
3. Sonst „angenommen“: 60m (Abo), 5m sobald ein Abo-Fenster ≥ 100 % steht (Overage).

Bei API-Key-Nutzung ohne Abo `cacheTtl` auf `5m` stellen. Einstellen: `/config` → Zeile `cache-meter.cacheTtl`, oder in `~/.claude/settings.json` unter `pluginConfigs`.

Beim Fortsetzen (`--resume`) übernimmt der Mod aus `classic.SessionStart` die Sekunden seit der letzten Antwort, der Countdown läuft also richtig weiter.

## Laden

Kein Marketplace. Geladen über `CLAUDE_CODE_PLUGIN_DIRS` im `env`-Block von `~/.claude/settings.json` (Pfade mit `:` getrennt), wirkt ab der nächsten Session. Einmalig zum Ausprobieren: `claude --plugin-dir ~/Dateien/ai-webdev/cache-meter`.

Abschalten: Pfad aus `CLAUDE_CODE_PLUGIN_DIRS` nehmen, oder für eine Session `claude --safe-mode`.

## Entwickeln

```bash
claude plugin validate .     # Manifest, Hooks, State-Vertrag
claude plugin test .         # tests/*.test.tsx gegen die Engine
```

Typ-Check: nach dem ersten Laden legt Claude Code `.claude-plugin/types/` an (gitignored), dann `tsc -p .` mit einer `tsconfig.json`, die `.claude-plugin/types/tsconfig.json` erweitert.

Konkurrenz ums Band: Pro Session gibt es ein `AbovePrompt`-Band. Zeichnet ein anderer Mod dort auch (z. B. `flo-guard`s Lagebild), konkurrieren beide darum – nach dem Installieren eines weiteren Band-Mods nachsehen, was angezeigt wird.

## Herkunft

Idee nach Florians Screenshot-Vorlage; Wettersymbole und Sparkline nach Anthropics Beispiel-Mod `token-weather`; Resume-Felder und „Neuschreiben kostet“ nach `karanb192/cache-tax` (nicht installiert: dessen Guard verwirft auf 2.1.296 Agent-Benachrichtigungen, Issue #17).
