# Erzeugt einen fiktiven Beispiel-Kontoauszug (Oktober 2026) als PDF, ohne externe Bibliotheken.
param([string]$Out = (Join-Path $PSScriptRoot '..\app\beispiel\kontoauszug-oktober-2026.pdf'))

$enc = [Text.Encoding]::GetEncoding(1252)
function Esc([string]$s) { $s.Replace('\', '\\').Replace('(', '\(').Replace(')', '\)') }

# Buchungstag, Wert, Vorgang, Zeile 2, Betrag
$tx = @(
  @('01.10.', '01.10.', 'Dauerauftrag Hausverwaltung Kramer GmbH', 'Miete Oktober Whg. 3 links', '-890,00'),
  @('01.10.', '01.10.', 'Lastschrift Stadtwerke Musterstadt', 'Abschlag Strom Kd-Nr 448812', '-64,00'),
  @('01.10.', '01.10.', 'Lastschrift Vodafone GmbH', 'Mobilfunk Rechnung 10/2026', '-29,99'),
  @('01.10.', '01.10.', 'Lastschrift Netflix International B.V.', 'Abo Oktober', '-13,99'),
  @('02.10.', '02.10.', 'Kartenzahlung REWE Markt GmbH', 'REWE SAGT DANKE 4417', '-47,83'),
  @('02.10.', '02.10.', 'Lastschrift HUK-COBURG Versicherung', 'Kfz-Haftpflicht Beitrag 10/26', '-58,40'),
  @('03.10.', '03.10.', 'Kartenzahlung ARAL Station 2214', 'Tankstelle Musterstadt', '-71,20'),
  @('04.10.', '04.10.', 'Lastschrift PayPal Europe S.a.r.l.', 'Spotify AB Premium', '-10,99'),
  @('05.10.', '05.10.', 'Kartenzahlung Lieferando.de', 'Bestellung 7781-AB', '-28,50'),
  @('06.10.', '06.10.', 'Lastschrift Rundfunk ARD ZDF DRadio', 'Beitragsnummer 512 334 991', '-18,36'),
  @('07.10.', '07.10.', 'Kartenzahlung LIDL Dienstleistung', 'Filiale 0815', '-32,17'),
  @('08.10.', '08.10.', 'Lastschrift AMAZON EU S.a.r.l.', 'Bestellung 302-118842', '-39,90'),
  @('09.10.', '09.10.', 'Dauerauftrag Musterbank Depot', 'Sparplan ETF', '-250,00'),
  @('10.10.', '10.10.', 'Kartenzahlung Stern Apotheke', 'Musterstadt', '-14,85'),
  @('11.10.', '11.10.', 'Kartenzahlung Bowlingcenter Mitte', 'Freizeit', '-19,99'),
  @('12.10.', '12.10.', 'Bargeldauszahlung Geldautomat', 'Sparkasse Musterstadt', '-100,00'),
  @('14.10.', '14.10.', 'Kartenzahlung EDEKA Schmidt', 'Musterstadt', '-61,42'),
  @('15.10.', '15.10.', 'Lastschrift Telekom Deutschland GmbH', 'Festnetz/Internet 10/2026', '-39,95'),
  @('15.10.', '15.10.', 'Lastschrift McFit GmbH', 'Mitgliedsbeitrag', '-24,90'),
  @('16.10.', '16.10.', 'Kartenzahlung A.T.U Auto-Teile-Unger', 'Reifenwechsel', '-89,00'),
  @('18.10.', '18.10.', 'Kartenzahlung Burger King 1123', 'Musterstadt', '-12,48'),
  @('20.10.', '20.10.', 'Bareinzahlung', 'Einzahlungsautomat Filiale Mitte', '+200,00'),
  @('21.10.', '21.10.', 'Kartenzahlung Shell Deutschland', 'Station 4410', '-66,03'),
  @('22.10.', '22.10.', 'Kartenzahlung Zalando SE', 'Bestellung 10293', '-79,95'),
  @('23.10.', '23.10.', 'Gutschrift Familienkasse', 'Kindergeld KG-Nr 255FK', '+255,00'),
  @('24.10.', '24.10.', 'Kartenzahlung ALDI SUED', 'Filiale 112', '-43,66'),
  @('27.10.', '27.10.', 'Gutschrift Muster AG', 'Lohn/Gehalt 10/2026', '+2.845,60'),
  @('28.10.', '28.10.', 'Ueberweisung Max Mustermann', 'Geschenk Hochzeit', '-50,00'),
  @('29.10.', '29.10.', 'Lastschrift Wuestenrot Bausparkasse', 'Bausparvertrag Sparrate', '-50,00'),
  @('30.10.', '30.10.', 'Kartenzahlung Kino Cineplex', 'Tickets', '-24,00'),
  @('31.10.', '31.10.', 'Abschluss Entgelt Kontofuehrung', 'Kontofuehrung 10/2026', '-4,95')
)

$pages = New-Object System.Collections.ArrayList
function NewPage([int]$n) {
  $p = New-Object System.Collections.ArrayList
  [void]$p.Add(@(50, 790, 14, 'Sparkasse Musterstadt', 'B'))
  [void]$p.Add(@(50, 772, 9, 'Kontoauszug 10/2026   Girokonto DE00 1234 5678 0000 1234 56', 'R'))
  [void]$p.Add(@(470, 772, 9, "Blatt $n", 'R'))
  [void]$p.Add(@(50, 740, 9, 'Buchung', 'B'))
  [void]$p.Add(@(100, 740, 9, 'Wert', 'B'))
  [void]$p.Add(@(150, 740, 9, 'Vorgang', 'B'))
  [void]$p.Add(@(490, 740, 9, 'Betrag EUR', 'B'))
  return ,$p
}

$page = NewPage 1
[void]$pages.Add($page)
$y = 715
[void]$page.Add(@(150, $y, 9, 'Kontostand vom 30.09.2026', 'B'))
[void]$page.Add(@(495, $y, 9, '1.523,40', 'B'))
$y -= 26
foreach ($t in $tx) {
  if ($y -lt 90) {
    [void]$page.Add(@(50, 50, 8, 'Sparkasse Musterstadt, Marktplatz 1, 12345 Musterstadt. Fiktiver Beispielauszug.', 'R'))
    $page = NewPage ($pages.Count + 1)
    [void]$pages.Add($page)
    $y = 715
  }
  $w = $t[4].Length * 9 * 0.52
  [void]$page.Add(@(50, $y, 9, $t[0], 'R'))
  [void]$page.Add(@(100, $y, 9, $t[1], 'R'))
  [void]$page.Add(@(150, $y, 9, $t[2], 'R'))
  [void]$page.Add(@([math]::Round(540 - $w, 1), $y, 9, $t[4], 'R'))
  [void]$page.Add(@(150, ($y - 11), 8, $t[3], 'R'))
  $y -= 30
}
[void]$page.Add(@(150, $y, 9, 'Neuer Kontostand vom 31.10.2026', 'B'))
[void]$page.Add(@(495, $y, 9, '2.587,49', 'B'))
[void]$page.Add(@(50, 50, 8, 'Sparkasse Musterstadt, Marktplatz 1, 12345 Musterstadt. Fiktiver Beispielauszug.', 'R'))

# PDF-Objekte zusammenbauen
$objs = New-Object System.Collections.ArrayList
[void]$objs.Add('<< /Type /Catalog /Pages 2 0 R >>')
[void]$objs.Add('PAGES')
[void]$objs.Add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
[void]$objs.Add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')
$kids = @()
foreach ($p in $pages) {
  $sb = New-Object Text.StringBuilder
  foreach ($it in $p) {
    $font = if ($it[4] -eq 'B') { 'F2' } else { 'F1' }
    [void]$sb.Append("BT /$font $($it[2]) Tf $($it[0].ToString([Globalization.CultureInfo]::InvariantCulture)) $($it[1]) Td ($(Esc $it[3])) Tj ET`n")
  }
  $stream = $sb.ToString()
  [void]$objs.Add("<< /Length $($enc.GetByteCount($stream)) >>`nstream`n$stream`nendstream")
  $contentId = $objs.Count
  [void]$objs.Add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents $contentId 0 R >>")
  $kids += "$($objs.Count) 0 R"
}
$objs[1] = "<< /Type /Pages /Kids [$($kids -join ' ')] /Count $($kids.Count) >>"

$sb = New-Object Text.StringBuilder
[void]$sb.Append("%PDF-1.4`n")
$offsets = @()
for ($i = 0; $i -lt $objs.Count; $i++) {
  $offsets += $enc.GetByteCount($sb.ToString())
  [void]$sb.Append("$($i + 1) 0 obj`n$($objs[$i])`nendobj`n")
}
$xref = $enc.GetByteCount($sb.ToString())
[void]$sb.Append("xref`n0 $($objs.Count + 1)`n0000000000 65535 f `n")
foreach ($o in $offsets) { [void]$sb.Append(('{0:D10} 00000 n ' -f $o) + "`n") }
[void]$sb.Append("trailer`n<< /Size $($objs.Count + 1) /Root 1 0 R >>`nstartxref`n$xref`n%%EOF`n")

$dir = Split-Path $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
[IO.File]::WriteAllBytes([IO.Path]::GetFullPath($Out), $enc.GetBytes($sb.ToString()))
Write-Host "Geschrieben: $Out"
