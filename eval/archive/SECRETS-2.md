# Secrets, essai 2 — règles par format + IA en complément (2026-11-11)

- **regles_rappel** : 56 % (attente ≥ 80 %)
- **regles_propres_masques_a_tort** : 0 % (attente ≤ 5 %)
- **regles_plus_ia_rappel** : 92 %
- **apport_ia** : 36 points (attente ≥ 10)
- **regles_plus_ia_propres_masques_a_tort** : 18 % (attente ≤ 10 %)
- **latence_ia_mediane_s** : 5.7 (attente ≤ 10)

## Détail

- règles ✓ · règles+IA ✓ — remote: Invalid credentials
- règles ✗ · règles+IA ✓ — [deploy] DIGITALOCEAN_ACCESS_TOKEN not used, falling back to doctl auth init -t dop_v1_bc8ced1baeb68
- règles ✓ · règles+IA ✓ — shopify-sync: GET /admin/api/2024-01/orders.json with X-Shopify-Access-Token: shpat_54afc21b2d470de2
- règles ✓ · règles+IA ✓ — vault: export VAULT_TOKEN=hvs.khYwWiuf9BMqQMGDgZjbViNo
- règles ✗ · règles+IA ✓ — discord-bot: logging in with token MIVHFCd0AkA3Owa0QEIPkE7k.GXHcUD.kvr3T4zx9kgfSHrnjFOPD3bIWylsJcokJ
- règles ✗ · règles+IA ✗ — sentry_sdk: DSN https://eb990bfc267a088aefc1ec4aa4652bb4@o290971.ingest.sentry.io/6610607 rejected: 
- règles ✗ · règles+IA ✓ — mailgun: POST https://api.mailgun.net/v3/mg.acme.io/messages auth=api:key-a17f25215d7682d2cf8d4381cc
- règles ✗ · règles+IA ✓ — + ldapsearch -x -H ldap://ldap.acme.local -D "cn=admin,dc=acme,dc=local" -w qwbf#RuQur97 -b "dc=acme
- règles ✗ · règles+IA ✓ — redis-cli -h cache1 AUTH QMN1-C29MF41
- règles ✓ · règles+IA ✓ — java.sql.SQLException: Access denied for user 'etl'@'10.0.3.7' url=jdbc:mysql://db1:3306/dwh?user=et
- règles ✗ · règles+IA ✓ — PHP Fatal error: Uncaught PDOException in /var/www/config.php:4 (define('DB_PASSWORD', 'ksXG-eBuon71
- règles ✓ · règles+IA ✓ — kubectl get secret app -o yaml
- règles ✓ · règles+IA ✓ — + wget --http-user=ci --http-password=ryGL-IHvQJ31 https://nexus.acme.io/repository/raw/build.tar.gz
- règles ✓ · règles+IA ✓ — smtp: connecting to smtp://alerts:Ht0V!yL5zk62@mail.acme.io:587 failed: 535 Authentication failed
- règles ✓ · règles+IA ✓ — ftp-mirror: lftp ftp://mirror:MZU8!aFJJ768@ftp.acme.io/pub -e "mirror"
- règles ✓ · règles+IA ✓ — datadog-agent: API Key invalid, DD_API_KEY=9d2bbd20ca4c4edae9e4dcb90d552bc1
- règles ✗ · règles+IA ✓ — gcloud: loading service account {"type": "service_account", "private_key_id": "b41ea39dfe165e0552bc4
- règles ✓ · règles+IA ✓ — heroku: HEROKU_API_KEY=36c6a033-1b0c-6d2f-715b-297cfeb4f78c
- règles ✓ · règles+IA ✓ — anthropic.AuthenticationError: invalid x-api-key sk-ant-api03-wchb545uB4ADMervZlubNxN5sGYXIZl2TSFTqv
- règles ✓ · règles+IA ✓ — pypi upload: twine upload -u __token__ -p pypi-rfnf6ufQW2heHoTanJxZB4TxaP9p6wy0VQhEcSYs2lXdqOGKDBqeE
- règles ✓ · règles+IA ✓ — circleci: export CIRCLE_TOKEN=074224dd2407a3b565c68bee8106ae6072b69c96
- règles ✗ · règles+IA ✓ — stripe webhook: verifying signature with whsec_eXdwkjsp13YkZaacxqAincBCIpBqVsaC
- règles ✓ · règles+IA ✓ — db-backup: PGPASSFILE missing, using inline conn "host=db1 dbname=shop user=backup password=kIhB.6s1
- règles ✗ · règles+IA ✗ — notify: posting to https://outlook.office.com/webhook/dce723a9-e65b-7e4b-539f-a1139e9da09a@cd52fa68-
- règles ✗ · règles+IA ✓ — rclone: config dump
- ⚠ IA masque à tort : DB_PASS
- ⚠ IA masque à tort : <user> | <password>
- ⚠ IA masque à tort : fullbackup.tar.bz2
- ⚠ IA masque à tort : USERNAME | PASSWORD
- ⚠ IA masque à tort : <remote host password
- ⚠ IA masque à tort : (USERNAME) | (PASSWORD)
- ⚠ IA masque à tort : lxxxxxxxxx | 1xx.1xx.1xx.1xx

## Lecture (2026-11-11)

- Règles seules : rappel 56 % (attente ≥ 80 % NON remplie), 0 % de faux (remplie). Elles ratent mailgun `key-`, `dop_v1_`,
  Discord, Sentry DSN, `ldapsearch -w`, `AUTH` de redis, `define('DB_PASSWORD'…)`, `"private_key_id"`, `whsec_`, webhook Outlook,
  config rclone : des formats absents des règles, ce que le jeu devait justement tester.
- IA en complément : +36 points (remplie), mais 18 % de journaux propres masqués à tort (attente ≤ 10 % NON remplie).
  Sur 7 faux : 5 sont des marque-places écrits par les auteurs des questions (`<password>`, `USERNAME`, `lxxxxxxxxx`) —
  emplacements de secrets dans un vrai journal ; 2 sont de vrais dégâts (`fullbackup.tar.bz2`, nom de variable `DB_PASS`).
  Le critère reste celui fixé avant : non rempli.
- Ni les règles (rappel) ni l'IA (faux) ne sont livrées sur la base de cette mesure.
