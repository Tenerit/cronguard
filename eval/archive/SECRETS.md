# Rôle IA — secrets que les règles ratent (2026-11-11)

- **ia_rappel** : 84 % (attente ≥ 80 %)
- **code_rappel** : 89 %
- **ia_propres_masques_a_tort** : 7 % (attente ≤ 15 %)
- **code_propres_masques_a_tort** : 43 %
- **ecart_rappel_ia_moins_code** : -5 points (attente ≥ 15)
- **latence_mediane_s** : 4.7 (attente ≤ 10)

## Détail (valeurs tronquées)

- ✓ IA · ✓ code — 2026-03-02 02:00:01 slack-notify: posting to #ops with token xoxb-206975277410-28182910091
  IA : xoxb-2069752…
- ✗ IA · ✓ code — notify.sh: POST https://hooks.slack.com/services/Tinj66JOO/BxAbieIGm/LxP36ZAbmX2rVh33l2tA1
- ✓ IA · ✓ code — geocode-sync: request https://maps.googleapis.com/maps/api/geocode/json?address=Paris&key=
  IA : AIzafMLHXFlL…
- ✓ IA · ✓ code — Loaded config: {"apiKey":"soGKT3BLLqUAgeMQd9NMTsdEnGKUGlDi","region":"eu-west-1","timeout"
  IA : soGKT3BLLqUA…
- ✓ IA · ✓ code — + mongodump --host db1 --username backup --password efefh-xJaM778 --db shop --out /backup/
  IA : efefh-xJaM77…
- ✓ IA · ✗ code — + curl -fsS -u admin:OMcX4#WDUo323 https://jenkins.acme.local/job/nightly/build
  IA : OMcX4#WDUo32…
- ✓ IA · ✓ code — Traceback (most recent call last):
  IA : XQM20#CsSX63…
- ✓ IA · ✓ code — celery worker: Cannot connect to amqp://guest:gGImJ!TgFC330@rabbit:5672//: [Errno 111] Con
  IA : gGImJ!TgFC33…
- ✗ IA · ✓ code — > GET /api/v2/export HTTP/1.1
- ✓ IA · ✓ code — + cat /home/deploy/.ssh/id_ed25519
  IA : p/NN3HZEpQoR…
- ✓ IA · ✓ code — npm ERR! code E401
  IA : npm_eisqBEVA…
- ✓ IA · ✓ code — openai.error.AuthenticationError: Incorrect API key provided: sk-proj-WJKfXOLPY0SxvypsmCxf
  IA : sk-proj-WJKf…
- ✗ IA · ✓ code — mailer: sending via SendGrid with SG.eLp3j5gVE6fvoPfmLpcNoK.HHxvVQ2JLumSQMhRnrWM60vZktzuVl
- ✓ IA · ✓ code — azure-upload: using DefaultEndpointsProtocol=https;AccountName=acmebackup;AccountKey=hZc/N
  IA : hZc/NyILcEYe…
- ✓ IA · ✓ code — Using deploy token 4f427c8fc6082dcd21221c2b8aaba237d01997f4 for registry.acme.io
  IA : 4f427c8fc608…
- ✓ IA · ✓ code — telegram-alert: POST https://api.telegram.org/bot0059303202:AA85uaAqn8KqIOVtthWTi8NbnH2IDn
  IA : 0059303202:A…
- ✓ IA · ✗ code — + docker login -u ci -p 3nYya-A0CR206 registry.acme.io
  IA : 3nYya-A0CR20…
- ✓ IA · ✓ code — env dump before failure:
  IA : kJW0e#Zzth51…
- ✓ IA · ✓ code — + aws configure set aws_secret_access_key teRH8iwohi73TZkhP7Eqw5W7fMgntheRHd0ogSi7
  IA : teRH8iwohi73…
- ⚠ code masque à tort : value)
- ⚠ code masque à tort : 20110110103501.6F944264D0@domain.com
- ⚠ code masque à tort : ws-test-moodlearchive-01 | nfs4_reclaim_open_state:
- ⚠ code masque à tort : smb://192.168.10.32/Data | smb://192.168.10.32/Data/BSEEQ
- ⚠ code masque à tort : loaded | algorithms: | ecdsa-sha2-nistp256-cert-v01@openssh.com | ecdsa-sha2-nistp384-cert-v01@openssh.com | ecdsa-sha2-nistp521-cert-v01@openssh.com | curve25519-sha256@libssh.org | diffie-hellman-group-exchange-sha256 | diffie-hellman-group16-sha512 | diffie-hellman-group18-sha512 | diffie-hellman-group-exchange-sha1 | diffie-hellman-group14-sha256 | diffie-hellman-group14-sha1 | ssh-ed25519-cert-v01@openssh.com | ssh-rsa-cert-v01@openssh.com
- ⚠ code masque à tort : person1@myredacteddomain.tld | person2@myredacteddomain.tld
- ⚠ code masque à tort : 20150430232101.697ADA24A0@work-virtual-m
- ⚠ code masque à tort : cronie-1.5.7-3.fc35.x86_64
- ⚠ IA masque à tort : USER2@DOMIAN.LOCAL
- ⚠ code masque à tort : CronSequenceGenerator.java:233 | CronSequenceGenerator.java:81 | ScheduledTaskRegistrar.java:129 | AbstractAutowireCapableBeanFactory.java: | AbstractAutowireCapableBeanFactory.java: | org.springframework.scheduling.config.Sc
- ⚠ code masque à tort : /SourceCache/rsync/rsync-35.2/rsync/io.c
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
