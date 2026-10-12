# cache-meter

Claude-Code-Mod: Prompt-Cache und Token-Nutzung auf einen Blick.

```text
● cache 42m ■■■■■■■■■■■■■■□□□□□□ 93% hit · ☀ Kontext 9% (Auto-Compact 97%) [ Compact ]
```

> **Quelle der Wahrheit** für jede Aussage über die Mods-API hier und im Code ist die offizielle Doku
> (<https://code.claude.com/docs/en/plugins/mods/overview> und Unterseiten) und die Typdeklaration der
> laufenden Version in `.claude-plugin/types/claude-code/index.d.ts` – nicht Erinnerung. Siehe `CLAUDE.md`.

## Was er zeigt

**Band über dem Prompt** (eine Zeile; was andere Mods im Band zeichnen, bleibt darunter erhalten – *interface › Pick where to draw › Band*)

| Teil | Bedeutung | Quelle |
|---|---|---|
| `● cache 42m` | Restlaufzeit des Prompt-Caches im Hauptgespräch. Grün = warm, gelb = weniger als 17 % TTL übrig, rot `abgelaufen` / `leer` | Beginn der letzten Hauptanfrage (`turn.step`) + TTL. Die Lebensdauer zählt ab Beginn der Anfrage, jeder Treffer setzt sie zurück (*prompt-caching › Cache lifetime*) |
| `■■■□□` | dieselbe Restzeit als Balken (bis 20 Zellen; fällt bei schmalem Terminal weg, bevor die Zeile umbricht) | |
| `93% hit` | Trefferquote der letzten Hauptanfrage: gelesen ÷ (neu + gelesen + geschrieben) | `turn.step` → `usage` (je Anfrage) |
| `☀ Kontext 9%` | Kontextfüllung gegen das Modellfenster; Symbol nach Abstand zum Auto-Compact-Punkt (☀ ☁ ☂ ☇ ↯) | `session.measure` |
| `(Auto-Compact 97%)` | wo Auto-Compact auslöst, auf derselben Skala; `aus`, wenn abgeschaltet; fehlt, solange unbekannt | `$.session.usage({ breakdown: 'summary' })` – lokal geschätzt, kein API-Aufruf; einmal je Fenstergröße berechnet |
| `↻` | `/keepwarm` läuft | |
| `Neuschreiben ≈ …` | bei kaltem Cache: was die nächste Anfrage neu in den Cache schreibt. In Dollar nur, wenn Claude Code selbst geschätzt hat (Resume, Modellwechsel), sonst in Tokens | `classic.SessionStart`, `classic.PostModelSwitch` |
| `[ Compact ]` | `/compact` per Knopf; ausgeblendet, solange ein Turn läuft | `$.session.compact()` |

**Pane `/tokens`**: jede Anfrage des Hauptgesprächs als gestapelter Balken (aus Cache gelesen / in Cache geschrieben / neu), Summen Hauptgespräch und Subagenten, Kosten wie `/cost`, Rate-Limits (5 Stunden, 7 Tage) mit Reset-Zeit, Kontext-Verlauf als Sparkline, Keepwarm-Bilanz, TTL mit ihrer Quelle.

**`/keepwarm [30m … 8h | aus]`** (ohne Angabe 2h): Sobald weniger als 17 % der TTL übrig sind (bei 60m ≈ 10 min), schickt der Mod eine Mini-Anfrage über das Gespräch (`$.model.fork`, Antwort „warm“).

- **Kosten:** jeder Ping liest den ganzen Kontext zum Cache-Lesepreis des Modells (Preise: <https://platform.claude.com/docs/en/about-claude/pricing>) und zählt aufs Abo-Kontingent.
- **Bremsen:** höchstens 12 Pings je Lauf; startet nicht und stoppt bei 5m-TTL (dort wäre es ein Ping alle paar Minuten); stoppt, wenn ein Ping weniger als die Hälfte des Kontexts aus dem Cache gelesen hat (dann stimmt die TTL-Annahme nicht und jeder Ping wäre ein voller Neuaufbau), bei abgelaufenem/leerem Cache, bei Fehlern und am Ende des Fensters. Läuft nur in interaktiven Sessions (kein Timer unter `claude -p`). Verwirft nie eine Nachricht.
- **Nicht offiziell dokumentiert, aber beobachtet:** ob ein Fork-Treffer den 1h-Eintrag des Hauptgesprächs um eine Stunde verlängert. Forks bekommen laut Doku selbst das 5m-TTL (*prompt-caching › Which TTL each request gets*), und jeder Treffer setzt die Lebensdauer zurück; der gemischte Fall steht nirgends. Beobachtet hat es `karanb192/cache-tax` mit demselben Mechanismus (`$.model.fork`): ein Lauf, Fable 5.1, Abo, 2026-09-19 – Ping in Minute 50 las 157k aus dem Cache, Claude Codes eigener Countdown sprang auf 58 min, die Nachricht in Minute 62 las 156.886 Tokens aus dem Cache (README von cache-tax, Abschnitt „Limits“). Ein Lauf, eine Konfiguration – kein Beleg für jeden Fall. **Gegenprobe:** nach einem Ping 6–50 min warten, dann `/usage` → Zeile „Prompt cache (main)“ muss `warm` zeigen bzw. die nächste Antwort eine hohe Trefferquote im Band.

## Die TTL wird hergeleitet, nicht gemessen

Keine Mod-Schnittstelle meldet die TTL je Anfrage. Reihenfolge (nach *prompt-caching › Choose the TTL yourself*):

1. Option `cacheTtl` dieses Mods = `60m` oder `5m`.
2. `FORCE_PROMPT_CACHING_5M=1` → 5m.
3. `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m`/`1h`).
4. Einstellung `promptCacheTtl` (`5m`/`1h`).
5. `ENABLE_PROMPT_CACHING_1H=1` → 1h.
6. Ein Abo-Fenster steht bei ≥ 100 % (Nutzungsguthaben) → 5m.
7. Was Claude Code beim letzten Modellwechsel gemeldet hat (`classic.PostModelSwitch` → `cache_ttl`).
8. Sonst 60m (Abo innerhalb des Kontingents).

Mit API-Key oder Cloud-Provider ist der Standard 5m: dann `cacheTtl` auf `5m` stellen. Umgebungsvariablen und Einstellung werden beim Start und nach `/clear`, `/resume`, `/branch` gelesen. Die Quelle steht im Pane hinter der TTL.

Option setzen: `/config` → Zeile `cache-meter.cacheTtl`, oder in `~/.claude/settings.json` unter `pluginConfigs` → `"cache-meter@inline"` (bei Laden über `--plugin-dir`/`CLAUDE_CODE_PLUGIN_DIRS`) → `options` → `cacheTtl`.

Beim Fortsetzen (`--resume`) übernimmt der Mod aus `classic.SessionStart` die Sekunden seit der letzten Antwort; der Countdown läuft also richtig weiter. Ein echter Modellwechsel (`classic.PostModelSwitch`, nicht beim Resume) zeigt den Cache als kalt, mit Claude Codes eigener Kostenschätzung.

## Laden

Kein Marketplace. Geladen über `CLAUDE_CODE_PLUGIN_DIRS` im `env`-Block von `~/.claude/settings.json` (Pfade mit `:` getrennt), wirkt ab der nächsten Session. Einmalig zum Ausprobieren: `claude --plugin-dir ~/Dateien/ai-webdev/cache-meter`.

Abschalten: Pfad aus `CLAUDE_CODE_PLUGIN_DIRS` nehmen, oder für eine Session `claude --safe-mode`.

Bestand aller Mods auf diesem Mac: `~/Documents/WICHTIGE_BACKUPS/claude-code-infos/claude-code-mods-infos.md`.

## Entwickeln

```bash
claude plugin validate .     # Manifest, Hooks, State-Vertrag
claude plugin test .         # tests/*.test.tsx gegen die Engine (Stubs nach docs › mods › test)
tsc -p .                     # Typen liegen nach dem ersten Laden in .claude-plugin/types/ (gitignored)
# Rauchtest ohne Oberfläche: jeder Hook muss "settled" melden
D=$(mktemp -d); claude -p "Antworte nur: ok" --plugin-dir . --debug-file "$D/debug.log"; grep cache-meter "$D/debug.log"; rm -f "$D/debug.log" "$D/latest"; rmdir "$D"
```

Tests decken ab: TTL-Reihenfolge, Hauptanfrage vs. Subagent, Countdown ab Anfragebeginn, Resume, `/clear`, Modellwechsel, Compact (Hook, precompute, Knopf), schmales Band, Komposition mit anderen Mods, `/keepwarm` (Treffer, Fehltreffer, 5m-TTL, ohne Bildschirm), Pane mit Limits auf Terminal und Desktop.

## Herkunft

Idee nach Florians Screenshot-Vorlage; Wettersymbole und Sparkline nach Anthropics Beispiel-Mod `token-weather`; Resume-Felder und „Neuschreiben kostet“ nach `karanb192/cache-tax` (nicht installiert: dessen Guard verwirft auf 2.1.296 Agent-Benachrichtigungen, Issue #17). Review gegen die offizielle Doku 2026-10-12: Befunde und Belege in der Commit-Nachricht des Review-Commits.
