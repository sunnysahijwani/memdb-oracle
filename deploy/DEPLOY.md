# Deploying memdb-oracle on a Linux box (PM2 + nginx or Apache)

Facts to collect first (fill in as we go):
- DONE Sep 21 2026: Ubuntu, Apache 2.4.58, Node v22.23.2, user `memdb` (nologin), app /var/www/memdb-oracle, systemd `memdb-oracle.service`,
  host memdb.two-techies.com → 13.204.233.176 (A record in two-techies.com DNS), Let's Encrypt via certbot --apache (redirect on).
  Update = re-upload tarball, `sudo cp -a … && sudo chown -R memdb:memdb … && sudo -u memdb npm ci && sudo systemctl restart memdb-oracle`.

## 1. Node ≥ 22 (skip if present)
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs
    # or with nvm for the deploy user: nvm install 22 && nvm alias default 22

## 2. Code
    # from the Mac (rsync, excludes secrets/build junk):
    rsync -az --delete --exclude node_modules --exclude sanity/node_modules --exclude .env \
      --exclude docs/session-log.jsonl /Applications/XAMPP/xamppfiles/htdocs/sanity-benchmark-agent/ <user>@<host>:memdb-oracle/
    # on the server:
    cd ~/memdb-oracle && npm ci --omit=dev=false
    cp .env.example .env && nano .env        # paste the 5 values; then: chmod 600 .env
    node --import tsx -e "import('./agent/oracle.ts').then(m=>console.log(m.config().groqUrl))"   # env sanity check

## 3. Process — systemd (preferred on a shared server; PM2 file kept as an alternative)
    sudo cp deploy/memdb-oracle.service /etc/systemd/system/ && sudo systemctl daemon-reload
    sudo systemctl enable --now memdb-oracle && systemctl status memdb-oracle --no-pager
    curl -s http://127.0.0.1:8787/healthz     # {"ok":true}
    journalctl -u memdb-oracle -f            # logs

## 4. Reverse proxy + TLS
    nginx  → deploy/nginx.conf.example   |   apache → deploy/apache.conf.example
    certbot (--nginx | --apache) -d <hostname>     # Let's Encrypt, 90-day certs, auto-renew timer

## 5. Verify from outside
    curl -s https://<hostname>/healthz
    curl -N -X POST https://<hostname>/api/ask -H 'content-type: application/json' -H 'accept: text/event-stream' \
      -d '{"question":"How many benchmark runs exist for KeyDB? One sentence."}' | head -20   # events must arrive progressively

## Caps already in code (agent/server.ts): 30 questions / IP / day, 400 / day global (RATE_PER_IP_PER_DAY, RATE_GLOBAL_PER_DAY).
## Plus the Anthropic Console spend cap. Rotate the Sanity org token + Anthropic key after the challenge closes.
