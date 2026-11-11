# Rôle IA — secrets que les règles ratent (2026-11-11)

- **ia_rappel** : 84 % (attente ≥ 80 %)
- **code_rappel** : 89 %
- **ia_propres_masques_a_tort** : 7 % (attente ≤ 15 %)
- **code_propres_masques_a_tort** : 43 %
- **ecart_rappel_ia_moins_code** : -5 points (attente ≥ 15)
- **latence_mediane_s** : 4.7 (attente ≤ 10)

## Détail (valeurs tronquées)

- ✓ IA · ✓ code — 2026-03-02 02:00:01 slack-notify: posting to #ops with token [REDACTED]
  IA : (valeurs proposées masquées dans le rapport)
- ✗ IA · ✓ code — notify.sh: POST https://hooks.slack.com/services/[REDACTED]
- ✓ IA · ✓ code — geocode-sync: request https://maps.googleapis.com/maps/api/geocode/json?address=Paris&key=
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✓ code — Loaded config: {"apiKey":"[REDACTED]","region":"…","timeout"
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✓ code — + mongodump --host db1 --username backup --password [REDACTED] --db shop --out /backup/
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✗ code — + curl -fsS -u admin:[REDACTED] https://jenkins.acme.local/job/nightly/build
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✓ code — Traceback (most recent call last):
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✓ code — celery worker: Cannot connect to amqp://guest:[REDACTED]@… [Errno 111] Con
  IA : (valeurs proposées masquées dans le rapport)
- ✗ IA · ✓ code — > GET … …
- ✓ IA · ✓ code — + cat …
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✓ code — npm ERR! code E401
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✓ code — openai.error.AuthenticationError: Incorrect API key provided: [REDACTED]
  IA : (valeurs proposées masquées dans le rapport)
- ✗ IA · ✓ code — mailer: sending via SendGrid with [REDACTED]
- ✓ IA · ✓ code — azure-upload: using DefaultEndpointsProtocol=https;AccountName=acmebackup;AccountKey=hZc/N
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✓ code — Using deploy token [REDACTED] for registry.acme.io
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✓ code — telegram-alert: POST https://api.telegram.org/bot[REDACTED]
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✗ code — + docker login -u ci -p [REDACTED] registry.acme.io
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✓ code — env dump before failure:
  IA : (valeurs proposées masquées dans le rapport)
- ✓ IA · ✓ code — + aws configure set aws_secret_access_key [REDACTED]
  IA : (valeurs proposées masquées dans le rapport)
- ⚠ code masque à tort : value)
- ⚠ code masque à tort : [EMAIL]
- ⚠ code masque à tort : … | …
- ⚠ code masque à tort : smb://[PRIVATE_IP]/Data | smb://[PRIVATE_IP]/Data/BSEEQ
- ⚠ code masque à tort : loaded | algorithms: | [EMAIL] | [EMAIL] | [EMAIL] | [EMAIL] | … | … | … | … | … | … | [EMAIL] | [EMAIL]
- ⚠ code masque à tort : [EMAIL] | [EMAIL]
- ⚠ code masque à tort : …@work-virtual-m
- ⚠ code masque à tort : …
- ⚠ IA masque à tort : [EMAIL]
- ⚠ code masque à tort : … | … | … | AbstractAutowireCapableBeanFactory.java: | AbstractAutowireCapableBeanFactory.java: | org.springframework.scheduling.config.Sc
- ⚠ code masque à tort : …
- ⚠ code masque à tort : /USR/SBIN/CRON[4530]:
- ⚠ IA masque à tort : password
- ⚠ code masque à tort : password | flush-logs | /usr/lib/lightdm/lightdm:/usr/local/sbin
- ⚠ code masque à tort : INTERNAL

## Lecture (2026-11-11) — critère d'écart NON REMPLI

IA : rappel 84 %, journaux propres masqués à tort 7 %, 4,7 s → ses trois attentes propres sont remplies.
Règle de code : rappel 89 % mais **43 %** de journaux propres masqués à tort (versions, chemins, piles d'appels,
algorithmes SSH : elle masquerait ce qui sert au diagnostic). Écart IA − code : −5 points pour une attente ≥ +15.
Selon la règle fixée avant, l'IA n'est donc pas adoptée ; mais la règle de code, telle que définie, n'est pas
livrable non plus (43 % de faux). Défaut de ma pré-inscription : je n'avais pas borné les faux de la règle de code.
Ratés de l'IA : webhook Slack, en-tête Basic, clé SendGrid. Ratés du code : curl -u, docker login -p.
