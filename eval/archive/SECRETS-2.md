# Secrets, essai 2 — règles par format + IA en complément (2026-11-11)

- **regles_rappel** : 56 % (attente ≥ 80 %)
- **regles_propres_masques_a_tort** : 0 % (attente ≤ 5 %)
- **regles_plus_ia_rappel** : 92 %
- **apport_ia** : 36 points (attente ≥ 10)
- **regles_plus_ia_propres_masques_a_tort** : 18 % (attente ≤ 10 %)
- **latence_ia_mediane_s** : 5.7 (attente ≤ 10)

## Détail

- règles ✓ · règles+IA ✓ — remote: Invalid credentials
- règles ✗ · règles+IA ✓ — [deploy] DIGITALOCEAN_ACCESS_TOKEN not used, falling back to doctl auth init -t …
- règles ✓ · règles+IA ✓ — shopify-sync: GET … with X-Shopify-[REDACTED_KEY]
- règles ✓ · règles+IA ✓ — vault: export VAULT_TOKEN=[REDACTED]
- règles ✗ · règles+IA ✓ — discord-bot: logging in with token [REDACTED]…
- règles ✗ · règles+IA ✗ — sentry_sdk: DSN https://[EMAIL]/6610607 rejected: 
- règles ✗ · règles+IA ✓ — mailgun: POST … …
- règles ✗ · règles+IA ✓ — + ldapsearch -x -H ldap://ldap.acme.local -D "cn=admin,dc=acme,dc=local" -w … -b "dc=acme
- règles ✗ · règles+IA ✓ — redis-cli -h cache1 AUTH …
- règles ✓ · règles+IA ✓ — java.sql.SQLException: Access denied for user 'etl'@'[PRIVATE_IP]' …?user=et
- règles ✗ · règles+IA ✓ — PHP Fatal error: Uncaught PDOException in … (define('DB_PASSWORD', '…
- règles ✓ · règles+IA ✓ — kubectl get secret app -o yaml
- règles ✓ · règles+IA ✓ — + wget --http-user=ci --http-password=[REDACTED] https://nexus.acme.io/repository/raw/build.tar.gz
- règles ✓ · règles+IA ✓ — smtp: connecting to smtp://alerts:[REDACTED]@… failed: 535 Authentication failed
- règles ✓ · règles+IA ✓ — ftp-mirror: lftp ftp://mirror:[REDACTED]@ftp.acme.io/pub -e "mirror"
- règles ✓ · règles+IA ✓ — datadog-agent: API Key invalid, DD_API_KEY=[REDACTED]
- règles ✗ · règles+IA ✓ — gcloud: loading service account {"type": "service_account", "private_key_id": "…
- règles ✓ · règles+IA ✓ — heroku: HEROKU_API_KEY=[REDACTED]
- règles ✓ · règles+IA ✓ — anthropic.AuthenticationError: invalid x-api-key [REDACTED]
- règles ✓ · règles+IA ✓ — pypi upload: twine upload -u __token__ -p [REDACTED]
- règles ✓ · règles+IA ✓ — circleci: export CIRCLE_TOKEN=[REDACTED]
- règles ✗ · règles+IA ✓ — stripe webhook: verifying signature with …
- règles ✓ · règles+IA ✓ — db-backup: PGPASSFILE missing, using inline conn "… dbname=shop user=backup password=[REDACTED]
- règles ✗ · règles+IA ✗ — notify: posting to …@…
- règles ✗ · règles+IA ✓ — rclone: config dump
- ⚠ IA masque à tort : DB_PASS
- ⚠ IA masque à tort : <user> | <password>
- ⚠ IA masque à tort : …
- ⚠ IA masque à tort : USERNAME | PASSWORD
- ⚠ IA masque à tort : <remote host password
- ⚠ IA masque à tort : (USERNAME) | (PASSWORD)
- ⚠ IA masque à tort : lxxxxxxxxx | …

## Lecture (2026-11-11)

- Règles seules : rappel 56 % (attente ≥ 80 % NON remplie), 0 % de faux (remplie). Elles ratent mailgun `key-`, `dop_v1_`,
  Discord, Sentry DSN, `ldapsearch -w`, `AUTH` de redis, `define('DB_PASSWORD'…)`, `"private_key_id"`, `whsec_`, webhook Outlook,
  config rclone : des formats absents des règles, ce que le jeu devait justement tester.
- IA en complément : +36 points (remplie), mais 18 % de journaux propres masqués à tort (attente ≤ 10 % NON remplie).
  Sur 7 faux : 5 sont des marque-places écrits par les auteurs des questions (`<password>`, `USERNAME`, `lxxxxxxxxx`) —
  emplacements de secrets dans un vrai journal ; 2 sont de vrais dégâts (`fullbackup.tar.bz2`, nom de variable `DB_PASS`).
  Le critère reste celui fixé avant : non rempli.
- Ni les règles (rappel) ni l'IA (faux) ne sont livrées sur la base de cette mesure.
