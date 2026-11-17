// Jeu de TEST FINAL « public3 » : pannes de jobs planifiés publiées sur StackExchange, collectées
// le 2026-11-08 après la lecture des sorties sur public2, par eval/collect-public3.mjs (30 requêtes
// fixées d'avance, premier résultat avec log d'erreur et réponse acceptée, URLs de public2 exclues).
// 14 gardés ; 16 écartés pour une raison écrite ci-dessous, jamais selon la couverture par une fiche.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée. Ne JAMAIS régler sur ce jeu.
//
// Écartés : #2 réponse sans cause établie · #3 pas de log d'erreur (script) · #5 pas de log d'erreur (code) · #7 pas de log d'erreur (script) · #8 pas un job planifié · #10 réponse sans cause établie · #12 cause seulement supposée · #15 pas une panne · #16 pas une panne · #19 aucun résultat · #20 réponse sans cause établie · #21 pas de log d'erreur · #24 pas de log d'erreur (code) · #25 question floue · #26 ligne décisive hors de l'extrait · #28 cause seulement supposée
import type { EvalCase } from './cases'

export const PUBLIC3_CASES: EvalCase[] = [
  {
    name: 'p3-ruby-rvm-env', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/20366718/crontab-not-running-ruby-script',
    logs: `Dec  3 20:12:01 dahlia /USR/SBIN/CRON[13912]: (gigawatt) CMD (/bin/sh -c "(export   PATH=/usr/bin:/bin; /home/gigawatt/drbronnersbot/drbronnersbot.rb)")
Dec  3 20:12:01 dahlia /USR/SBIN/CRON[13910]: (CRON) error (grandchild #13912 failed with exit status 1)
`,
  },
  {
    name: 'p3-smtp-port-blocked', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/21867079/send-an-email-from-python-script-without-outgoing-port-access',
    logs: `socket.error: [Errno 101] Network is unreachable`,
  },
  {
    name: 'p3-mysqldump-password-unquoted', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/68081952/mysqldump-script-fails-on-update-from-mysql-5-5-to-5-7',
    logs: `sh: 1: Gp+cYE2!6z: not found
`,
  },
  {
    name: 'p3-venv-env-var', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/54186439/virtualenvwrapper-environment-variables-when-running-crons',
    logs: `Traceback (most recent call last):
  File "my_script.py", line 7, in <module>
    main()
  File "my_script.py", line 4, in main
    print(os.environ['SOME_ENV_VARIABLE'])
  File "/home/ubuntu/.virtualenvs/testcron/lib/python3.5/os.py", line 725, in __getitem__
    raise KeyError(key) from None
KeyError: 'SOME_ENV_VARIABLE'
`,
  },
  {
    name: 'p3-crontab-percent-date', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/17603325/what-is-wrong-with-using-date-y-m-d-hms-in-a-cron-job',
    logs: `---------- Email message ----------

From: Cron Daemon <root@MYSERVER>

Date: Thu, Jul 11, 2013 at 9:37 PM

Subject: Cron <MYUSERNAME@MYSERVER> mysqldump -u(USERNAME) -p(PASSWORD) --all-databases | 
gzip > /home/MYHOMEDIR/myDBBckups/full_backup$(date "+

To: redacted@example.com


/bin/sh: -c: line 0: unexpected EOF while looking for matching \`"'

/bin/sh: -c: line 1: syntax error: unexpected end of file 

---------- End of Email message ----------
`,
  },
  {
    name: 'p3-rsync-e-quotes', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/60741478/using-rsync-with-ssh-keygen',
    logs: `rsync -ah -progress -delete -e ssh -i ~/.ssh/id_rsa_lb lxxxxxxxxx@1xx.1xx.1xx.1xx /var/opt/file /Volumes/USB-HDD

rsync: link_stat "/Users/yyyyy_yyyyy/.ssh/lxxxxxxxxx@1xx.1xx.1xx.1xx" failed: No such file or directory (2)
rsync: link_stat "/var/opt/base.sql" failed: No such file or directory (2)
rsync error: some files could not be transferred (code 23) at /BuildRoot/Library/Caches/com.apple.xbs/Sources/rsync/rsync-54/rsync/main.c(996) [sender=2.6.9]
`,
  },
  {
    name: 'p3-node-full-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/5849402/how-can-you-execute-a-node-js-script-via-a-cron-job',
    logs: `steve@atom:~$ node -v
v0.4.2

steve@atom:~$ sh node -v
sh: Can't open node

steve@atom:~$ bash node -v
/usr/local/bin/node: /usr/local/bin/node: cannot execute binary file

steve@atom:~$ /usr/local/bin/node -v
v0.4.2

steve@atom:~$ sh /usr/local/bin/node -v
/usr/local/bin/node: 1: Syntax error: "(" unexpected

steve@atom:~$ bash /usr/local/bin/node -v
/usr/local/bin/node: /usr/local/bin/node: cannot execute binary file
`,
  },
  {
    name: 'p3-java-classpath', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/11840059/how-to-run-a-java-program-under-cron-and-import-the-jars',
    logs: `Exception in thread "main" java.lang.NoClassDefFoundError: com/gargoylesoftware/htmlunit/WebClient
`,
  },
  {
    name: 'p3-scp-agent', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/5499680/why-does-this-bash-script-work-at-console-but-fails-when-run-as-a-cron-job',
    logs: `#!/bin/bash

cd /home/oompah/scripts/tests/
scp -P 12345 file1 oompah@someserver.com:~/uploads

if scp -P 12345 oompah@someserver.com:/path/to/file2.dat local.dat >&/dev/null ; then 
    echo "INFO: transfer OK" ; 
else 
    echo "ERROR: transfer failed" ; 
fi

---
ERROR: transfer failed

---
Permission denied (publickey).
lost connection

---
Executing: program /usr/bin/ssh host 12.34.56.78, user oompah, command scp -v -t ~/uploads
OpenSSH_5.3p1 Debian-3ubuntu6, OpenSSL 0.9.8k 25 Mar 2009
debug1: Reading configuration data /etc/ssh/ssh_config
debug1: Applying options for *
debug1: Connecting to 12.34.56.78 [12.34.56.78] port 12345.
debug1: Connection established.
debug1: identity file /home/oompah/.ssh/id_rsa type 1
debug1: Checking blacklist file /usr/share/ssh/blacklist.RSA-2048
debug1: Checking blacklist file /etc/ssh/blacklist.RSA-2048
debug1: Remote protocol version 2.0, remote software version OpenSSH_5.3p1 Debian-3ubuntu3
debug1: match: OpenSSH_5.3p1 Debian-3ubuntu3 pat OpenSSH*
debug1: Enabling compatibility mode for protocol 2.0
debug1: Local version string SSH-2.0-OpenSSH_5.3p1 Debian-3ubuntu6
debug1: SSH2_MSG_KEXINIT sent
debug1: SSH2_MSG_KEXINIT received
debug1: kex: server->client aes128-ctr hmac-md5 none
debug1: kex: client->server aes128-ctr hmac-md5 none
debug1: SSH2_MSG_KEX_DH_GEX_REQUEST(1024<1024<8192) sent
debug1: expecting SSH2_MSG_KEX_DH_GEX_GROUP
debug1: SSH2_MSG_KEX_DH_GEX_INIT sent
debug1: expecting SSH2_MSG_KEX_DH_GEX_REPLY
debug1: Host '[12.34.56.7`,
  },
  {
    name: 'p3-tar-path-spaces', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/24649526/how-to-create-tar-file-in-date-wise-folder-linux',
    logs: `tar: /opt/lampp/htdocs/abc/app/2014_07_09/con_2014.07.09.54.168668034.tar: Cannot open: No such file or directory
tar: Error is not recoverable: exiting now
`,
  },
  {
    name: 'p3-venv-activate-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/27857846/scheduling-django-command-within-virtual-env-with-cron',
    logs: `/opt/django/myproj/myapp/cron/myscript.sh: line 2: /opt/virtualenvs/myvirtualenv
/bin/activate
: No such file or directory
Traceback (most recent call last):
  File "/opt/django/myproj/manage.py", line 10, in <module>
    execute_from_command_line(sys.argv)
  File "/usr/local/lib/python2.7/dist-packages/django/core/management/__init__.py", line 399, in execute_from_command_line
    utility.execute()
  File "/usr/local/lib/python2.7/dist-packages/django/core/management/__init__.py", line 392, in execute
    self.fetch_command(subcommand).run_from_argv(self.argv)
  File "/usr/local/lib/python2.7/dist-packages/django/core/management/__init__.py", line 261, in fetch_command
    commands = get_commands()
  File "/usr/local/lib/python2.7/dist-packages/django/core/management/__init__.py", line 107, in get_commands
    apps = settings.INSTALLED_APPS
  File "/usr/local/lib/python2.7/dist-packages/django/conf/__init__.py", line 54, in __getattr__
    self._setup(name)
  File "/usr/local/lib/python2.7/dist-packages/django/conf/__init__.py", line 49, in _setup
    self._wrapped = Settings(settings_module)
  File "/usr/local/lib/python2.7/dist-packages/django/conf/__init__.py", line 132, in __init__
    % (self.SETTINGS_MODULE, e)
ImportError: Could not import settings 'myproj.settings

' (Is it on sys.path? Is there an import error in the settings file?): No module named settings
`,
  },
  {
    name: 'p3-activate-path-bashrc', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/45743633/running-a-bash-script-from-a-cronjob-fails-with-no-such-file-or-directory',
    logs: `/path/to/script/send.bash: line 2: activate: No such file or directory
`,
  },
  {
    name: 'p3-git-push-root-home', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/20852577/cron-git-push-with-ssh-key',
    logs: `Permission denied (publickey)
fatal: The remote end hung up unexpectedly
`,
  },
  {
    name: 'p3-notify-send-display', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/20174784/cron-scheduler-of-python-script-using-notify-send',
    logs: `/usr/lib/python2.7/dist-packages/gtk-2.0/gtk/__init__.py:57: GtkWarning: could not open display
warnings.warn(str(e), _gtk.Warning)

** (other.py:16509): WARNING **: Command line \`dbus-launch --autolaunch=91bdcc4a583bfb56734fbe1200000010 --binary-syntax --close-stderr' exited with non-zero exit status 1: Autolaunch error: X11 initialization failed.\\n
`,
  },
]
