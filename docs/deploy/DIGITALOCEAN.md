# Deploy di MAKA su DigitalOcean

Ultimo aggiornamento: 25 agosto 2026

Questa guida descrive il primo rilascio in produzione di MAKA, dall'acquisto del
dominio alla consegna al cliente. I nomi `example.it` e `api.example.it` sono
segnaposto e vanno sostituiti con il dominio reale.

> Importante: il file `docker-compose.yml` presente nel repository e' pensato
> per lo sviluppo locale. Espone database e API, usa il server Vite e avvia
> FastAPI con hot reload. Non deve essere usato direttamente in produzione.

## 1. Architettura consigliata

Per la prima versione si consiglia un singolo Droplet DigitalOcean con Docker
Compose. E' la soluzione piu' semplice da gestire con l'architettura corrente,
che salva anche le immagini dei corsi su filesystem locale.

```text
Utente
  |
  v
DNS del dominio
  |
  v
Reserved IP DigitalOcean
  |
  v
Caddy :80/:443
  |-- example.it     -> React servito da Nginx
  `-- api.example.it -> FastAPI :8000
                            |
                            `-> PostgreSQL su rete Docker privata

Volumi persistenti: PostgreSQL, immagini corsi, certificati Caddy
Backup: backup giornaliero Droplet + dump PostgreSQL esterno
```

Configurazione iniziale suggerita:

| Risorsa | Scelta |
| --- | --- |
| Regione | `fra1`, Francoforte |
| Sistema operativo | Ubuntu 24.04 LTS |
| Droplet | Basic, Regular CPU, 2 vCPU, 4 GiB RAM, 80 GiB SSD |
| IP | Reserved IPv4 assegnato al Droplet |
| TLS e reverse proxy | Caddy |
| Database | PostgreSQL nello stack Docker, non esposto pubblicamente |
| Backup | Daily Droplet Backup e dump PostgreSQL separato |

Francoforte e' la regione DigitalOcean piu' vicina all'Italia attualmente
disponibile. Un database gestito potra' essere introdotto in seguito se carico,
requisiti di continuita' operativa o budget lo richiederanno.

### Costi mensili indicativi

| Voce | Costo indicativo |
| --- | ---: |
| Droplet 2 vCPU / 4 GiB / 80 GiB | 24 USD/mese |
| Backup giornaliero del Droplet | 30% del Droplet, circa 7,20 USD/mese |
| Reserved IPv4 assegnato | incluso |
| Cloud Firewall | incluso |
| Spaces per una copia esterna dei backup, opzionale | 5 USD/mese |
| Dominio | dipende da estensione e registrar |

Totale base: circa **31,20 USD/mese**, oltre a dominio, imposte ed eventuale
Spaces. Con Spaces: circa **36,20 USD/mese**. I prezzi vanno ricontrollati nel
carrello prima dell'acquisto; gli avvisi di spesa DigitalOcean notificano il
superamento di una soglia, ma non bloccano automaticamente i consumi.

## 2. Chi deve possedere cosa

La regola principale e' semplice: dominio, cloud, dati e fatturazione devono
restare sotto il controllo del cliente.

### Attivita' del cliente

- creare gli account con un indirizzo email aziendale controllato dal cliente;
- inserire dati legali, fiscali e metodo di pagamento;
- acquistare il dominio a nome proprio o della ASD;
- restare `Owner` del team DigitalOcean;
- attivare la 2FA e conservare i codici di recupero;
- approvare budget, regione, politica di backup e tempi di conservazione;
- ricevere le credenziali amministrative iniziali di MAKA con un canale sicuro;
- verificare con il proprio consulente gli aspetti privacy e GDPR.

### Attivita' del tecnico

- usare un account personale e una propria chiave SSH, mai le credenziali del
  cliente;
- essere invitato nel team DigitalOcean con ruolo `Modifier`, non `Owner`;
- preparare i file di produzione, configurare il server, migrare il database e
  svolgere il collaudo;
- configurare monitoraggio, backup e procedura di ripristino;
- documentare modifiche, versioni e operazioni di manutenzione.

### Attivita' condivise

- scelta e approvazione del dominio;
- prova completa prima dell'apertura al pubblico;
- prova di ripristino del backup;
- definizione dei contatti per incidenti e manutenzione;
- verbale di consegna con accessi, inventario e costi ricorrenti.

Non condividere password, codici 2FA o chiavi private via chat o email. Usare un
password manager con condivisione protetta. Ogni persona deve avere il proprio
account, revocabile senza bloccare gli altri.

## 3. Acquisto del dominio, attivita' del cliente

DigitalOcean gestisce DNS ma non vende domini. Si puo' usare Cloudflare
Registrar, se l'estensione desiderata e' disponibile, oppure un altro registrar
scelto dal cliente.

1. Scegliere due o tre nomi candidati e controllare spelling, disponibilita' e
   possibili conflitti con marchi esistenti.
2. Creare l'account del registrar con l'email aziendale del cliente.
3. Verificare l'indirizzo email e attivare subito la 2FA.
4. Cercare il dominio nel pannello di acquisto. Se Cloudflare non supporta
   l'estensione desiderata, usare un altro registrar senza cambiare il resto
   dell'architettura.
5. Inserire i dati reali dell'ASD o del titolare. Evitare dati del tecnico.
6. Registrare il dominio per almeno un anno e attivare il rinnovo automatico.
7. Aggiungere un metodo di pagamento che resti valido e un contatto di recupero.
8. Conservare fattura, data di rinnovo e codici di recupero nel registro accessi
   del cliente.
9. Invitare il tecnico con un ruolo limitato se il registrar lo consente;
   altrimenti il cliente esegue le modifiche DNS indicate nella sezione 7.

Con Cloudflare Registrar i nameserver devono rimanere quelli di Cloudflare. La
privacy WHOIS e le regole di registrazione dipendono dall'estensione scelta.

## 4. Account DigitalOcean, attivita' del cliente

1. Aprire l'account DigitalOcean con email aziendale e dati del cliente.
2. Verificare l'email e completare le informazioni di fatturazione.
3. Attivare la 2FA con un'app autenticatore. Salvare i codici di recupero in due
   luoghi protetti, almeno uno offline.
4. Creare il team `MAKA Production`.
5. Assicurarsi che il cliente sia `Owner` e configurare i contatti di sicurezza
   e fatturazione.
6. Abilitare nelle impostazioni del team l'accesso sicuro, richiedendo 2FA o un
   provider SSO supportato ai membri.
7. Invitare il tecnico come `Modifier`. Questo ruolo puo' gestire le risorse ma
   non cancellarle e non gestisce la fatturazione.
8. Creare il progetto `MAKA Production` dentro il team.
9. Configurare avvisi di spesa, per esempio a 30, 40 e 50 USD. Sono avvisi, non
   limiti automatici.
10. Leggere e archiviare i riferimenti al Data Processing Agreement di
    DigitalOcean con la documentazione privacy dell'ASD.

Il cliente non deve inviare al tecnico password o codici 2FA DigitalOcean.

## 5. Blocco di rilascio: modifiche necessarie al repository

Prima di creare dati reali in produzione il tecnico deve aggiungere e verificare:

- `docker-compose.prod.yml` senza bind mount del codice e senza hot reload;
- immagini buildate usando i target `production` di API e frontend;
- un `Caddyfile` per dominio, HTTPS e redirect da `www`;
- supporto del Dockerfile web a `VITE_API_BASE_URL` come build argument;
- esposizione pubblica delle sole porte `80` e `443` di Caddy;
- rete Docker privata per API e database;
- volumi persistenti per PostgreSQL, upload e certificati Caddy;
- healthcheck, restart policy e limiti alla crescita dei log;
- file `.env.production` ignorato da Git e leggibile solo dall'utente deploy;
- comando idempotente per creare o promuovere il primo amministratore;
- backup automatico di database e immagini, con una copia esterna;
- procedura di restore provata in un ambiente isolato;
- smoke test della release e procedura di rollback.

Questa guida descrive il risultato atteso, ma tali artefatti non sono ancora
tutti presenti nel repository al momento della stesura.

## 6. Creazione dell'infrastruttura DigitalOcean

Il tecnico puo' eseguire questi passaggi dal proprio account `Modifier`, dopo
l'approvazione dei costi da parte del cliente.

### 6.1 Chiavi SSH

Ogni operatore crea la propria chiave sul proprio computer:

```bash
ssh-keygen -t ed25519 -a 100 -C "nome-operatore-maka"
```

Caricare nel team DigitalOcean soltanto il contenuto della chiave `.pub`. La
chiave privata non deve mai lasciare il computer che l'ha generata.

### 6.2 Droplet

Nel progetto `MAKA Production` selezionare la creazione di un Droplet:

1. Regione `Frankfurt`, datacenter `fra1`.
2. Immagine `Ubuntu 24.04 LTS`.
3. Piano `Basic`, CPU `Regular`, 2 vCPU, 4 GiB RAM, 80 GiB SSD.
4. Autenticazione esclusivamente con chiavi SSH.
5. Aggiungere la chiave del tecnico e, se disponibile, una chiave di emergenza
   controllata dal cliente.
6. Abilitare monitoring e backup giornaliero.
7. Impostare hostname `maka-prod-01` e tag `maka`, `production`.
8. Creare il Droplet e annotare costo e IP nel registro infrastruttura.

### 6.3 Reserved IP

Creare un Reserved IPv4 nella stessa regione e assegnarlo subito a
`maka-prod-01`. L'IP assegnato e' incluso; un Reserved IPv4 lasciato non
assegnato viene fatturato.

Da questo momento DNS, documentazione e accessi devono usare il Reserved IP,
non l'IP temporaneo del Droplet.

### 6.4 Cloud Firewall

Creare `maka-prod-firewall`, applicarlo tramite tag `production` e usare queste
regole in ingresso:

| Protocollo | Porta | Origine |
| --- | --- | --- |
| TCP | 22 | IP pubblici noti degli amministratori |
| TCP | 80 | tutti gli IPv4 e IPv6 |
| TCP | 443 | tutti gli IPv4 e IPv6 |

Non aprire mai pubblicamente `5432`, `8000` o `5173`. Se l'IP del tecnico cambia
spesso, aggiornare temporaneamente la regola SSH e restringerla subito dopo.
Lasciare le regole in uscita predefinite, salvo requisiti piu' restrittivi.

## 7. Configurazione DNS

Nel provider DNS del dominio creare:

| Tipo | Nome | Valore | Proxy |
| --- | --- | --- | --- |
| A | `@` | Reserved IPv4 | solo DNS durante il primo rilascio |
| CNAME | `www` | `example.it` | solo DNS durante il primo rilascio |
| A | `api` | Reserved IPv4 | solo DNS durante il primo rilascio |

Usare TTL automatico o 300 secondi durante il lancio. Dopo la propagazione:

```bash
dig +short example.it
dig +short www.example.it
dig +short api.example.it
```

I tre risultati devono risolvere verso il Reserved IP, direttamente o tramite
il CNAME previsto. Con Cloudflare lasciare inizialmente le nuvole grigie
(`DNS only`) in modo che Caddy possa ottenere e verificare i certificati senza
aggiungere un ulteriore proxy. L'eventuale proxy Cloudflare si valuta dopo il
collaudo.

Alternativa: si puo' delegare il dominio ai nameserver DigitalOcean e gestire i
record nel pannello DigitalOcean. Non e' la scelta raccomandata per questo
progetto perche' il DNS DigitalOcean non supporta DNSSEC.

## 8. Preparazione sicura del server

Accedere inizialmente come `root` usando la chiave SSH:

```bash
ssh root@RESERVED_IP
adduser deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

Aprire un secondo terminale e verificare prima di proseguire:

```bash
ssh deploy@RESERVED_IP
sudo -v
```

Aggiornare il sistema e installare gli strumenti di base:

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y ca-certificates curl git ufw unattended-upgrades
```

Installare Docker Engine e il plugin Compose dal repository ufficiale Docker
per Ubuntu, quindi verificare:

```bash
docker --version
docker compose version
sudo usermod -aG docker deploy
```

Disconnettersi e riconnettersi per applicare il gruppo `docker`. L'appartenenza
al gruppo Docker equivale, di fatto, a un accesso amministrativo al server e va
riservata agli operatori autorizzati.

Configurare una seconda barriera locale:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Dopo avere verificato l'accesso dell'utente `deploy`, creare
`/etc/ssh/sshd_config.d/99-maka.conf` con:

```text
PasswordAuthentication no
PermitRootLogin prohibit-password
```

Validare prima di ricaricare SSH:

```bash
sudo sshd -t
sudo systemctl reload ssh
```

Tenere aperta la sessione corrente e provare un nuovo accesso `deploy` prima di
chiuderla.

## 9. Collegamento al repository GitHub

Sul server, come utente `deploy`, creare una chiave dedicata e senza passphrase
per il solo deploy automatico:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/maka_github -C "maka-prod-deploy"
cat ~/.ssh/maka_github.pub
```

Il proprietario del repository aggiunge la chiave pubblica in GitHub come
Deploy key **sola lettura**. Configurare `~/.ssh/config`:

```text
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/maka_github
  IdentitiesOnly yes
```

Poi preparare le directory e clonare il progetto:

```bash
sudo mkdir -p /srv/maka/app /srv/maka-data/uploads /srv/maka-backups
sudo chown -R deploy:deploy /srv/maka /srv/maka-data /srv/maka-backups
git clone git@github.com:MrPericle/ChironProject.git /srv/maka/app
```

## 10. Segreti e configurazione produzione

Creare `/srv/maka/app/.env.production`, mai versionarlo e impostare permessi
restrittivi:

```bash
cd /srv/maka/app
umask 077
touch .env.production
chmod 600 .env.production
openssl rand -hex 64
openssl rand -hex 32
```

Usare gli output casuali, diversi tra loro, in una configurazione simile:

```dotenv
APP_ENV=production
APP_NAME=MAKA API
APP_CORS_ORIGINS=https://example.it
APP_SECRET_KEY=SOSTITUIRE_CON_128_CARATTERI_ESADICIMALI
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=30
AUTH_TOKEN_ISSUER=maka-api
WAITLIST_ENABLED=false
COURSE_UPLOAD_DIR=/app/uploads

POSTGRES_DB=chiron
POSTGRES_USER=chiron
POSTGRES_PASSWORD=SOSTITUIRE_CON_PASSWORD_CASUALE
DATABASE_URL=postgresql+psycopg://chiron:SOSTITUIRE_CON_PASSWORD_CASUALE@db:5432/chiron

VITE_API_BASE_URL=https://api.example.it
```

La variabile Vite viene incorporata nel bundle durante la build del frontend:
deve essere passata come build argument dal compose di produzione. Non basta
impostarla sul container Nginx gia' costruito.

Conservare una copia cifrata dei segreti nel password manager del cliente. Non
inserirli in ticket, chat, screenshot o commit Git.

## 11. Primo deploy

Questi comandi diventano validi dopo il completamento della checklist della
sezione 5:

```bash
cd /srv/maka/app
docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml build --pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d db
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api alembic upgrade head
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 api web caddy
```

Verificare dall'esterno:

```bash
curl -fsS https://api.example.it/health
curl -I https://example.it
curl -I https://www.example.it
```

Caddy puo' ottenere automaticamente certificati pubblici se i record DNS
puntano al server e le porte 80 e 443 sono raggiungibili.

### Primo amministratore

Il repository non dispone ancora di un comando CLI di bootstrap verificato. La
forma seguente e' un obiettivo da implementare, non un comando oggi eseguibile:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api \
  python -m chiron_api.cli create-admin
```

Il comando dovra' chiedere email e password in modo interattivo, non stamparle
nei log ed essere idempotente. Il cliente ricevera' la password temporanea via
password manager, la cambiera' al primo accesso e completera' il flusso 2FA.

## 12. Collaudo prima dell'apertura

Il tecnico e il cliente devono verificare insieme:

- HTTPS valido su dominio principale, `www` e API;
- redirect coerente da `www` al dominio principale;
- endpoint `/health` raggiungibile e documentazione API disattivata in
  produzione;
- registrazione, login, logout, rinnovo sessione e recupero dagli errori;
- login amministratore con password e secondo fattore nel corretto ordine;
- creazione di sede, corso ricorrente, capienza, orari e immagine;
- persistenza dell'immagine dopo ricreazione dei container;
- attivazione iscrizione, prenotazione, annullamento e lista d'attesa;
- blocco prenotazione con iscrizione scaduta;
- rilascio delle prenotazioni alla disabilitazione di un utente;
- calendario admin e visualizzazione degli iscritti;
- layout mobile e desktop delle principali funzioni;
- riavvio del Droplet e ripartenza automatica dei servizi;
- porte `5432`, `8000` e `5173` non raggiungibili da Internet;
- generazione di un backup e ripristino su database temporaneo.

Aprire il servizio al pubblico solo dopo il completamento del collaudo e la
firma del cliente sulla checklist.

## 13. Rilasci successivi

Prima di ogni release:

1. annunciare la finestra di manutenzione, se necessaria;
2. controllare CI e stato del branch da distribuire;
3. creare un dump PostgreSQL e verificare lo spazio disponibile;
4. leggere le migrazioni e valutare compatibilita' e rollback;
5. applicare la release;
6. eseguire healthcheck e smoke test;
7. annotare versione, operatore, ora e risultato.

Sequenza indicativa:

```bash
cd /srv/maka/app
git fetch --prune
git checkout main
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.prod.yml build --pull
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api alembic upgrade head
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -fsS https://api.example.it/health
```

Non eseguire pulizie aggressive di immagini o volumi durante un rilascio. I
volumi del database e degli upload non devono mai essere rimossi dal normale
flusso di deploy.

## 14. Backup e ripristino

Il backup giornaliero del Droplet protegge l'intera macchina, ma non sostituisce
un backup applicativo indipendente.

Piano minimo consigliato:

- backup giornaliero DigitalOcean del Droplet;
- `pg_dump` giornaliero con conservazione di 7 giornalieri, 4 settimanali e 12
  mensili;
- copia giornaliera delle immagini caricate;
- copia cifrata fuori dal Droplet, per esempio su DigitalOcean Spaces;
- controllo automatico dell'esito e avviso in caso di errore;
- test di restore almeno ogni tre mesi e dopo modifiche importanti al database.

Un esempio di dump manuale, da adattare ai nomi del compose di produzione:

```bash
cd /srv/maka/app
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
  pg_dump -U chiron -d chiron -Fc > /srv/maka-backups/chiron-manual.dump
```

La procedura di restore deve essere provata su un database separato. Non
eseguire mai un restore direttamente sulla produzione senza una finestra
approvata, un backup recente e un piano di ritorno.

## 15. Privacy e GDPR

Questa sezione e' una checklist tecnica, non consulenza legale.

- L'ASD stabilisce finalita' e mezzi del trattamento e normalmente agisce come
  titolare; DigitalOcean tratta i dati infrastrutturali secondo il proprio DPA.
- Conservare DPA, elenco fornitori, regione scelta e contatti per incidenti nel
  registro privacy.
- Indicare nell'informativa quali dati vengono raccolti, perche', per quanto
  tempo e come l'utente puo' chiedere accesso, correzione o cancellazione.
- Definire periodi di conservazione per utenti, iscrizioni, prenotazioni, log e
  backup, con cancellazione effettiva e documentata.
- Limitare gli accessi amministrativi, registrare le operazioni sensibili e
  revocare rapidamente chi non collabora piu' al progetto.
- Verificare con il consulente privacy i trasferimenti, i subfornitori e le
  condizioni del DPA. La scelta di `fra1` colloca il server principale in UE,
  ma non autorizza a dichiarare senza verifica che ogni trattamento e backup
  avvenga esclusivamente in UE.
- Definire il contatto e la procedura per la gestione di una violazione dati.

## 16. Consegna e uscita del tecnico

Il cliente deve ricevere e verificare:

- proprieta' del dominio e accesso al registrar;
- ruolo `Owner` DigitalOcean e accesso alla fatturazione;
- inventario di Droplet, Reserved IP, Firewall, DNS, volumi e backup;
- credenziali amministrative MAKA e codici di recupero;
- copia cifrata dei segreti e procedura di restore;
- registro dei costi e delle date di rinnovo;
- contatti e procedura per assistenza e incidenti.

Alla fine della collaborazione:

1. il cliente rimuove il tecnico dal team DigitalOcean e dal registrar;
2. rimuove la chiave SSH del tecnico dal server e dal pannello cloud;
3. rimuove o sostituisce la Deploy key GitHub se non piu' necessaria;
4. ruota i segreti ai quali il tecnico ha avuto accesso, se richiesto dalla
   politica del cliente;
5. verifica che backup, rinnovi e avvisi continuino a funzionare.

## 17. Riferimenti ufficiali

DigitalOcean:

- [Creazione di un Droplet](https://docs.digitalocean.com/products/droplets/how-to/create/)
- [Configurazione consigliata di un Droplet](https://docs.digitalocean.com/products/droplets/getting-started/recommended-droplet-setup/)
- [Regioni disponibili](https://docs.digitalocean.com/platform/regional-availability/)
- [Prezzi Droplet](https://www.digitalocean.com/pricing/droplets)
- [Cloud Firewall](https://docs.digitalocean.com/products/networking/firewalls/getting-started/quickstart/)
- [Reserved IP e prezzi](https://docs.digitalocean.com/products/networking/reserved-ips/details/pricing/)
- [Domini e DNS](https://docs.digitalocean.com/products/networking/dns/how-to/add-domains/)
- [Limiti DNS e assenza di registrazione domini](https://docs.digitalocean.com/products/networking/dns/details/limits/)
- [Supporto DNSSEC](https://docs.digitalocean.com/support/does-digitalocean-support-dnssec/)
- [Backup dei Droplet](https://docs.digitalocean.com/products/backups/getting-started/quickstart/)
- [Avvisi di spesa](https://docs.digitalocean.com/platform/billing/spend-alerts/)
- [Team e ruoli predefiniti](https://docs.digitalocean.com/platform/teams/roles/predefined/)
- [Autenticazione a due fattori](https://docs.digitalocean.com/platform/accounts/2fa/)
- [Data Processing Agreement](https://www.digitalocean.com/legal/data-processing-agreement)
- [GDPR FAQ](https://www.digitalocean.com/legal/gdpr-faq)

Dominio e TLS:

- [Cloudflare Registrar](https://developers.cloudflare.com/registrar/)
- [Registrare un dominio con Cloudflare](https://developers.cloudflare.com/registrar/get-started/register-domain/)
- [Estensioni supportate da Cloudflare](https://developers.cloudflare.com/registrar/top-level-domains/)
- [Rinnovo domini Cloudflare](https://developers.cloudflare.com/registrar/account-options/renew-domains/)
- [DNSSEC su Cloudflare](https://developers.cloudflare.com/registrar/get-started/enable-dnssec/)
- [Caddy reverse proxy e HTTPS automatico](https://caddyserver.com/docs/quick-starts/reverse-proxy)

