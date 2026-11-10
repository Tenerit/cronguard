// Jeu de TEST « public5 » : pannes de jobs planifiés publiées sur StackExchange, collectées le
// 2026-11-10 APRÈS tous les changements du 2026-11-08 (97 fiches, codes officiels, vérification de commande,
// corrections par morceaux), par eval/collect-public5.mjs (30 requêtes écrites le 2026-11-08, premier résultat
// avec log d'erreur et réponse acceptée, URLs de public2-4 exclues). 12 gardés ; 18 écartés (raison ci-dessous).
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée. Ne JAMAIS régler sur ce jeu.
//
// Écartés : #1 pas un job planifié (npm install) · #4 pas de log d'erreur (code) · #7 pas de log d'erreur (code) · #8 question Kubernetes, pas une panne · #9 réponse sans cause établie · #10 cause seulement supposée · #11 pas une panne · #12 pas un job planifié · #16 pas de log d'erreur (script) · #18 réponse sans cause établie · #19 question Kubernetes, pas une panne · #20 pas une panne · #21 pas une panne · #23 pas un job planifié · #26 pas un job planifié · #27 pas de log d'erreur (configuration) · #28 pas une panne · #29 pas de log d'erreur (code)
import type { EvalCase } from './cases'

export const PUBLIC5_CASES: EvalCase[] = [
  {
    name: 'p5-ruby-shebang-127', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/15877567/cron-error-grandchild-26321-failed-with-exit-status-127',
    command: `-l -c 'cd /home/harssh/Documents/Aptana\\ Studio\\ 3\\ Workspacwinbox/wineboxnew && RAILS_ENV=production bundle exec rake page:publish --silent'`,
    logs: `(CRON) error (grandchild #26321 failed with exit status 127)`,
  },
  {
    name: 'p5-crontab-percent-expr', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/16402147/cron-error-grandchild-874-failed-with-exit-status-2',
    command: `root expr \`date +%U\` % 2 >/dev/null || /home/joe/Scripts/test1.sh`,
    logs: `/USR/SBIN/CRON[874]: (root) CMD (expr \`date +)
/USR/SBIN/CRON[872]: (CRON) error (grandchild #874 failed with exit status 2)
/USR/SBIN/CRON[872]: (CRON) info (No MTA installed, discarding output)
`,
  },
  {
    name: 'p5-cronhourly-crontab-syntax', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/46463167/cron-job-sometimes-fails-with-error-by-curl',
    command: `curl --silent http://www....cron_script.php >  /dev/null`,
    logs: `/etc/cron.hourly/curl:
/etc/cron.hourly/curl: line 5: bin: command not found
run-parts: /etc/cron.hourly/curl exited with return code 127
`,
  },
  {
    name: 'p5-svn-sshpass-noninteractive', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/52374697/sshpass-svn-commit-in-script-works-when-script-run-manually-fails-when-run-w',
    command: `/bin/bash /home/svn/xjdhdr-random-code/Bash/auto_update_svn.bash`,
    logs: `auto_update_svn.bash:
16 Sep 2018 14:00 UTC
svn: E215004: Authentication failed and interactive prompting is disabled; see the --force-interactive option
svn: E215004: Commit failed (details follow):
svn: E215004: No more credentials or we tried too many times.
Authentication failed
svn: E200042: Additional errors:
svn: E120191: Error running context: The requested authentication type(s) are not supported

---
#!/bin/bash

PATH=$PATH:$(sed -n '/PATH=/s/^.*=// ; s/\\"//gp' '/etc/environment')

sDateTime=$(date -u +"%d %b %Y %H:%M")
{
        # Commit changes
        #   SourceForge
        sshpass -f "$HOME/sourceforge_password.txt" rsync -qcruz -e ssh --exclude=.svn '/home/svn/xjdhdr-random-code/' \\
                'xjdhdr@frs.sourceforge.net:/home/frs/project/xjdhdr-random-code/'

        #   GitHub
        svn status '/home/svn/xjdhdr-random-code/' | grep ^\\? | cut -c2- | while IFS='' read -r sFile
        do
                svn add "$sFile"
        done
        sshpass -v -f "$HOME/github_password.txt" svn commit --username=XJDHDR --no-auth-cache \\
                -m 'Automatic update of Adblock, Bash + blocklist files' '/home/svn/xjdhdr-random-code'
} 2> '/tmp/stderr-contents-auto_update_svn.txt'

if [ -f '/tmp/stderr-contents-auto_update_svn.txt' ]
then
        errors+=$(cat '/tmp/stderr-contents-auto_update_svn.txt')
        rm -f '/tmp/stderr-contents-auto_update_svn.txt'
fi


if [ -n "$errors" ]
then
        printf 'auto_update_svn.bash:\\n%s UTC\\n'"$errors"'\\n\\n' "$sDa`,
  },
  {
    name: 'p5-perl-env-login-shell', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/70510721/how-can-a-script-be-made-to-run-automatically-every-hour-such-that-it-performs',
    command: `$HOME/u/kh/bin/z.pl >> $HOME/tmplocal/DUMS/z.pl/out.txt 2>&1`,
    logs: `> /usr/bin/env perl  -e 'use Time::Local qw( timelocal_posix timegm_posix );'
> /usr/bin/perl  -e 'use Time::Local qw( timelocal_posix timegm_posix );'
"timelocal_posix" is not exported by the Time::Local module
 "timegm_posix" is not exported by the Time::Local module
Can't continue after import errors at -e line 1.
BEGIN failed--compilation aborted at -e line 1.

---
------------------------2021-12-27 Mon 12:52:22------------------------
HOME: /Users/kpr
USER: kpr
PATH: /Users/kpr/u/kh/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Library/TeX/texbin:/Library/Apple/usr/bin
$VAR1 = {
          'err' => '',
          'lastcmd' => 'rsync --itemize-changes --update --stats --compress --recursive --times --perms --links --verbose --exclude=.swp --exclude=.swo --exclude=.*.swp --exclude=.*.swo --exclude=JAW.gnucash.LCK --exclude=JAW.gnucash.LNK --exclude=JAW.gnucash*log /Users/kpr/TEMPBACKUP /Volumes/oom/quick',
          'out' => 'building file list ... done
.d..t.... TEMPBACKUP/2021/2021d/
>f+++++++ TEMPBACKUP/2021/2021d/2021-12-27-125000-z.pl
>f+++++++ TEMPBACKUP/2021/2021d/2021-12-27-125026-z.pl
>f+++++++ TEMPBACKUP/2021/2021d/2021-12-27-125055-z.pl
>f+++++++ TEMPBACKUP/2021/2021d/2021-12-27-125211-z.pl

Number of files: 184014
Number of files transferred: 4
Total file size: 60206266413 bytes
Total transferred file size: 7596 bytes
Literal data: 7596 bytes
Matched data: 0 bytes
File list size: 7048863
File list generation time: 16.863 seconds
File list transfer time: 0.000`,
  },
  {
    name: 'p5-python-version-import', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/35110964/python-script-error-with-cron',
    command: `python /Users/jamesrusso/Documents/TorMeasure/TorMeasurementProject/getConsensus.py`,
    logs: `ImportError: No module named stem.descriptor`,
  },
  {
    name: 'p5-php-set-time-limit', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/9512413/php-cron-job-premature-termination-due-to-maximum-execution-time-fatal-error',
    command: `/usr/bin/php /path/file.php`,
    logs: `/var/log/php_errors.log
---
[01-Mar-2012 00:32:57 UTC] PHP Fatal error: Maximum execution time of 60 seconds exceeded in /path/file.php on line 2079
`,
  },
  {
    name: 'p5-env-node-bashrc', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/23102328/cron-job-error-usr-bin-env-node-no-such-file-or-directory',
    command: `. $HOME/.bashrc sh /path/to/cronjob.sh`,
    logs: ` /usr/bin/env: node: No such file or directory
`,
  },
  {
    name: 'p5-unixcat-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/37122579/cron-shows-me-a-script-error',
    logs: `/root/reload-cisco.sh: line 4: unixcat: command not found
`,
  },
  {
    name: 'p5-macos-tcc-trash', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/77815914/macos-sonoma-cron-job-doesnt-have-access-to-trash-even-though-it-has-full-sy',
    command: `/Users/me/miniforge3/envs/dev/bin/fclean >> /dev/null 2>&1`,
    logs: `PermissionError: [Errno 1] Operation not permitted: '/Users/me/.Trash'
---
def clean_folder(folder: Path, _time: int = days(30)) -> None:
    """
    If a file in the specified path hasn't been accessed in the specified days; remove it.

    Args:
        folder (Path): Path to folder to iterate through
        _time (int): optional time parameter to pass as expiration time.

    Returns:
        None
    """

    for file in folder.iterdir():
        if expired(file, _time):
            try:
                rm_files(file)
            except PermissionError as permission:
                logging.exception(permission)
                continue
            except Exception as _err:
                logging.exception(_err)
                continue
`,
  },
  {
    name: 'p5-proxy-env-cron', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/60793373/urllib-request-returning-connection-timout-when-executed-with-cron-centos',
    command: `/usr/bin/python3.6 "/home/ngabioud/Scripts Python VM/ClickTableau.py"`,
    logs: `  File "/usr/lib64/python3.6/urllib/request.py", line 1318, in do_open
    encode_chunked=req.has_header('Transfer-encoding'))
  File "/usr/lib64/python3.6/http/client.py", line 1254, in request
    self._send_request(method, url, body, headers, encode_chunked)
  File "/usr/lib64/python3.6/http/client.py", line 1300, in _send_request
    self.endheaders(body, encode_chunked=encode_chunked)
  File "/usr/lib64/python3.6/http/client.py", line 1249, in endheaders
    self._send_output(message_body, encode_chunked=encode_chunked)
  File "/usr/lib64/python3.6/http/client.py", line 1036, in _send_output
    self.send(msg)
  File "/usr/lib64/python3.6/http/client.py", line 974, in send
    self.connect()
  File "/usr/lib64/python3.6/http/client.py", line 1407, in connect
    super().connect()
  File "/usr/lib64/python3.6/http/client.py", line 946, in connect
    (self.host,self.port), self.timeout, self.source_address)
  File "/usr/lib64/python3.6/socket.py", line 724, in create_connection
    raise err
  File "/usr/lib64/python3.6/socket.py", line 713, in create_connection
    sock.connect(sa)
TimeoutError: [Errno 110] Connection timed out
`,
  },
  {
    name: 'p5-wget-ssl-status5', category: 'network', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/34393172/cron-job-linux-apache-ssl',
    command: `wget -O --q -t 1 http://domain:8280/folder/cron.php`,
    logs: `grandchild #20349 failed with status 5
`,
  },
]
