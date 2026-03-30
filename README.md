# Vault Finance

Persoonlijke financiële dashboard voor het analyseren van bankafschriften van bunq en Triodos.

## Features

- Importeer CSV-exports van bunq en Triodos
- Automatische categorisering van transacties
- Dashboard met uitgaven per categorie
- Maandelijkse trend-grafieken
- Handmatig categorieën aanpassen

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
