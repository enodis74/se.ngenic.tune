# Ngenic API-diagnostik

Kör från projektroten i en interaktiv terminal (Node.js 18 eller senare):

```sh
npm run diagnose -- --tune 00000000-0000-4000-8000-000000000000
```

UUID:t i exemplen är påhittat; ersätt det med det Tune-UUID som ska undersökas.

Klistra in access token vid den dolda inmatningen och tryck Enter. Token ska inte
anges som kommandoradsargument eller skrivas i någon fil. Utan `--tune` undersöks
alla system som tokenen ger tillgång till. Skriptet använder projektets befintliga
`node-fetch` och behöver inte Homey för att köras.

Skriptet gör endast GET-anrop till Ngenic och följer inga omdirigeringar. Det hämtar:

- Tune-lista och detaljer, nodstruktur, rum, reglerinställningar, nodstatus och scheman.
- Senaste värden för de fyra temperaturtyper som Tune-drivrutinen efterfrågar, över alla noder.
- Mätvärdestyper och senaste värden för alla upptäckta noder, även inaktiva controllers.
- De fyra efterfrågade temperaturtyperna på varje controller även när `/types` inte listar dem.
- Controllerhistorik för dessa och andra annonserade temperatur-/reglertyper: senaste
  dygnet med timperioder och senaste 30 dagarna med dygnsperioder.

Anropen baseras på [Ngenics API-dokumentation](https://developer.ngenic.se/).
Historiken är aggregerad; den visar perioder med värden, inte varje enskilt råvärde.
Skriptet hämtar inte en separat användarlista eller gör några ändringar av regleringen.

Varje körning skapar `diagnostics/ngenic-<tid>-<suffix>/` i projektet:

- `responses.jsonl`: en JSON-rad per anrop med URL, tidpunkt, HTTP-status,
  utvalda svarshuvuden, svarstext och eventuella nätverks-/JSON-fel.
- `summary.json`: körstatus, nodöversikt, controller som appens nuvarande
  parningskod skulle välja, mätvärdestyper, senaste värden och historiköversikt.

Svaren skrivs direkt efter varje anrop. Ctrl+C sparar en delrapport. En avbruten
körning, HTTP 401/429 eller uppnådd anropsgräns ger exitkod 1. Andra HTTP-fel och
felaktig JSON sparas och undersökningen fortsätter där det är möjligt. `completed`
betyder att insamlingen slutfördes; se även `observations` för misslyckade anrop.

Tokenen hålls i minnet, begäranshuvuden sparas inte, och eventuella exakta
återgivningar av tokenen i svar/fel maskeras. **Rapporterna är inte anonymiserade:**
de kan innehålla namn, adresser och andra kontouppgifter från API-svaren.
Katalogen undantas från Git och Homey-paketet. Rapportfiler skapas med rättighet 0600.
Låt rapporterna ligga kvar här och ange katalogens sökväg för fortsatt analys.

Standard: 5 sekunder mellan anrop, högst 200 anrop, 20 sekunders timeout per anrop.
En normal insamling kan ta flera minuter. Ngenic begränsar anrop både per minut och
per timme; skriptet stannar vid 429 och sparar `Retry-After` om det finns. Stoppa gärna
pågående utvecklingskörning av Homey-appen under insamlingen för att minska samtidig polling.

```sh
npm run diagnose -- --help
npm run diagnose -- --tune 00000000-0000-4000-8000-000000000000 --days 90 --interval-ms 10000
npm run test:diagnostics
```
