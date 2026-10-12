# cache-meter

Claude-Code-Mod: Prompt-Cache und Token-Nutzung auf einen Blick – Countdown bis der Cache abläuft, Trefferquote, Kontext, Verlauf je Anfrage, Limits, und auf Wunsch Warmhalten.

```text
● cache 42m ■■■■■■■■■■■■■■□□□□□□ 93% hit · ☀ Kontext 9% (Auto-Compact 97%) [ Compact ]
```

> **Quelle der Wahrheit** für jede Aussage über die Mods-API hier und im Code ist die offizielle Doku
> (<https://code.claude.com/docs/en/plugins/mods/overview> und ihre Unterseiten, für Cache-Verhalten
> <https://code.claude.com/docs/en/prompt-caching>) und die Typdeklaration der laufenden Version in
> `.claude-plugin/types/claude-code/index.d.ts` – nicht Erinnerung oder Trainingswissen. Siehe `CLAUDE.md`.
> Verweise wie *interface › Pick where to draw* meinen Seite › Abschnitt dieser Doku.

**Stand:** Version 0.2.0, getestet mit Claude Code 2.1.296.

## Bedienung

| Was | Wie |
|---|---|
| Band über dem Prompt | immer da, sobald der Mod geladen ist |
| Pane mit allen Zahlen | `/tokens` |
| Cache warmhalten | `/keepwarm` (2 h), `/keepwarm 10m` … `/keepwarm 8h`, auch `/keepwarm 120m`; nur in interaktiven Sessions |
| Warmhalten beenden | `/keepwarm aus` (auch `off` oder `0`; meldet Pings und gelesene Tokens) |
| Compact | Knopf `[ Compact ]` im Band oder Pane (nur zwischen zwei Turns) |
| TTL fest einstellen | `/config` → `cache-meter.cacheTtl` = `auto` / `60m` / `5m` |

## Band über dem Prompt

Eine Zeile. Was andere Mods im Band zeichnen (z. B. die Hinweise von `you-should-know`), bleibt darunter sichtbar (*interface › Pick where to draw › Band*). Bei schmalem Terminal fallen zuerst der Kostenhinweis, dann die Auto-Compact-Angabe, dann der Balken weg – die Zeile bricht nicht um.

| Teil | Bedeutung | Woher |
|---|---|---|
| `● cache 42m` | Restlaufzeit des Prompt-Caches im Hauptgespräch. Grün = warm, gelb = 17 % der TTL oder weniger übrig, rot `abgelaufen` / `leer` | Beginn der letzten Hauptanfrage + TTL. Jeder Treffer setzt die Lebensdauer zurück (*prompt-caching › Cache lifetime*). Ab dem **Beginn** der Anfrage zu zählen ist eine konservative Annahme: die Doku sagt nur „after Claude Code last sent a request … or Claude last responded“ (*prompt-caching › Switching models*) |
| `■■■□□` | dieselbe Restzeit als Balken (bis 20 Zellen) | |
| `93% hit` | Trefferquote der letzten Hauptanfrage = gelesen ÷ (neu + gelesen + geschrieben) | `turn.step` → `usage` (je Anfrage) |
| `☀ Kontext 9%` | Kontextfüllung gegen das Modellfenster; Symbol nach Abstand zum Auto-Compact-Punkt: ☀ < 25 %, ☁ < 50 %, ☂ < 75 %, ☇ < 90 %, ↯ darüber | `session.measure` |
| `(Auto-Compact 97%)` | wo Auto-Compact auslöst, auf derselben Skala; `(Auto-Compact aus)`, wenn abgeschaltet; fehlt, solange unbekannt | `$.session.usage({ breakdown: 'summary' })` – lokal geschätzt, kein API-Aufruf, einmal je Fenstergröße |
| `↻` | `/keepwarm` läuft | |
| `· Neuschreiben ≈ …` | nur bei abgelaufenem Cache: was die nächste Anfrage neu schreibt. In Dollar, wenn Claude Code selbst geschätzt hat (Resume, Modellwechsel), sonst in Tokens | `classic.SessionStart`, `classic.PostModelSwitch`, `session.measure` |
| `[ Compact ]` | `/compact` per Knopf; ausgeblendet, solange ein Turn läuft (dann lehnt Claude Code ab) | `$.session.compact()` |

## Pane `/tokens`

- **Cache:** warm/abgelaufen/leer mit Restzeit, TTL **mit ihrer Quelle** (Abschnitt „TTL“), Trefferquote der letzten Anfrage und der ganzen Session, Warmhalte-Stand (`n/12 Pings`, gelesene Tokens).
- **Kontext:** Füllung, Tokens/Fenster, Auto-Compact-Punkt, Verlauf der letzten 12 Turns als Sparkline.
- **Anfragen im Hauptgespräch:** je Anfrage ein gestapelter Balken – grün aus dem Cache gelesen, gelb in den Cache geschrieben, rot neu (ungecacht) – mit Summe, Trefferquote und Ausgabe-Tokens.
- **Summen:** Hauptgespräch und Subagenten getrennt, Kosten wie `/cost` (Listenpreis; im Abo ein Richtwert, nicht die Rechnung).
- **Kalte Neuschreibungen dieser Session:** die letzten 5 mit Uhrzeit, neu geschriebenen Tokens und Pausenlänge, dazu Anzahl und Summe der ganzen Session. Gezählt wird eine Hauptanfrage, die bei ihrem Start einen abgelaufenen Cache fand, mindestens 10k Tokens geschrieben **und** mehr geschrieben als gelesen hat (so macht eine falsche TTL-Annahme aus einer warmen Anfrage keine kalte). Nicht gezählt: die erste Anfrage einer neuen Session und die erste nach `/compact` oder `/clear` (dort wird ohnehin neu aufgebaut) sowie warme Anfragen mit viel neuem Kontext. Gezählt wird dagegen die erste Anfrage nach `--resume` mit abgelaufenem Cache (Claude Codes eigene Einschätzung `prompt_cache_likely_expired` hat dabei Vorrang vor der Uhr) und nach einem Modellwechsel. Die Liste nennt den Grund: „nach 1h10m Pause“, „(nach Resume, 20m Pause)“ oder „(nach Modellwechsel)“.
- **Limits:** 5 Stunden, 7 Tage (und ggf. Ausgabelimit) als Balken mit Reset-Zeit.

Nach einer kalten Neuschreibung nach einer Pause erscheint für 10 s ein Hinweis „Cache war kalt: 150k Tokens neu geschrieben – vor der nächsten Pause /keepwarm?“ – nur nach einer Pause in dieser Session: nicht, wenn `/keepwarm` schon läuft, nicht nach Modellwechsel oder Resume (da hätte Warmhalten in dieser Session nicht geholfen), nicht unter `claude -p`. Der Mod schaltet dabei **nichts** selbst ein.

## `/keepwarm`

Sobald 17 % der TTL oder weniger übrig sind (bei 60m ≈ 10 min), schickt der Mod eine Mini-Anfrage über das Gespräch (`$.model.fork`, Antwort „warm“) – nicht, solange gerade eine Hauptanfrage läuft (die frischt den Cache ohnehin auf). Am Ende jedes Turns, auch nach Abbruch mit Esc, setzt der Mod diesen Zähler zurück (`turn.complete`), damit Warmhalten nicht still hängen bleibt. Ein Treffer setzt die Lebensdauer des Caches zurück.

- **Kosten:** jeder Ping liest den ganzen Kontext zum Cache-Lesepreis des Modells (<https://platform.claude.com/docs/en/about-claude/pricing>) und zählt aufs Abo-Kontingent. Wie Cache-Lesungen auf das 5-Stunden- und 7-Tage-Limit angerechnet werden, ist nicht dokumentiert – im Pane die Limits beobachten.
- **Bremsen** – der Mod stoppt das Warmhalten mit einem Hinweis, wenn
  - ein Ping weniger als die Hälfte des Kontexts aus dem Cache gelesen hat, nichts gelesen hat, oder mindestens 10 % so viel neu geschrieben wie gelesen hat (Teil-Fehltreffer; Regel von cache-tax übernommen) – dann stimmt die TTL-Annahme nicht und jeder weitere Ping wäre ein teurer Neuaufbau,
  - die TTL 5 Minuten beträgt – beim Start und auch, wenn sie während des Laufs auf 5m fällt (z. B. Abo-Limit erreicht): es wäre ein Ping alle paar Minuten,
  - 12 Pings erreicht sind, das Fenster endet, der Cache leer/abgelaufen ist oder ein Ping ohne Antwort bleibt.
- Nur in interaktiven Sessions: unter `claude -p` oder im SDK läuft kein Timer, `/keepwarm` lehnt dort ab. Verwirft nie eine Nachricht. Gilt nur für die eine Session, in der es gestartet wurde.

## TTL: hergeleitet, nicht gemessen

Keine Mod-Schnittstelle meldet die TTL je Anfrage. Der Mod leitet sie in dieser Reihenfolge her (nach *prompt-caching › Choose the TTL yourself*):

1. Option `cacheTtl` dieses Mods = `60m` oder `5m`.
2. `FORCE_PROMPT_CACHING_5M=1` → 5m.
3. `CLAUDE_CODE_PROMPT_CACHE_TTL` (`5m`/`1h`).
4. Einstellung `promptCacheTtl` (`5m`/`1h`).
5. `ENABLE_PROMPT_CACHING_1H=1` → 1h.
6. Ein Abo-Fenster steht bei ≥ 100 % (dann zieht Claude Code Nutzungsguthaben und senkt auf 5m) → 5m.
7. Was Claude Code beim letzten Modellwechsel gemeldet hat (`classic.PostModelSwitch` → `cache_ttl`).
8. Sonst 60m (Abo innerhalb des Kontingents).

Mit API-Key oder Cloud-Provider ist Claude Codes Standard 5m: dann `cacheTtl` auf `5m` stellen oder `promptCacheTtl` setzen. Umgebungsvariablen und Einstellung liest der Mod beim Start und nach `/clear`, `/resume`, `/branch`.

Option setzen: `/config` → Zeile `cache-meter.cacheTtl`, oder in `~/.claude/settings.json` unter `pluginConfigs` → `"cache-meter@inline"` → `options` → `cacheTtl`. Der Schlüssel `@inline` gilt für `--plugin-dir`; ein Pfad aus `CLAUDE_CODE_PLUGIN_DIRS` wird „exactly as a `--plugin-dir`“ geladen (Skill `plugin-authoring`, reference › Developing one), und der Debug-Log von 2.1.296 nennt `pluginConfigs["cache-meter" or "cache-meter@inline"]`.

**Gegenprobe**, ob die angenommene TTL stimmt: `/usage` → Zeile „Prompt cache (main)“ (warm/kalt), oder `claude -p "hello" --output-format json` → `usage.cache_creation.ephemeral_1h_input_tokens` vs. `ephemeral_5m_input_tokens` (*prompt-caching › Choose the TTL yourself*).

## Annahmen und Grenzen

| Punkt | Stand |
|---|---|
| TTL | hergeleitet (Abschnitt oben); Quelle steht im Pane |
| Verlängert ein `/keepwarm`-Ping den 1h-Cache um eine Stunde? | **Offiziell nicht dokumentiert, aber beobachtet.** Forks bekommen laut Doku selbst das 5m-TTL (*prompt-caching › Which TTL each request gets*); der gemischte Fall steht nirgends. `karanb192/cache-tax` hat es mit demselben Mechanismus in einem Lauf beobachtet (Fable 5.1, Abo, 2026-09-19): Ping in Minute 50 las 157k, Claude Codes Countdown sprang auf 58 min, die Nachricht in Minute 62 las 156.886 Tokens aus dem Cache. Eigene Gegenprobe: nach einem Ping 6–50 min warten, dann `/usage` |
| Erreicht ein `/keepwarm`-Ping den `turn.step`-Hook? | **unbelegt.** `re-entry` (Typdeklaration) deckt nur Ereignisse unter dem *eigenen* Aufruf eines Hooks; der Ping kommt aus einem Timer. Falls ja, erscheint er als eine Zeile im Verlauf und in den Summen, der Countdown bleibt richtig. Nachmessen: nach dem ersten Ping `/tokens` ansehen. Bewusst kein Filter: er würde echte Anfragen verwerfen, die während eines Pings enden |
| Resume | `seconds_since_last_response` zählt ab dem Ende der letzten Antwort – der Countdown nach `--resume` ist um deren Dauer zu optimistisch; sagt Claude Code `prompt_cache_likely_expired`, gilt der Cache als kalt |
| Dollarbeträge | nur Claude Codes eigene Schätzung (Resume, Modellwechsel) und `/cost`-Summe; keine eigene Preistabelle (wäre bei jedem neuen Modell nachzupflegen) |
| Countdown nach Pausen ohne Anfrage | rechnet mit der Uhr; ändert sich der Prefix anders (Modell, MCP-Server, Plugin) wird der Cache auch vor Ablauf ungültig (*prompt-caching › Actions that invalidate the cache*) – erkennbar an niedriger Trefferquote |
| Subagenten | eigene Caches mit 5m-TTL; nur in den Summen, nicht im Countdown |

## Kosten und Daten

Der Mod schreibt nichts auf die Platte und sendet nichts außer den `/keepwarm`-Pings. Alle Werte leben im Session-Zustand (`$.state`) und verschwinden mit `/clear`, `/resume`, `/branch` oder Session-Ende. Er liest die Umgebungsvariablen `FORCE_PROMPT_CACHING_5M`, `CLAUDE_CODE_PROMPT_CACHE_TTL`, `ENABLE_PROMPT_CACHING_1H` und über `$.settings.read()` den Wert `promptCacheTtl`.

## Laden, Abschalten, Einstellen

Kein Marketplace. Geladen über `CLAUDE_CODE_PLUGIN_DIRS` im `env`-Block von `~/.claude/settings.json` (Pfade mit `:` getrennt), wirkt ab der nächsten Session. **Geladen wird der Ordner so, wie er ausgecheckt ist** – ein ausgecheckter Branch läuft in allen neuen Sessions. Zum Ausprobieren einer Änderung einen Worktree anlegen und `claude --plugin-dir <worktree>` nutzen.

Abschalten: Pfad aus `CLAUDE_CODE_PLUGIN_DIRS` nehmen, oder für eine Session `claude --safe-mode`.

Bestand aller Mods auf diesem Mac und Prüfverfahren: `~/Documents/WICHTIGE_BACKUPS/claude-code-infos/claude-code-mods-infos.md`.

## Entwickeln

```text
.claude-plugin/plugin.json   Manifest: Name, Version, Typvertrag, Option cacheTtl
hooks/hooks.json             zeigt auf register.tsx
hooks/register.tsx           alle Hooks: Datenquellen, Band, Pane, Befehle, Warmhalten
hooks/lib.ts                 reine Funktionen ohne $ (TTL-Herleitung, Formatierung) – direkt testbar
types/index.d.ts             Typvertrag aller $.state-Werte
tests/cache-meter.test.tsx   Tests gegen die Engine (claude plugin test)
CLAUDE.md                    Regeln für Claude in diesem Repo (Quelle der Wahrheit, Ablauf)
```

```bash
claude plugin validate .     # Manifest, Hooks, State-Vertrag. Erwartete Warnung: CLAUDE.md wird nicht als Mod-Kontext ausgeliefert (gewollt, gilt nur fürs Repo)
claude plugin test .         # 23 Tests, Stubs nach docs › mods › test
tsc -p .                     # Typen liegen nach dem ersten Laden in .claude-plugin/types/ (gitignored)
# Rauchtest ohne Oberfläche: jeder Hook muss "settled" melden
D=$(mktemp -d); claude -p "Antworte nur: ok" --plugin-dir . --debug-file "$D/debug.log"; grep cache-meter "$D/debug.log"; rm -f "$D/debug.log" "$D/latest"; rmdir "$D"
```

Tests decken ab: TTL-Reihenfolge, Hauptanfrage vs. Subagent, Countdown ab Anfragebeginn, Resume, `/clear`, Modellwechsel, Compact (Hook, precompute, Knopf), schmales Band, Komposition mit anderen Mods, `/keepwarm` (Treffer, Fehltreffer, Teil-Fehltreffer, ohne Antwort, kein Ping während einer Anfrage, wieder Ping nach abgebrochenem Turn, 5m-TTL, ohne Bildschirm), kalte Neuschreibungen (Zählung, Hinweis, kein Hinweis bei laufendem Warmhalten, Grenzen: unter 10k, mehr gelesen als geschrieben, nach `/compact`, Subagent, Modellwechsel, Resume mit „wahrscheinlich abgelaufen“ samt Beschriftung), Pane mit Limits auf Terminal und Desktop. Jeder Test für eine Schutzfunktion ist per eingebautem Fehler gegengeprüft (wird rot).

## Herkunft

- Idee und Optik nach Florians Screenshot-Vorlage (2026-10-12).
- Wettersymbole und Sparkline nach Anthropics Beispiel-Mod `token-weather`.
- Von `karanb192/cache-tax` übernommen: Resume-Felder, „Neuschreiben kostet“, `/keepwarm`, Stopp bei Schreibanteil ≥ 10 %, Zählung kalter Neuschreibungen. Bewusst nicht übernommen: Guard (verwirft auf 2.1.296 Agent-Meldungen, Issue #17), Auto-Warmhalten nach kaltem Senden, Preistabelle. cache-tax ist nicht installiert.
- Reviews gegen die offizielle Doku am 2026-10-12: 19 Befunde (behoben in `3217bf4`), 15 Befunde nach den cache-tax-Ideen (behoben in `3d525fa`), Bestätigungs-Review mit 3 weiteren (behoben im Commit danach); Einzelheiten in den Commit-Nachrichten.
