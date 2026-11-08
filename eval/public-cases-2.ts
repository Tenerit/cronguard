// Jeu de TEST « public2 » : pannes de jobs planifiés publiées sur StackExchange, collectées le
// 2026-11-08 APRÈS le gel des 78 fiches (commit 05beeb6), par eval/collect-public2.mjs : pour
// 30 requêtes fixées d'avance, le premier résultat avec un log d'erreur et une réponse acceptée.
// 17 gardés ; 13 écartés pour une raison écrite ci-dessous, jamais selon la couverture par une fiche.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée. Ne pas régler sur ce jeu.
//
// Écartés : #3 GitHub Actions, pas un job planifié · #4 hors sujet (pickle) · #6 hors sujet (SSL Apache) · #9 réponse acceptée sans cause établie · #13 hors sujet (Chef) · #19 question d'usage, pas une panne · #20 pas de log d'erreur (seulement la commande) · #23 réponse acceptée sans cause établie · #24 pas de log d'erreur (YAML seulement) · #25 question de code, pas de panne · #26 cause seulement « probable » · #27 hors sujet · #29 pas une panne
import type { EvalCase } from './cases'

export const PUBLIC2_CASES: EvalCase[] = [
  {
    name: 'p2-cron-perm-denied-owner', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/10598530/cron-job-and-folders-permissions-permission-denied',
    logs: `permission denied`,
  },
  {
    name: 'p2-php-mysqli-env-vars', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/53660726/php-warning-mysqli-construct-hy000-2002-no-such-file-or-directory-deb',
    logs: `PHP Warning: mysqli::__construct(): (HY000/2002): No such file or directory`,
  },
  {
    name: 'p2-rake-path-rvm', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/32135701/rake-command-not-found-when-running-cron-job',
    logs: `Date: Fri, 21 Aug 2015 08:23:01 GMT
Message-Id: <201508210823.t7L8N1U6031959@ip-172-xx-xx-xxx>
X-Authentication-Warning: ip-172-xx-xx-xxx: ec2-user set sender to root using -f
From: root@ip-172-xx-xx-xxx (Cron Daemon)
To: ec2-user@ip-172-xx-xx-xxx
Subject: Cron <ec2-user@ip-172-xx-xx-xxx> sh /usr/local/bin/redmine-email.sh
Content-Type: text/plain; charset=UTF-8
Auto-Submitted: auto-generated
X-Cron-Env: <LANG=en_US.UTF-8>
X-Cron-Env: <SHELL=/bin/sh>
X-Cron-Env: <HOME=/home/ec2-user>
X-Cron-Env: <PATH=/usr/bin:/bin>
X-Cron-Env: <LOGNAME=ec2-user>
X-Cron-Env: <USER=ec2-user>

/usr/local/bin/redmine-email.sh: line 5: rake: command not found
`,
  },
  {
    name: 'p2-crontab-percent', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/7068759/crontab-syntax-error',
    logs: `Subject: Cron <root> ET=\`date --date 'yesterday' + (failed)
Content-Type: text/plain; charset=ANSI_X3.4-1968
X-Cron-Env: <SHELL=/bin/sh>
X-Cron-Env: <HOME=/root>
X-Cron-Env: <PATH=/usr/bin:/bin>
X-Cron-Env: <LOGNAME=root>

/bin/sh: Syntax error: EOF in backquote substitution
`,
  },
  {
    name: 'p2-mysqldump-p-space', category: 'database', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/22561223/cron-mysqldump-saying-not-using-password',
    logs: `Enter password: mysqldump: Got error: 1045: Access denied for user 'user_name'@'localhost' (using password: NO) when trying to connect
`,
  },
  {
    name: 'p2-pg-dump-pgpass-root', category: 'database', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/24542823/why-pg-dump-was-not-getting-the-password-in-cron-job',
    logs: `pg_dump: [archiver (db)] connection to database "mydbname" failed: fe_sendauth: no password supplied
`,
  },
  {
    name: 'p2-docker-no-space', category: 'resources', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/56381961/no-space-left-on-device-due-to-docker-cron',
    logs: `docker: Error response from daemon: no space left on device.
`,
  },
  {
    name: 'p2-cron-malware', category: 'unknown', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/59411428/cron-killed-by-system',
    logs: `Dec 18 23:59:01 localhost CRON[32201]: (root) CMD (command -v debian-sa1 > /dev/null && debian-sa1 60 2)
Dec 19 00:00:01 localhost CRON[1147]: (root) CMD (/tmp/.X17-unix/.rsync/c/aptitude>/dev/null 2>&1)
Dec 19 00:00:01 localhost CRON[1149]: (wp) CMD (/var/lib/docker/volumes/root_wp_data/_data/.bashtemp/a/upd>/dev/null 2>&1)
Dec 19 00:00:01 localhost CRON[1148]: (root) CMD (/usr/lib/armbian/armbian-apt-updates)
Dec 19 00:00:01 localhost CRON[1150]: (root) CMD (/usr/lib/armbian/armbian-truncate-logs)
Dec 19 00:00:01 localhost CRON[1153]: (root) CMD (test -x /usr/bin/certbot -a \\! -d /run/systemd/system && perl -e 'sleep int(rand(43200))' && certbot -q renew)
Dec 19 00:00:01 localhost CRON[1152]: (root) CMD (/root/.nullcache/a/upd>/dev/null 2>&1)
Dec 19 00:00:01 localhost CRON[1158]: (wp) CMD (/tmp/.X19-unix/.rsync/c/aptitude>/dev/null 2>&1)
Dec 19 00:00:01 localhost systemd[1]: cron.service: Main process exited, code=killed, status=9/KILL
Dec 19 00:00:01 localhost systemd[1]: cron.service: Unit entered failed state.
Dec 19 00:00:01 localhost systemd[1]: cron.service: Failed with result 'signal'.
Dec 19 00:58:57 localhost dhclient[2585]: DHCPREQUEST of 192.168.1.11 on wlan0 to 192.168.1.1 port 67 (xid=0x5584c9ee)
Dec 19 02:08:42 localhost dhclient[2585]: message repeated 312 times: [ DHCPREQUEST of 192.168.1.11 on wlan0 to 192.168.1.1 port 67 (xid=0x5584c9ee)]

---
● cron.service - Regular background program processing daemon
   Loaded: loaded (/lib/systemd/system/cron.service;`,
  },
  {
    name: 'p2-curl-60-ca-bundle', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/50973313/how-to-fix-curl-error-60-without-downloading-cert',
    logs: `[Thu Jun 21 14:55:36 2018] [error] [client xxx.xx.xxx.xx] PHP Fatal error:  Uncaught exception 'Guzzle\\\\Http\\\\Exception\\\\CurlException' with message '[curl] 60:  [url] https://identity.api.rackspacecloud.com/v2.0/tokens' in 

/var/www/passline.com/vendor/guzzle/http/Guzzle/Http/Curl/CurlMulti.php:359\\nStack trace:\\n#0

/var/www/passline.com/vendor/guzzle/http/Guzzle/Http/Curl/CurlMulti.php(292): Guzzle\\\\Http\\\\Curl\\\\CurlMulti->isCurlException(Object(Guzzle\\\\Http\\\\Message\\\\EntityEnclosingRequest), Object(Guzzle\\\\Http\\\\Curl\\\\CurlHandle), Array)\\n#1    

/var/www/passline.com/vendor/guzzle/http/Guzzle/Http/Curl/CurlMulti.php(257): Guzzle\\\\Http\\\\Curl\\\\CurlMulti->processResponse(Object(Guzzle\\\\Http\\\\Message\\\\EntityEnclosingRequest), 
Object(Guzzle\\\\Http\\\\Curl\\\\CurlHandle), Array)\\n#2     

/var/www/passline.com/vendor/guzzle/http/Guzzle/Http/Curl/CurlMulti.php(240): Guzzle\\\\Http\\\\Curl\\\\CurlMulti->processMessages()\\n#3    

/var/www/passline.com/vendor/guzzle/http/Guzzle/Http/Curl/CurlMulti.php(224): Guzzle\\\\Http\\\\Curl\\\\CurlMulti->executeHandles()\\n#4

/var/www/passline.com/vendor/guzzle/http/Guzzle/Http/Curl/CurlMulti.php(111)
`,
  },
  {
    name: 'p2-spring-sftp-duplicate', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/78979169/how-can-i-ensure-that-multiple-instances-of-my-spring-integration-application-do',
    logs: `2024-09-13T10:50:02.499-04:00 ERROR 16323 --- [some-service] [   scheduling-1] o.s.integration.handler.LoggingHandler   : org.springframework.messaging.MessagingException: Problem occurred while synchronizing '/remote-file-path' to local directory
    at org.springframework.integration.file.remote.synchronizer.AbstractInboundFileSynchronizer.synchronizeToLocalDirectory(AbstractInboundFileSynchronizer.java:345)
    at org.springframework.integration.file.remote.synchronizer.AbstractInboundFileSynchronizingMessageSource.doReceive(AbstractInboundFileSynchronizingMessageSource.java:266)
    at org.springframework.integration.file.remote.synchronizer.AbstractInboundFileSynchronizingMessageSource.doReceive(AbstractInboundFileSynchronizingMessageSource.java:69)
    at org.springframework.integration.endpoint.AbstractFetchLimitingMessageSource.doReceive(AbstractFetchLimitingMessageSource.java:47)
    at org.springframework.integration.endpoint.AbstractMessageSource.receive(AbstractMessageSource.java:142)
    at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
    at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:77)
    at java.base/jdk.internal.reflect.DelegatingMethodAccessorImpl.invoke(DelegatingMethodAccessorImpl.java:43)
    at java.base/java.lang.reflect.Method.invoke(Method.java:568)
    at org.springframework.aop.support.AopUtils.invokeJoinpointUsingReflection(AopUtils.java:355)
    at org.springframe`,
  },
  {
    name: 'p2-ffmpeg-display-boot', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/76178140/ffmpeg-doesnt-work-when-the-script-is-launched-by-cron-no-protocol-specified',
    logs: `No protocol specified
Cannot open display :0.0`,
  },
  {
    name: 'p2-python-ascii-encode', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/9932406/unicodeencodeerror-only-when-running-as-a-cron-job',
    logs: `UnicodeEncodeError: 'ascii' codec can't encode character
u'\\xa7' in position 13: ordinal not in range(128)
`,
  },
  {
    name: 'p2-node-path-global', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/25776173/cant-import-modules-into-a-node-script-if-it-runs-from-cron',
    logs: `Date: Wed, 10 Sep 2014 16:26:01 -0600
From: Cron Daemon <root@db.local>
To: olmo@db.local
Subject: Cron <olmo@db> /usr/local/bin/node /home/olmo/project/processDrivesMultiUser.js


module.js:340
    throw err;
          ^
Error: Cannot find module 'underscore'
    at Function.Module._resolveFilename (module.js:338:15)
    at Function.Module._load (module.js:280:25)
    at Module.require (module.js:364:17)
    at require (module.js:380:17)
    at Object.<anonymous> (/home/olmo/sandbox/api_ievwebapp/parseAdminScripts/processDrivesMultiUser.js:20:9)
    at Module._compile (module.js:456:26)
    at Object.Module._extensions..js (module.js:474:10)
    at Module.load (module.js:356:32)
    at Function.Module._load (module.js:312:12)
    at Function.Module.runMain (module.js:497:10)
`,
  },
  {
    name: 'p2-php-oom-ssh-safe-mode', category: 'resources', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/15849775/php-cli-out-of-memory-error-on-vps-server-running-centos-with-cpanel',
    logs: `Fatal error: Out of memory (allocated 20185088) (tried to allocate 71 bytes)
`,
  },
  {
    name: 'p2-aws-env-cron', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://unix.stackexchange.com/questions/398110/awscli-cant-see-environment-variables-but-only-from-cron',
    logs: `Unable to locate credentials. You can configure credentials by running "aws configure"`,
  },
  {
    name: 'p2-selenium-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/50117377/selenium-with-chromedriver-doesnt-start-via-cron',
    logs: `selenium.common.exceptions.WebDriverException: Message: unknown error: Chrome failed to start: exited abnormally (Driver info: chromedriver=2.38.552522

---
Exception in thread <name>:
Traceback (most recent call last):
  File "/usr/lib64/python3.6/threading.py", line 916, in _bootstrap_inner
    self.run()
  File "/usr/lib64/python3.6/threading.py", line 864, in run
    self._target(*self._args, **self._kwargs)
  File "/path/to/script.py", line 53, in start
    self.site_scrape(test_run)
  File "/path/to/script.py", line 65, in site
    self.driver = webdriver.Chrome(chrome_options=options)
  File "/home/<user>/.virtualenvs/selenium/lib64/python3.6/site-packages/selenium/webdriver/chrome/webdriver.py", line 69, in __init__
    desired_capabilities=desired_capabilities)
  File "/home/<user>/.virtualenvs/selenium/lib64/python3.6/site-packages/selenium/webdriver/remote/webdriver.py", line 98, in __init__
    self.start_session(desired_capabilities, browser_profile)
  File "/home/<user>/.virtualenvs/selenium/lib64/python3.6/site-packages/selenium/webdriver/remote/webdriver.py", line 188, in start_session
    response = self.execute(Command.NEW_SESSION, parameters)
  File "/home/<user>/.virtualenvs/selenium/lib64/python3.6/site-packages/selenium/webdriver/remote/webdriver.py", line 256, in execute
    self.error_handler.check_response(response)
  File "/home/<user>/.virtualenvs/selenium/lib64/python3.6/site-packages/selenium/webdriver/remote/errorhandler.py", line 194, in check_r`,
  },
  {
    name: 'p2-git-ssh-key-cron', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://unix.stackexchange.com/questions/40934/crontab-with-svn-and-git',
    logs: `X-Cron-Env: <SHELL=/bin/sh>
X-Cron-Env: <HOME=/home/guyfawkes>
X-Cron-Env: <PATH=/usr/bin:/bin>
X-Cron-Env: <LOGNAME=guyfawkes>
X-Cron-Env: <USER=guyfawkes>

upd crm

Fetching external item into 'public/old'
External at revision 32674.

At revision 483.
update crm completed
-------
upd sql
At revision 29.
update sql completed
-------
upd old
At revision 32674.
update old completed
-------
upd mysqldiff
Permission denied (publickey,keyboard-interactive).
fatal: The remote end hung up unexpectedly
update mysqlidff completed
Permission denied (publickey).
fatal: The remote end hung up unexpectedly
push to github completed
-------
upd mmmm
Permission denied (publickey,keyboard-interactive).
fatal: The remote end hung up unexpectedly
mmm updated
upd data
Permission denied (publickey,keyboard-interactive).
fatal: The remote end hung up unexpectedly
data updated
`,
  },
]
