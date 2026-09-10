# Runbook backup e restore MAKA

Ultimo aggiornamento: 10 settembre 2026

Questa procedura usa `docker-compose.prod.yml`. Il backup non e completo finche
dump PostgreSQL, archivio upload e file checksum non sono stati copiati anche
fuori dal VPS.

## Backup manuale

Dal repository sul server:

```bash
cd /srv/maka/app
BACKUP_DIR=/srv/maka-backups ./scripts/backup.sh
```

Lo script crea tre file con lo stesso timestamp:

- `maka-TIMESTAMP.database.dump` per PostgreSQL;
- `maka-TIMESTAMP.uploads.tar.gz` per le immagini dei corsi;
- `maka-TIMESTAMP.sha256` per il controllo di integrita.

I file vengono creati con permessi restrittivi. Copiarli in uno storage esterno
cifrato e controllare che il trasferimento sia terminato prima di applicare una
migrazione o una release.

## Verifica sicura del backup

La verifica non modifica il database applicativo. Crea un database temporaneo,
esegue il restore, controlla che contenga tabelle e lo elimina automaticamente:

```bash
cd /srv/maka/app
./scripts/verify-backup.sh /srv/maka-backups/maka-TIMESTAMP.sha256
```

La prima prova dovra essere eseguita nello staging insieme al cliente prima di
considerare completata la Milestone 9.

Per provare gli script nello stack di sviluppo locale:

```bash
COMPOSE_FILE=docker-compose.yml \
ENV_FILE=.env.example \
BACKUP_DIR=/tmp/maka-backups \
./scripts/backup.sh

COMPOSE_FILE=docker-compose.yml \
ENV_FILE=.env.example \
./scripts/verify-backup.sh /tmp/maka-backups/maka-TIMESTAMP.sha256
```

## Restore di produzione

Il restore di produzione e un'operazione distruttiva e non e automatizzato.
Deve essere eseguito soltanto durante una finestra approvata, con API fermata,
backup corrente verificato e piano di ritorno concordato.

Sequenza operativa da seguire insieme:

1. dichiarare la finestra di manutenzione e impedire nuove scritture;
2. creare e verificare un ultimo backup dello stato corrente;
3. fermare `api` lasciando attivo PostgreSQL;
4. ripristinare prima il dump in un database temporaneo;
5. verificare versione Alembic, conteggi principali e accesso ai dati;
6. sostituire il database applicativo soltanto dopo approvazione esplicita;
7. ripristinare gli upload e i relativi permessi;
8. riavviare API e web, quindi eseguire healthcheck e collaudo funzionale;
9. conservare sia il backup precedente sia quello ripristinato fino alla
   chiusura dell'intervento.

Non usare `docker compose down -v`: eliminerebbe i volumi persistenti.

## Conservazione minima

- 7 backup giornalieri;
- 4 backup settimanali;
- 12 backup mensili;
- almeno una copia cifrata esterna al Droplet;
- verifica restore trimestrale e dopo migrazioni rilevanti.

La cancellazione automatica dei backup verra configurata sul VPS soltanto dopo
aver scelto insieme storage esterno, retention e canale di notifica errori.
