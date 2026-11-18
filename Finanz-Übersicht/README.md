# Finanz-Übersicht („Kassensturz“)

Eine lokale Web-App, die Kontoauszüge als PDF einliest und daraus eine Übersicht der
Einnahmen und Ausgaben erstellt, sortiert nach Monat und Jahr, als Liste oder als Diagramm.

Alles läuft auf dem eigenen Rechner: Die PDFs werden im Browser ausgelesen, die Ergebnisse
landen in einer JSON-Datei neben der App. Es gibt keinen Server im Internet, kein Konto und
keine Installation.

> Entstanden als „vibecoded“ Projekt: Die Anwendung wurde im Dialog mit einer KI
> (Claude) entworfen und programmiert.

## Funktionen

- **Kontoauszug ablegen** per Drag & Drop oder Dateidialog, auch mehrere PDFs auf einmal.
- **Buchungen erkennen**: Datum, Betrag, Vorzeichen, Buchungsart, Empfänger. Ausgelegt auf
  deutsche Kontoauszüge mit Zeilen der Form „Datum … Betrag“.
- **Kontostand-Abgleich**: Die Summe aller erkannten Buchungen wird mit Anfangs- und
  Endkontostand des Auszugs verglichen. Weicht sie ab, zeigt die App die verdächtige Buchung
  und bietet eine Korrektur mit einem Klick an.
- **Automatische Kategorien** in vier Gruppen:
  - **Einnahmen**: Gehalt, Leistungen / Agentur für Arbeit, Bargeldeinzahlung, Sonstige Einnahmen
  - **Fixkosten**: Miete & Wohnen, Strom & Energie, Telekommunikation, Versicherungen & Beiträge,
    Abos & Streaming, Behörden & Gebühren, Jahreszahlungen
  - **Variable Kosten**: Supermarkt & Lebensmittel, Drogerie & Körperpflege, Tanken & Kraftstoff,
    Gastronomie & Delivery, Gaming, Hobby & Freizeit, Online-Shopping & Dienste,
    Gesundheit & Apotheke, Reparatur & Wartung KFZ, Bargeld, Sonstiges
  - **Sparrate**: Depot & ETF-Sparplan, Sonstige Investments
- **Erstattungen** (z. B. Rückzahlung eines Händlers) mindern die passende Ausgabenkategorie,
  statt als Einnahme zu zählen. **Umbuchungen zwischen eigenen Konten** werden nicht gewertet.
- **Lesbare Buchungstexte**: Referenznummern, IBANs, Mandats-IDs, Rechtsformen und der Name
  des Kontoinhabers werden aus der Anzeige entfernt.
- **Umsortieren**: Jede Buchung lässt sich einer anderen Kategorie zuordnen. Die App merkt
  sich das für alle Buchungen derselben Gegenpartei, auch in künftigen Auszügen.
- **Monate und Jahre**: Jeder Auszug wird als Monat gespeichert. Eine Registerleiste wählt
  Jahr, Monat oder das ganze Jahr. Erneutes Hochladen verdoppelt nichts.
- **Diagramme**: Wasserfall von den Einnahmen zum Rest, Ausgaben je Monat, Ausgaben nach
  Kategorie, Einnahmen nach Quelle. Farben auf Farbenblindheit geprüft, heller und dunkler Modus.
- **CSV-Export** des gewählten Zeitraums.

## Starten (Windows)

1. Ordner herunterladen.
2. Doppelklick auf **`Kassensturz starten.bat`**. Der Browser öffnet `http://localhost:8420`.
3. Kontoauszug-PDF ins Fenster ziehen. Zum Ausprobieren gibt es einen fiktiven
   Beispielauszug („Mit Beispielauszug ausprobieren“). Er wird beim ersten Start von
   `tools/beispiel-pdf-erzeugen.ps1` erzeugt.

Der Server ist ein kleines PowerShell-Skript (`server.ps1`), das nur auf `localhost` lauscht.
Beim ersten Laden braucht der Browser Internet für die Schrift (Google Fonts) und die
PDF-Bibliothek ([pdf.js](https://mozilla.github.io/pdf.js/) von cdnjs).

Anderer Port: `powershell -ExecutionPolicy Bypass -File server.ps1 -Port 8500`

## Datenschutz

- Kontoauszüge werden ausschließlich im Browser gelesen und nirgendwohin hochgeladen.
- Gespeichert werden die erkannten Buchungen und eigene Zuordnungen in
  `daten/kassensturz.json` (unverschlüsselt, auf dem eigenen Rechner).
- `daten/`, eigene PDFs und CSV-Exporte sind per `.gitignore` von Git ausgeschlossen.
  **Bitte keine eigenen Auszüge oder den Ordner `daten/` in ein Repository hochladen.**

## Aufbau

| Datei | Aufgabe |
|---|---|
| `app/index.html`, `app/styles.css` | Oberfläche |
| `app/app.js` | Einlesen, Monats-/Jahresansicht, Umsortieren, Abgleich, Export |
| `app/parser.js` | PDF-Text in Zeilen zerlegen, Buchungen und Kontostände erkennen |
| `app/clean.js` | Buchungstexte lesbar machen |
| `app/categories.js` | Kategorien, eigene Stichwörter (`KEYWORDS`) und allgemeine Regeln |
| `app/store.js` | Speichern und Laden der Monate |
| `app/charts.js` | Diagramme als SVG |
| `server.ps1` | lokaler Webserver inkl. Speicher-Schnittstelle `/api/daten` |
| `tools/beispiel-pdf-erzeugen.ps1` | erzeugt den fiktiven Beispielauszug |

## Anpassen

- **Eigene Stichwörter**: In `app/categories.js` unter `KEYWORDS` Händler, Vermieter,
  Arbeitgeber usw. bei der passenden Kategorie eintragen. Sie haben Vorrang vor den
  allgemeinen Regeln. Groß-/Kleinschreibung, Umlaute und Leerzeichen sind egal.
- **Neue Kategorien**: in `GROUPS` ergänzen. Bereits gespeicherte Monate werden beim
  nächsten Start automatisch neu eingeordnet. Selbst gewählte Zuordnungen bleiben erhalten.
- **Andere Bank**: Werden keine Buchungen erkannt, zeigt die App den gelesenen Text an.
  Damit lässt sich `app/parser.js` an das Layout anpassen.

## Grenzen

- Nur digitale PDFs aus dem Online-Banking. Gescannte Auszüge enthalten keinen Text.
- Die automatische Zuordnung ist stichwortbasiert und braucht anfangs etwas Nacharbeit.
- Keine Verschlüsselung der gespeicherten Daten.
