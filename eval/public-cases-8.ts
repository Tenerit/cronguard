// Jeu de TEST « public8 » : moitié test de eval/public8-raw.json (collecte 2026-11-13, eval/collect-public8.mjs, découpe
// eval/split-public8.mjs, graine 20261113). Les fiches du 13/11 ont été réglées sur l'AUTRE moitié uniquement.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée, écrites avant tout run. Ne JAMAIS régler sur ce jeu.
//
// Écartés : #0 pas de log d'erreur (ligne de crontab) · #2 pas un job planifié (test kitchen) · #3 pas de log d'erreur (code) · #4 pas un job planifié (config SSH) · #5 pas de log d'erreur (code) · #8 pas de log d'erreur (code) · #9 pas un job planifié (GitHub Actions) · #13 pas un job planifié (tâche Ansible) · #17 pas une panne de job cron (format telegraf) · #19 cause non établie (contournement : renommer le fichier) · #20 pas une panne (sortie mail de cron) · #21 pas un job planifié (validation de manifeste) · #22 pas de log d'erreur (code) · #24 pas de log d'erreur (code) · #25 pas de log d'erreur (code)
import type { EvalCase } from './cases'

export const PUBLIC8_CASES: EvalCase[] = [
  {
    name: 'p8-mysqldump-invalid-view', category: 'database', severity: 'medium', exitCode: 2,
    source: 'https://serverfault.com/questions/263197/making-a-more-resilient-mysql-backup-script',
    logs: `mysqldump: Couldn't execute 'show create table \`v\`': View 'foo_breakage.v' 
references invalid table(s) or column(s) or function(s) or definer/invoker of 
view lack rights to use them (1356)
`,
  },
  {
    name: 'p8-python-relative-tar', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/25206541/python-ioerror-errno-2-can-permissions-cause-an-ioerror-errno-2-when-usin',
    logs: `IOError: [Errno 2] No such file or directory: 'directory/filename_2014-08-08.tar.gz'

---
fname = directory + "_" + str(strftime("%Y-%m-%d_", localtime()))+".tar.gz"
tar = tarfile.open(archived_model_dir + fname.replace("/",""), "w:gz") # this line raises error
for input_file in os.listdir(directory):
    if os.path.isfile(directory + input_file):
        if not input_file.endswith('.pyc'):  
            tar.add(directory + input_file) # archive all but .pyc
        os.remove(directory + input_file)
    elif os.path.exists(directory + input_file): # delete subfolders 
        shutil.rmtree(directory + input_file)
`,
  },
  {
    name: 'p8-scrapy-venv-cron', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/35911162/scrapy-python-throws-importerror-when-running-with-cron',
    logs: `Traceback (most recent call last):
  File "/Users/som/scrapy_testing/scrapy_testing/spiders/hm_spiders.py", line 2, in <module>
    import scrapy
  File "/Library/Python/2.7/site-packages/scrapy/__init__.py", line 48, in <module>
    from scrapy.spiders import Spider
  File "/Library/Python/2.7/site-packages/scrapy/spiders/__init__.py", line 10, in <module>
    from scrapy.http import Request
  File "/Library/Python/2.7/site-packages/scrapy/http/__init__.py", line 12, in <module>
    from scrapy.http.request.rpc import XmlRpcRequest
  File "/Library/Python/2.7/site-packages/scrapy/http/request/rpc.py", line 7, in <module>
    from six.moves import xmlrpc_client as xmlrpclib
ImportError: cannot import name xmlrpc_client
`,
  },
  {
    name: 'p8-magento-php-run-by-sh', category: 'code', severity: 'medium', exitCode: 2,
    source: 'https://stackoverflow.com/questions/51287631/magento-cron-errors',
    logs: `/var/www/vhosts/WEBSITE.com/httpdocs/cron.php: line 1: ?php: No such file or 
directory
/var/www/vhosts/WEBSITE.com/httpdocs/cron.php: line 2: /bin: Is a directory
/var/www/vhosts/WEBSITE.com/httpdocs/cron.php: line 3: conf: command not 
found
/var/www/vhosts/WEBSITE.com/httpdocs/cron.php: line 4: conf: command not 
found
/var/www/vhosts/WEBSITE.com/httpdocs/cron.php: line 5: conf: command not 
found
/var/www/vhosts/WEBSITE.com/httpdocs/cron.php: line 6: conf: command not 
found
/var/www/vhosts/WEBSITE.com/httpdocs/cron.php: line 7: syntax error near 
unexpected token \`('
/var/www/vhosts/WEBSITE.com/httpdocs/cron.php: line 7: \` * This source file 
is subject to the Open Software License (OSL 3.0)'

---
/var/www/vhosts/WEBSITE.com/httpdocs/cron.sh: line 48: syntax error near 
unexpected token \`fi'
/var/www/vhosts/WEBSITE.com/httpdocs/cron.sh: line 48: \`fi'

---
<?php
/**
 * @copyright  Copyright (c) 2006-2016 X.commerce, Inc. and affiliates (http://www.magento.com)
 * @license    http://opensource.org/licenses/osl-3.0.php  Open Software License (OSL 3.0)
 */

// Change current directory to the directory of current script
chdir(dirname(__FILE__));

require 'app/bootstrap.php';
require 'app/Mage.php';

if (!Mage::isInstalled()) {
    echo "Application is not installed yet, please complete install wizard first.";
    exit;
}

// Only for urls
// Don't remove this
$_SERVER['SCRIPT_NAME'] = str_replace(basename(__FILE__), 'index.php', $_SERVER['SCRIPT_NAME']);
$_SERVER['SCRIPT_FILE`,
  },
  {
    name: 'p8-pm2-home-env', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/47248328/create-cron-to-restart-pm2-instance-fails',
    logs: `From root@ip120.ip-46-105-248.eu  Sun Nov 12 11:23:01 2017
Return-Path: <root@ip120.ip-46-105-248.eu>
X-Original-To: root
Delivered-To: root@ip120.ip-46-105-248.eu
Received: by ip120.ip-46-105-248.eu (Postfix, from userid 0)
    id E84CA100921; Sun, 12 Nov 2017 11:23:01 +0000 (WET)
From: "(Cron Daemon)" <root@ip120.ip-46-105-248.eu>
To: root@ip120.ip-46-105-248.eu
Subject: Cron <root@ip120> /usr/bin/node /usr/bin/pm2 restart 4
Content-Type: text/plain; charset=UTF-8
Auto-Submitted: auto-generated
Precedence: bulk
X-Cron-Env: <XDG_SESSION_ID=4300>
X-Cron-Env: <XDG_RUNTIME_DIR=/run/user/0>
X-Cron-Env: <LANG=en_US.UTF-8>
X-Cron-Env: <SHELL=/bin/sh>
X-Cron-Env: <HOME=/root>
X-Cron-Env: <PATH=/usr/bin:/bin>
X-Cron-Env: <LOGNAME=root>
X-Cron-Env: <USER=root>
Message-Id: <20171112112301.E84CA100921@ip120.ip-46-105-248.eu>
Date: Sun, 12 Nov 2017 11:23:01 +0000 (WET)

Use --update-env to update environment variables
[PM2] Applying action restartProcessId on app [4](ids: 4)
[PM2][ERROR] Process 4 not found
┌──────────┬────┬──────┬─────┬────────┬─────────┬────────┬─────┬─────┬──────────┐
│ App name │ id │ mode │ pid │ status │ restart │ uptime │ cpu │ mem │ watching │
└──────────┴────┴──────┴─────┴────────┴─────────┴────────┴─────┴─────┴──────────┘
 Module activated
┌───────────────┬─────────┬────────────┬────────┬─────────┬─────┬─────────────┐
│ Module        │ version │ target PID │ status │ restart │ cpu │ memory      │
├───────────────┼─────────┼────────────┼────────┼─────────┼─────`,
  },
  {
    name: 'p8-selenium-no-display', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/7275932/how-to-run-rspec-tests-using-selenium-through-cron',
    logs: `Selenium::WebDriver::Error::WebDriverError:
unable to obtain stable firefox connection in 60 seconds (127.0.0.1:7055)
# ./spec/requests/log_in_spec.rb:22:in \`block (2 levels) in <top (required)>'
`,
  },
  {
    name: 'p8-wget-not-installed', category: 'dependency', severity: 'medium', exitCode: 127,
    source: 'https://stackoverflow.com/questions/26090025/cron-job-in-plesk',
    logs: `wget command not found`,
  },
  {
    name: 'p8-python-not-in-path', category: 'dependency', severity: 'medium', exitCode: 127,
    source: 'https://stackoverflow.com/questions/78722918/python-not-recognized-in-scripts-executed-via-cron',
    logs: `line 53: python: command not found
`,
  },
  {
    name: 'p8-laravel-cron-six-fields', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/54484841/working-cron-with-laravel-on-a-shared-server-gives-this-error-why',
    logs: `[root@s19 ~]# /usr/local/bin/php /home/user/myweb/artisan schedule:run

   InvalidArgumentException  : 5 is not a valid position

  at /home/nigmacod/nigmacode/vendor/dragonmantank/cron-expression/src/Cron/FieldFactory.php:46
    42|                 case 4:
    43|                     $this->fields[$position] = new DayOfWeekField();
    44|                     break;
    45|                 default:
  > 46|                     throw new InvalidArgumentException(
    47|                         $position . ' is not a validposition'
    48|                     );
    49|             }
    50|         }

  Exception trace:

  1   Cron\\FieldFactory::getField()
      /home/user/myweb/vendor/dragonmantank/cron-expression/src/Cron/CronExpression.php:153

  2   Cron\\CronExpression::setPart("*")
      /home/user/myweb/vendor/dragonmantank/cron-expression/src/Cron/CronExpression.php:136
`,
  },
  {
    name: 'p8-perl-inc-env-var', category: 'dependency', severity: 'medium', exitCode: 2,
    source: 'https://stackoverflow.com/questions/753670/why-cant-my-perl-script-load-a-module-when-run-by-cron',
    logs: `Can't locate Plibdata.pm in @INC (@INC contains: /install/lib /opt/perl58/lib/5.8.8/IA64.ARCHREV_0-thread-multi /opt/perl58/lib/5.8.8 /opt/perl58/lib/site_perl/5.8.8/IA64.ARCHREV_0-thread-multi /opt/perl58/lib/site_perl/5.8.8 /opt/perl58/lib/site_perl .) at ./x line 5.

BEGIN failed--compilation aborted at ./x line 5.
`,
  },
  {
    name: 'p8-r-here-working-dir', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/65425366/here-issue-in-r-scripts',
    logs: `here() starts at /home/user
Error in abs_path(input) : 
The file '/home/user/dataFetcher.Rmd' does not exist.

---
$ cd /home/user/scrc
$ Rscript ./myGoodScripts/dataFetcherMailer.R 
here() starts at /home/user/src
Error in abs_path(input) : 
The file '/home/user/src/dataFetcher.Rmd' does not exist.
Calls: <Anonymous> -> setwd -> dirname -> abs_path

---
here2 <- function(type = 'dir') {
  args <- commandArgs(trailingOnly = FALSE)
  if ("RStudio" %in% args) {
    filepath <- rstudioapi::getActiveDocumentContext()$path
  } else if ("interactive" %in% args) {
    file_arg <- "--file="
    filepath <- sub(file_arg, "", grep(file_arg, args, value = TRUE))
  } else if ("--slave" %in% args) {
    string <- args[6]
    mBtwSquotes <- "(?<=')[^']*[^']*(?=')"
    filepath <- regmatches(string,regexpr(mBtwSquotes,string,perl = T))
  } else if (pmatch("--file=" ,args)) {
    file_arg <- "--file="
    filepath <- sub(file_arg, "", grep(file_arg, args, value = TRUE))
  } else {
    if (type == 'dir') {
      filepath <- '.'
      return(filepath)
    } else {
      filepath <- "error"
      return(filepath)
    }
  }
  if (type == 'dir') {
    filepath <- dirname(filepath)
  }  
  return(filepath)
}

---
here2 <- function() {
  args <- commandArgs(trailingOnly = FALSE)
  if ("RStudio" %in% args) {
    # R script called from Rstudio with "source file button"
    filepath <- rstudioapi::getActiveDocumentContext()$path
  } else if ("--slave" %in% args) {
    # Rmd file called from Rstudio wi`,
  },
]
