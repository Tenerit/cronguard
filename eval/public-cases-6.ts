// Jeu de TEST « public6 » : pannes de jobs planifiés publiées sur StackExchange, collectées le 2026-11-10 par
// eval/collect-public6.mjs (40 requêtes, premier résultat avec log d'erreur et réponse acceptée, URLs de public2-5 et du
// corpus exclues), gelées brutes (be20cdb) avant les changements testés. 15 gardés ; écartés ci-dessous.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée, écrites avant tout run. Ne JAMAIS régler sur ce jeu.
//
// Écartés : #0 pas de log d'erreur (code) · #1 pas de log d'erreur (code) · #3 réponse sans cause établie (liste de vérifications) · #4 aucun résultat · #5 réponse sans cause établie · #7 pas de log d'erreur (code) · #10 pas un job planifié · #11 pas une panne (question de méthode) · #12 aucun résultat · #13 aucun résultat · #15 réponse sans cause établie (contournement) · #18 aucun résultat · #20 pas un job planifié (YAML Ansible) · #23 pas un job planifié (script de mise à jour de crontab) · #27 cas malveillant (reverse shell) · #28 pas de log d'erreur (code) · #30 aucun résultat · #31 aucun résultat · #32 cause seulement supposée · #33 cause seulement supposée · #34 réponse sans cause établie · #35 pas une panne de job (requête SQL) · #36 pas de log d'erreur (code) · #37 aucun résultat · #39 pas de log d'erreur (code)
import type { EvalCase } from './cases'

export const PUBLIC6_CASES: EvalCase[] = [
  {
    name: 'p6-sysctl-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/42285518/sh-sysctl-command-not-found-for-mac-os-x-running-a-cron-job',
    command: `PATH=$PATH:/usr/sbin PYTHONPATH=/Library/Frameworks/Python.framework/Versions/2.7/lib/python2.7/site-packages/ /usr/bin/python2.7 ~/.../script.py`,
    logs: `sh: sysctl   Command Not Found`,
  },
  {
    name: 'p6-rvm-gem-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/20954298/gem-not-found-in-ruby-cron-job-in-rvm-env',
    command: `BASH_ENV=~/.bash_profile && /bin/bash -c '~/deggy/onlineGW.rb'`,
    logs: ` X-Cron-Env: <SHELL=/bin/bash>
 X-Cron-Env: <PATH=/usr/bin:/bin>
 X-Cron-Env: <LOGNAME=sam>
 X-Cron-Env: <USER=sam>
 X-Cron-Env: <HOME=/Users/sam>
 Date: Mon,  6 Jan 2014 03:15:00 -0600 (CST)
 /Users/sam/deggy/onlineGW.rb:3:in \`require': no such file to load -- nokogiri (LoadError)
`,
  },
  {
    name: 'p6-java-noclassdef-pom', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/34430733/is-it-possible-to-do-a-java-cron-job-in-order-to-export-a-bigquery-table',
    logs: `Error for /cron/gaejcronjob 
java.lang.NoClassDefFoundError: com/google/api/client/json/JsonFactory

---
package com.gaejexperiments.cron;

import java.io.IOException;
import java.util.logging.Logger;

import javax.servlet.ServletException;
import javax.servlet.http.*;

import com.gaejexperiments.cron.BigQuery;

@SuppressWarnings("serial")
public class GAEJCronServlet extends HttpServlet {
    private static final Logger _logger = Logger.getLogger(GAEJCronServlet.class.getName());

    public void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {

        try {
            _logger.info("Cron Job has been executed");

            BigQuery bigquery = new BigQuery();

            bigquery.exportTable();

        } catch (Exception ex) {
            //_logger.info(ex);
        }
    }

    @Override
    public void doPost(HttpServletRequest req, HttpServletResponse resp) throws ServletException, IOException {
        doGet(req, resp);
    }
}

---
package com.gaejexperiments.cron;

import com.google.api.client.googleapis.auth.oauth2.GoogleCredential;
import com.google.api.client.http.HttpTransport;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.JsonFactory;
import com.google.api.client.json.jackson.JacksonFactory;
import com.google.api.services.bigquery.Bigquery;
import com.google.api.services.bigquery.model.ErrorProto;
import com.google.api.services.bigquery.model.Job;
import com.google.api.services.bigque`,
  },
  {
    name: 'p6-rake-bundle-env', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/39037735/rake-command-not-running-from-cron-job-but-works-otherwise',
    command: `/bin/bash -l -c "cd /home/deploy/railsapp && rake spec >> cron.log 2>&1"`,
    logs: `/bin/bash: bundle: command not found


/bin/bash: rake: command not found


rake aborted!
Bundler::GemNotFound: Could not find rake-11.2.2 in any of the sources
/home/deploy/railsapp/config/boot.rb:3:in \`<top (required)>'
/home/deploy/railsapp/config/application.rb:1:in \`<top (required)>'
/home/deploy/railsapp/Rakefile:4:in \`<top (required)>'
LoadError: cannot load such file -- bundler/setup
/home/deploy/railsapp/config/boot.rb:3:in \`<top (required)>'
/home/deploy/railsapp/config/application.rb:1:in \`<top (required)>'
/home/deploy/railsapp/Rakefile:4:in \`<top (required)>'
(See full trace by running task with --trace)


    bundler: failed to load command: rake (/usr/local/bin/rake)
        Bundler::GemNotFound: Could not find rake-11.2.2 in any of the sources
          /usr/local/lib/ruby/gems/2.3.0/gems/bundler-1.12.5/lib/bundler/spec_set.rb:95:in \`block in materialize'
          /usr/local/lib/ruby/gems/2.3.0/gems/bundler-1.12.5/lib/bundler/spec_set.rb:88:in \`map!'
          /usr/local/lib/ruby/gems/2.3.0/gems/bundler-1.12.5/lib/bundler/spec_set.rb:88:in \`materialize'
          /usr/local/lib/ruby/gems/2.3.0/gems/bundler-1.12.5/lib/bundler/definition.rb:140:in \`specs'
          /usr/local/lib/ruby/gems/2.3.0/gems/bundler-1.12.5/lib/bundler/definition.rb:185:in \`specs_for'
          /usr/local/lib/ruby/gems/2.3.0/gems/bundler-1.12.5/lib/bundler/definition.rb:174:in \`requested_specs'
          /usr/local/lib/ruby/gems/2.3.0/gems/bundler-1.12.5/lib/bundler/environment.rb:19:in`,
  },
  {
    name: 'p6-pgdump-crlf', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://serverfault.com/questions/511780/postgresql-pgdump-script-on-rhel5-failed-fe-sendauth-no-password-supplieddat',
    logs: `./pg_dump_script.sh
" failed: fe_sendauth: no password supplieddatabase "
pg_dump.bin: *** aborted because of error
./pg_dump_script.sh: line 2: fg: no job control
./pg_dump_script.sh: line 2: --file: command not found
./pg_dump_script.sh: line 3: --table: command not found
./pg_dump_script.sh: line 4: --table: command not found
./pg_dump_script.sh: line 5: --table: command not found
./pg_dump_script.sh: line 6: --table: command not found
./pg_dump_script.sh: line 7: --table: command not found
./pg_dump_script.sh: line 8: --table: command not found
./pg_dump_script.sh: line 9: --table: command not found
./pg_dump_script.sh: line 10: --table: command not found
./pg_dump_script.sh: line 11: --table: command not found
./pg_dump_script.sh: line 12: --table: command not found
./pg_dump_script.sh: line 13: --table: command not found
./pg_dump_script.sh: line 14: --table: command not found
./pg_dump_script.sh: line 15: --table: command not found
./pg_dump_script.sh: line 16: --table: command not found
./pg_dump_script.sh: line 17: --table: command not found
./pg_dump_script.sh: line 18: --table: command not found
./pg_dump_script.sh: line 19: --table: command not found
./pg_dump_script.sh: line 20: --table: command not found
./pg_dump_script.sh: line 21: --table: command not found
./pg_dump_script.sh: line 22: --table: command not found
./pg_dump_script.sh: line 23: --table: command not found
./pg_dump_script.sh: line 24: --table: command not found
./pg_dump_script.sh: line 25: --ta`,
  },
  {
    name: 'p6-redis-dump-umask', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/13364713/changing-default-file-permission-on-redis-dump',
    logs: `gzip: /var/lib/redis/dump.rdb: Permission denied
`,
  },
  {
    name: 'p6-wget-503-auth', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/39349863/wget-error-503-while-chrome-works',
    logs: `root@domain:/home/admin/web/domain.com/public_html/# wget http://www.domain.com/index.php?route=module/marketplace&action=run_queue
[1] 30283
root@domain:/home/admin/web/domain.com/public_html/# --2016-09-06 16:02:42--  http://www.domain.com/index.php?route=module/marketplace
Resolving www.domain.com (www.domain.com)... 46.10.20.30
Connecting to www.domain.com (www.domain.com)|46.10.20.30|:80... connected.
HTTP request sent, awaiting response... 503 Service Unavailable
2016-09-06 16:02:42 ERROR 503: Service Unavailable.
`,
  },
  {
    name: 'p6-logrotate-create-perms', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/64357138/why-does-rsyslog-fail-to-start-after-logrotate',
    logs: `Jul 31 00:00:01 hostname rsyslogd[26343]: file '/home/ubuntu/remote_logs/celery.log': open error: Permission denied [v8.32.0 try http://www.rsyslog.com/e/2433 ]
Aug 01 00:00:01 hostname rsyslogd[26343]: file '/home/ubuntu/remote_logs/celery.log': open error: Permission denied [v8.32.0 try http://www.rsyslog.com/e/2433 ]
Aug 02 00:00:04 hostname rsyslogd[26343]: file '/home/ubuntu/remote_logs/nginx.log': open error: Permission denied [v8.32.0 try http://www.rsyslog.com/e/2433 ]
Aug 09 00:00:01 hostname rsyslogd[26343]: file '/home/ubuntu/remote_logs/celery.log': open error: Permission denied [v8.32.0 try http://www.rsyslog.com/e/2433 ]
Aug 10 00:00:01 hostname rsyslogd[26343]: file '/home/ubuntu/remote_logs/django.log': open error: Permission denied [v8.32.0 try http://www.rsyslog.com/e/2433 ]
Aug 10 00:00:01 hostname rsyslogd[26343]: imfile: error with inotify API, ignoring file '/home/ubuntu/remote_logs/django.log': Permission denied [v8.32.0]
Aug 16 00:00:01 hostname rsyslogd[26343]: file '/home/ubuntu/remote_logs/celery.log': open error: Permission denied [v8.32.0 try http://www.rsyslog.com/e/2433 ]
Aug 16 00:00:02 hostname rsyslogd[26343]: file '/home/ubuntu/remote_logs/django.log': open error: Permission denied [v8.32.0 try http://www.rsyslog.com/e/2433 ]
Aug 19 00:00:03 hostname rsyslogd[856]: imfile: error with inotify API, ignoring file '/home/ubuntu/remote_logs/django.log': Permission denied [v8.32.0]
Aug 20 00:00:06 hostname rsyslogd[856]: imfile: error with inotify`,
  },
  {
    name: 'p6-php-unlink-cwd', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/12693623/cron-job-delete-zip-files-from-a-specific-directory',
    logs: `PHP Warning:  unlink(test.zip) [<a href='function.unlink'>function.unlink</a>]: No such file or directory in /home/MYUSER/public_html/MYSITE/modules/mod_module_gen/cron.php on line 18
`,
  },
  {
    name: 'p6-meteor-fiber', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/30323060/mongodb-colelction-find-in-cron-job-throws-new-errorcan-t-wait-without-a-fibe',
    logs: `Error: Can't wait without a fiber`,
  },
  {
    name: 'p6-date-unquoted-format', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/39145550/date-extra-operand-d-error',
    logs: `awk -vDate=\`date +%b %d %H:%M:%S %Y\` -vDate2=\`date --date="2 minutes ago" +%b %d %H:%M:%S %Y\` '$5 > Date && $5 < Date2' /var/log/dummy.log  | grep "Fatal"
`,
  },
  {
    name: 'p6-sphinx-path', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/3375938/thinking-sphinx-indexing-succeeding-on-command-line-but-failing-in-cron-job',
    command: `cd /var/www/app/current && /usr/local/bin/rake RAILS_ENV=production thinking_sphinx:index >> /var/www/app/current/log/cron.log 2>&1`,
    logs: `Sphinx cannot be found on your system. You may need to configure the following
settings in your config/sphinx.yml file:
  * bin_path
  * searchd_binary_name
  * indexer_binary_name

For more information, read the documentation:
http://freelancing-god.github.com/ts/en/advanced_config.html
`,
  },
  {
    name: 'p6-sudo-root-module', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/46388682/python-sudo-cron-job-not-working-due-to-import-module-error',
    logs: `import BeautifulSoup
ImportError: No module named bs4
`,
  },
  {
    name: 'p6-selenium-firefox-version', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/41044636/selenium-works-only-2-53-6-with-firefox-45-0-2',
    command: `root (apt-get install --allow-downgrades -y  firefox=45.0.2+build1-0ubuntu1)`,
    logs: `selenium.common.exceptions.WebDriverException: Message: Can't load the profile. Profile Dir: /tmp/tmpaQkqJv If you specified a log_file in the FirefoxBinary constructor, check it for details.
`,
  },
  {
    name: 'p6-mysql-2002-disk-full', category: 'resources', severity: 'medium', exitCode: 1,
    source: 'https://serverfault.com/questions/1052255/why-does-my-mysql-server-suddenly-not-start-error-2002-hy000-cant-connect-t',
    logs: `ERROR 2002 (HY000): Can't connect to local MySQL server through socket '/var/run/mysqld/mysqld.sock' (2)
---
● mysql.service - MySQL Community Server
   Loaded: loaded (/lib/systemd/system/mysql.service; enabled; vendor preset: enabled)
   Active: failed (Result: exit-code) since Wed 2021-02-03 12:58:32 UTC; 26min ago
  Process: 2752 ExecStart=/usr/sbin/mysqld --daemonize --pid-file=/run/mysqld/mysqld.pid (code=exited, status=1/FAILURE)
  Process: 2730 ExecStartPre=/usr/share/mysql/mysql-systemd-start pre (code=exited, status=0/SUCCESS)

Feb 03 12:58:32 homestead systemd[1]: mysql.service: Failed with result 'exit-code'.
Feb 03 12:58:32 homestead systemd[1]: Failed to start MySQL Community Server.
Feb 03 12:58:32 homestead systemd[1]: mysql.service: Service hold-off time over, scheduling restart.
Feb 03 12:58:32 homestead systemd[1]: mysql.service: Scheduled restart job, restart counter is at 5.
Feb 03 12:58:32 homestead systemd[1]: Stopped MySQL Community Server.
Feb 03 12:58:32 homestead systemd[1]: mysql.service: Start request repeated too quickly.
Feb 03 12:58:32 homestead systemd[1]: mysql.service: Failed with result 'exit-code'.
Feb 03 12:58:32 homestead systemd[1]: Failed to start MySQL Community Server.

---
var/logs/mysql/error.log
---
2021-02-04T04:50:22.916611Z 0 [Note] Binlog end
2021-02-04T04:50:22.916664Z 0 [Note] Shutting down plugin 'CSV'
2021-02-04T04:50:22.916939Z 0 [Note] /usr/sbin/mysqld: Shutdown complete

2021-02-04T04:50:23.442484Z 0 [Warning] TIMESTAMP`,
  },
]
