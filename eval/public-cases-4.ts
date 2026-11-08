// Jeu de TEST « public4 » : pannes de jobs planifiés publiées sur StackExchange, collectées le
// 2026-11-08 AVANT d'écrire les leviers « contexte d'exécution » et « vérification de la commande »,
// par eval/collect-public4.mjs (30 requêtes fixées d'avance, premier résultat avec log d'erreur et
// réponse acceptée, URLs de public2/public3 exclues). « command » = ligne de crontab recopiée de la
// question quand elle y figure. 17 gardés ; 13 écartés (raison ci-dessous), jamais selon la couverture.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée. Ne JAMAIS régler sur ce jeu.
//
// Écartés : #0 pas de log d'erreur (code) · #5 pas une panne · #6 pas un job planifié (psql à la main) · #9 réponse sans cause établie (contournement) · #10 réponse sans cause établie · #11 pas de log d'erreur · #13 réponse sans cause établie · #15 pas de log d'erreur de la panne · #16 pas un job planifié · #23 pas de log d'erreur (code) · #27 pas de log d'erreur (code) · #28 réponse sans cause établie · #29 pas de log d'erreur (code)
import type { EvalCase } from './cases'

export const PUBLIC4_CASES: EvalCase[] = [
  {
    name: 'p4-python-version-cron', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/24790008/python-script-elicits-error-when-run-in-cron-job-but-at-no-other-time',
    logs: `File "/Users/me/module2.py", line 5, in <module>
    from module1 import consolidate_rankings, build_all
  File "/Users/me/module1.py", line 159
    things = {row["thing"]: row for row in rows}
                                          ^

SyntaxError: invalid syntax
`,
  },
  {
    name: 'p4-laravel-mail-template', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/52274267/laravel-5-2-mail-not-sending-from-cron-job-getting-error-from-mail-response',
    logs: `local.ERROR: exception 'ErrorException' with message 'Undefined variable: errors' in /var/www/html/v1/storage/framework/views/258d88011f525ffcc409e29eafacedd9b8048ff6.php:24

---
[2018-09-11 10:16:01] local.ERROR: exception 'ErrorException' with message 'Undefined variable: errors' in /var/www/html/v1/storage/framework/views/258d88011f525ffcc409e29eafacedd9b8048ff6.php:24
Stack trace:
#0 /var/www/html/v1/storage/framework/views/258d88011f525ffcc409e29eafacedd9b8048ff6.php(24): Illuminate\\Foundation\\Bootstrap\\HandleExceptions->handleError(8, 'Undefined varia...', '/var/www/html/v...', 24, Array)
#1 /var/www/html/v1/vendor/laravel/framework/src/Illuminate/View/Engines/PhpEngine.php(42): include('/var/www/html/v...')
#2 /var/www/html/v1/vendor/laravel/framework/src/Illuminate/View/Engines/CompilerEngine.php(59): Illuminate\\View\\Engines\\PhpEngine->evaluatePath('/var/www/html/v...', Array)
#3 /var/www/html/v1/vendor/laravel/framework/src/Illuminate/View/View.php(149): Illuminate\\View\\Engines\\CompilerEngine->get('/var/www/html/v...', Array)
#4 /var/www/html/v1/vendor/laravel/framework/src/Illuminate/View/View.php(120): Illuminate\\View\\View->getContents()
#5 /var/www/html/v1/vendor/laravel/framework/src/Illuminate/View/View.php(85): Illuminate\\View\\View->renderContents()
#6 /var/www/html/v1/storage/framework/views/80be09fc2f6488124101d105b7ffca95eab87ca3.php(333): Illuminate\\View\\View->render()
#7 /var/www/html/v1/vendor/laravel/framework/src/Illuminate/View/Engines/PhpEngine.php(42`,
  },
  {
    name: 'p4-python3-import', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/65056227/crontab-has-python-import-error-on-macos-when-running',
    logs: `Traceback (most recent call last):
  File "a.py", line 2, in <module>
    import pyautogui
ImportError: No module named pyautogui
`,
  },
  {
    name: 'p4-shebang-hidden-chars', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/42806630/crontab-bash-script-no-such-file-or-directory',
    command: `(. ~/.bash_profile; $HOME/scripts/startworkflow_trg.sh tst)`,
    logs: `/opt/Informatica/pcdev/scripts/startworkflow_trg.sh: line 1: #!/bin/bash: No such file or directory
`,
  },
  {
    name: 'p4-rsync-process-subst-sh', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/40896638/rsync-doesnt-work-from-cron-with-custom-files-from-parameter',
    command: `sh /opt/script.sh >> /var/log/rsync 2>&1`,
    logs: `rsync: failed to open files-from file <(ssh -i /root/.ssh/id_rsa root@hostA find /Data/for_mk/* -type f -cmin -160): No such file or directory
rsync error: syntax or usage error (code 1) at main.c(1435) [client=3.0.9]
`,
  },
  {
    name: 'p4-git-ssh-agent', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/35998401/git-push-via-cron-ssh-agent-no-password',
    command: `/home/uname/dir/script`,
    logs: `CROND[13791]: pam_unix(crond:session): session closed for user uname
crond[13862]: pam_unix(crond:session): session opened for user uname by (uid=0)
CROND[13863]: (uname) CMD (/home/uname/dir/script)
CROND[13862]: (uname) CMDOUT (/home/uname)
CROND[13862]: (uname) CMDOUT (/home/uname/dir
CROND[13862]: (uname) CMDOUT (uname)
CROND[13862]: (uname) CMDOUT (done)
CROND[13862]: (uname) CMDOUT ([master 4fd590d] update)
CROND[13862]: (uname) CMDOUT ( 1 file changed, 1 insertion(+), 1 deletion(-))
CROND[13862]: [50B blob data]
CROND[13862]: (uname) CMDOUT (fatal: Could not read from remote repository.)
CROND[13862]: (uname) CMDOUT ()
CROND[13862]: (uname) CMDOUT (Please make sure you have the correct access rights)
CROND[13862]: (uname) CMDOUT (and the repository exists.)
CROND[13862]: pam_unix(crond:session): session closed for user uname
`,
  },
  {
    name: 'p4-npm-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/48846639/npm-install-and-gulp-fails-in-cron-job',
    command: `/bin/sh /Users/na/GulpBuild.sh >> /Users/na/cronlog.log 2>&1`,
    logs: `Installing dependencies
/Users/na/GulpBuild.sh: line 25: npm: command not found
Gulpifying the code
/Users/na/GulpBuild.sh: line 27: gulp: command not found
Manifest Version in repo: 0.32
`,
  },
  {
    name: 'p4-java-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/32354336/running-jar-with-cron-throws-error-bin-sh-1-java-not-found',
    command: `java -jar test.jar`,
    logs: `/bin/sh: 1: java: not found
`,
  },
  {
    name: 'p4-gsutil-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/31522284/cron-gsutil-not-found',
    command: `/home/deploy/cron/job.sh >> /home/deploy/cron/test.log 2>&1`,
    logs: `/home/deploy/cron/job.sh: 5: /home/deploy/cron/job.sh: gsutil: not found
saved file at 07_20_15_13:03
`,
  },
  {
    name: 'p4-date-percent', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/58983536/cron-job-failing-on-date-time-format',
    command: `cp /home/app/log/file.log.$(date --d="-1 day" +%Y%m%d) /root/`,
    logs: `cp /home/app/log/file.log.$(date --d="-1 day" +

/bin/sh: -c line 0: unexpected EOF while looking for matching ')'
`,
  },
  {
    name: 'p4-crontab-backquote', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/3444595/cron-error-with-using-backquotes',
    logs: `bad \` sign 
errors in crontab file, can't install
`,
  },
  {
    name: 'p4-php-relative-require', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/3118699/php-require-path-does-not-work-for-cron-job',
    logs: `Fatal error: require(): Failed opening required '../includes/common.php' 
(include_path='.:/usr/lib/php:/usr/local/lib/php') in 
/home/username123/public_html/cron/mycronjob.php on line 2
`,
  },
  {
    name: 'p4-pgpassword-quotes', category: 'database', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/54548085/how-can-i-pass-a-password-to-pg-dump-10-when-pgpass-in-home-directory-is-not-a',
    logs: `pg_dump: [archiver (db)] connection to database "my_db" failed: FATAL:  password authentication failed for user "my_user"
FATAL:  password authentication failed for user "my_user"
`,
  },
  {
    name: 'p4-bundle-path-environment', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/39707371/whenever-gem-cronjob-not-loading-path-from-etc-environment',
    command: `/bin/bash -l -c 'cd /home/myhome/analytics && RAILS_ENV=development /bundle exec rake my_rake_job'`,
    logs: `/bin/bash: bundle: command not found`,
  },
  {
    name: 'p4-sh-run-by-python', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/22664027/shell-script-syntax-error-when-trying-to-activate-a-virtualenv-and-execute-a-pyt',
    logs: `  File "/home/username/prod.sh", line 3
    . $VE_DIR/Production_VE/bin/activate
    ^
SyntaxError: invalid syntax

---
  File "/home/username/prod.sh", line 3
    source $VE_DIR/Production_VE/bin/activate
           ^
SyntaxError: invalid syntax
`,
  },
  {
    name: 'p4-cron-no-user-var', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/3576996/why-this-expect-script-gives-an-error-when-its-run-by-cron',
    command: `/home/myusername/bin/uploadmyip`,
    logs: `Date: Thu, 26 Aug 2010 11:50:01 -0400
From: root@supa (Cron Daemon)
To: root@supa
Subject: Cron <root@supa> /home/myusername/bin/uploadmyip

myserver.com
can't read "env(USER)": no such variable
    while executing
"puts $env(USER)"
    (file "/home/myusername/bin/ftpxfer" line 8)
`,
  },
  {
    name: 'p4-display-xauthority', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/11015029/cron-job-how-to-run-a-script-that-requires-to-open-display',
    logs: `RuntimeError: could not open display
`,
  },
]
