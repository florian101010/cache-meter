# cache-meter – Regeln für Claude

**Quelle der Wahrheit für jede Änderung an diesem Mod: ausschließlich die offizielle Anthropic-Doku und die Typdeklaration der laufenden Claude-Code-Version. Kein Trainingswissen.**

- Doku: <https://code.claude.com/docs/en/plugins/mods/overview>, alle Unterseiten über <https://code.claude.com/docs/llms.txt> → „Mods“ (overview, create, interface, gallery, events, api, test, troubleshoot, admin, reference). Für Cache-Verhalten zusätzlich <https://code.claude.com/docs/en/prompt-caching>.
- Typen: `.claude-plugin/types/claude-code/index.d.ts` (von Claude Code beim Laden geschrieben; erste Zeile nennt die Version).
- Die Mods-API ist Early Access und jünger als jedes Modell. Vor jeder Änderung die betroffenen Seiten **neu abrufen**, nicht erinnern. Jede Annahme über API-Verhalten im Code-Kommentar mit Seite + Abschnitt belegen oder als „unbelegt“ markieren.
- Subagenten, die hier prüfen oder schreiben, diese Regel ausdrücklich in den Auftrag schreiben.

Ablauf einer Änderung: Feature-Branch → `claude plugin validate .` → `claude plugin test .` → `tsc -p .` → Rauchtest aus dem README → bei neuen Tests einen Fehler einbauen und prüfen, dass der Test rot wird → Commit (Conventional Commits) → README und `~/Documents/WICHTIGE_BACKUPS/claude-code-infos/claude-code-mods-infos.md` nachziehen.
