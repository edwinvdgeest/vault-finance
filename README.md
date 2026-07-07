# Vault Finance

Persoonlijke financiële dashboard voor het analyseren van bankafschriften van bunq, Triodos, ABN AMRO en ING.

## Features

- Importeer CSV-exports van bunq, Triodos, ABN AMRO en ING (bank wordt automatisch herkend)
- Importeer DeGiro Portfolio.csv als broker holdings
- Automatische categorisering van transacties
- Dashboard met netto vermogen, uitgaven per categorie en trend-grafieken
- Automatische koersverversing voor crypto (CoinGecko) en ETF's (Yahoo Finance), instelbaar via `PRICE_REFRESH_INTERVAL_MIN` (default 360, 0 = uit)
- Box 3-overzicht per peildatum op de Belasting-pagina
- Duurzaam-pagina: duurzaamheidsniveau van je portfolio (impact / streng / licht / geen) op basis van SFDR, gereguleerde indexlabels (SRI, Paris-Aligned, Climate Transition) en themadetectie (water, hernieuwbare energie) — met uitlegbare signalen per holding, handmatige classificatie, fondssuggesties per thema, een wat-als-simulator (spaargeld → duurzaam) en historische performance (1/3/5 jaar, via Yahoo Finance); via MCP kan Claude fondsen onderzoeken en de classificatie met bron opslaan
- Drie werkruimtes (privé, holding, ouders) met gescheiden data
- Projecties (Monte Carlo, FIRE) en what-if scenario's
- MCP-server voor Claude: samenvattingen, transacties zoeken, terugkerende lasten, box 3 en transacties bijwerken

## Lokale ontwikkeling

```bash
npm install
npm run dev
```

## Deployen op Synology NAS

### Vereisten

- Docker en Docker Compose geïnstalleerd op de NAS (via Package Center)
- SSH-toegang tot de NAS

### Stappen

1. SSH in op je NAS:

```bash
ssh admin@<nas-ip>
```

2. Clone de repository:

```bash
git clone <repo-url> /volume1/docker/vault-finance
cd /volume1/docker/vault-finance
```

3. Start de container:

```bash
docker-compose up -d
```

4. Open de app via `http://<nas-ip>:8088`

### Updates

```bash
cd /volume1/docker/vault-finance
git pull
docker-compose up -d --build
```

### Stoppen

```bash
docker-compose down
```
