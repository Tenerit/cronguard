// Jeu de TEST « public7 » : pannes de jobs planifiés publiées sur StackExchange, collectées le 2026-11-11 par
// eval/collect-public7.mjs (40 requêtes figées avant le travail de précision des fiches, URLs de public2-6 et du corpus
// exclues), gelées brutes (cc9e6ff). 12 gardés ; écartés ci-dessous.
// Étiquettes (eval/rubric.ts) = cause établie par la réponse acceptée, écrites avant tout run. Ne JAMAIS régler sur ce jeu.
//
// Écartés : #1 pas une panne de job (câblage Spring au démarrage) · #2 réponse sans cause établie · #5 réponse sans cause établie (conseil d'optimisation) · #7 cause seulement supposée · #8 aucun résultat · #9 aucun résultat · #10 aucun résultat · #11 pas un job planifié (CI GitLab) · #12 pas de log d'erreur (code) · #14 pas un job planifié (appel REST) · #15 aucun résultat · #19 pas une panne (sortie à masquer) · #20 pas de log d'erreur (code) · #22 pas une panne · #23 pas de log d'erreur (code) · #24 pas de log d'erreur (code) · #25 pas un job planifié (commande manuelle) · #26 pas une panne · #27 pas de log d'erreur (code) · #29 aucun résultat · #32 aucun résultat · #33 pas un job planifié (démarrage Sidekiq) · #34 pas une panne de job · #35 aucun résultat · #36 cause non établie (contournement) · #37 réponse sans cause établie · #38 réponse sans cause établie (outil remplacé) · #39 pas une panne
import type { EvalCase } from './cases'

export const PUBLIC7_CASES: EvalCase[] = [
  {
    name: 'p7-quartz-job-already-stored', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/24747296/restarting-quartz-scheduler-without-getting-an-error',
    logs: `org.quartz.ObjectAlreadyExistsException: Unable to store Job : 'MyTestJob', because one already exists with this identification.

---
Exception in thread "main" org.quartz.impl.jdbcjobstore.LockException: Failure obtaining db row lock: Lock wait timeout exceeded; try restarting transaction [See nested exception: java.sql.SQLException: Lock wait timeout exceeded; try restarting transaction]
    at org.quartz.impl.jdbcjobstore.StdRowLockSemaphore.executeSQL(StdRowLockSemaphore.java:157)
    at org.quartz.impl.jdbcjobstore.DBSemaphore.obtainLock(DBSemaphore.java:113)
    at org.quartz.impl.jdbcjobstore.JobStoreSupport.executeInNonManagedTXLock(JobStoreSupport.java:3780)
    at org.quartz.impl.jdbcjobstore.JobStoreTX.executeInLock(JobStoreTX.java:93)
    at org.quartz.impl.jdbcjobstore.JobStoreSupport.clearAllSchedulingData(JobStoreSupport.java:1956)
    at org.quartz.core.QuartzScheduler.clear(QuartzScheduler.java:1572)
    at org.quartz.impl.StdScheduler.clear(StdScheduler.java:239)
    at com.scs.core.cron.TaskRunner.main(TaskRunner.java:52)

---
  20:04:15,993 DEBUG SimpleSemaphore:132 - Lock 'TRIGGER_ACCESS' retuned by: main
  20:04:15,993 DEBUG JobStoreTX:703 - JobStore background threads started (as scheduler was started).
  20:04:15,994  INFO QuartzScheduler:575 - Scheduler Test-Scheduler_$_NON_CLUSTERED started.
  20:04:15,994 DEBUG JobStoreTX:3933 - MisfireHandler: scanning for misfires...
  20:04:16,000 DEBUG JobStoreTX:3182 - Found 0 triggers that missed their schedul`,
  },
  {
    name: 'p7-php-killed-oom', category: 'resources', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/952868/generic-killed-error-in-php-script',
    logs: `I'm in _getMemberDemographicAttrs<br/>
I'm leaving _getMemberDemographicAttrs<br/>
I'm in _getMemberDemographicAttrs<br/>
I'm leaving _getMemberDemographicAttrs<br/>
I'm in _getMemberDemographicAttrs<br/>
Killed
`,
  },
  {
    name: 'p7-node-heap-parallel', category: 'resources', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/77340007/nodejs-javascript-heap-out-of-memory',
    logs: `Reached heap limit Allocation failed - JavaScript heap out of memory
---
async getPreSignedUrl(key: string): Promise<string> {
  try {
    const data = await this.s3.getSignedUrl('getObject', {
      Key: key,
      Bucket: process.env.BUCKET_ID,
      Expires: 600000 // almost a week
    });
    return data;
  } catch (err) {
    this.logger.error(err);
    return null;
  }
}
`,
  },
  {
    name: 'p7-cron-mail-postfix-domain', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://serverfault.com/questions/409160/sending-mail-to-cron-connects-to-the-wrong-ip',
    logs: `Jul 19 09:29:01 einstein cron[5503]: (postgres) RELOAD (crontabs/postgres)
Jul 19 09:29:01 einstein CRON[12119]: (postgres) CMD (ls /)
Jul 19 09:29:01 einstein postfix/pickup[11890]: 5F43928ACE: uid=109 from=<postgres>
Jul 19 09:29:01 einstein postfix/cleanup[12068]: 5F43928ACE: message-id=<20120719092901.5F43928ACE@einstein.example.com>
Jul 19 09:29:01 einstein postfix/qmgr[11891]: 5F43928ACE: from=<postgres@einstein.example.com>, size=647, nrcpt=1 (queue active)
Jul 19 09:29:01 einstein postfix/smtp[12073]: connect to einstein.example.com[176.5.13.71]:25: Connection refused
Jul 19 09:29:01 einstein postfix/smtp[12073]: connect to einstein.example.com[2a01:5800::96f1]:25: Connection refused
Jul 19 09:29:01 einstein postfix/smtp[12073]: 5F43928ACE: to=<postgres@einstein.example.com>, orig_to=<postgres>, relay=none, delay=0.01, delays=0/0/0/0, dsn=4.4.1, status=deferred (connect to einstein.example.com[2a01:5800::96f1]:25: Connection refused)
`,
  },
  {
    name: 'p7-docker-cron-not-installed', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/78546720/cron-job-and-docker',
    logs: `> [crawler 6/7] RUN crontab /etc/cron.d/cron-config:

0.243 /bin/sh: 1: crontab: not found
`,
  },
  {
    name: 'p7-conda-activate-bashrc', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/66337313/schedule-python-script-with-crontab',
    command: `/mnt/data/sda/user_storage/stocks_etl.sh`,
    logs: `Started stocks_etl.bash
Thu Feb 25 05:20:01 UTC 2021
/home/user/etl_scripts/stocks_etl.bashrc: line 5: activate: No such file or directory
Traceback (most recent call last):
  File "/home/user/etl_scripts/stocks_etl.py", line 4, in <module>
    import numpy as np
ImportError: No module named numpy

---
/mnt/data/sda/user_storage/etl_scripts/stocks_etl.sh: line 2: activate: No such file or directory
Traceback (most recent call last):
  File "/mnt/data/sda/user_storage/etl_scripts/stocks_etl.py", line 1, in <module>
    import numpy as np
ImportError: No module named numpy

---
stocks_etl.py

import numpy as np
import matplotlib.pyplot as plt
import pandas as pd

from yahoofinancials import YahooFinancials

import pymysql

import datetime
import logging

import time

import glob

from sqlalchemy import create_engine

import os

import datetime


# helper functions



# function for creating error logs
# Note: function not currently working, doesn't recognize logger

def error_logger(path):
    
    # adding a timestamp to logname
    ts=str(datetime.datetime.now().isoformat())
    
    # logging.basicConfig(filename='example.log',level=logging.DEBUG)
    logging.basicConfig(filename=path+ts+'.log', level=logging.DEBUG, 
                        format='%(asctime)s %(levelname)s %(name)s %(message)s')

    logger=logging.getLogger(__name__)


# function to query mysql db and return dataframe of results
def mysql_query(user,password,database,host,query):
    
    connection = pymy`,
  },
  {
    name: 'p7-crontab-and-chained-line', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/72152000/how-to-perform-cron-jobs-every-5-minutes-inside-docker',
    logs: `/bin/ash: */5: not found`,
  },
  {
    name: 'p7-k8s-busybox-no-kubectl', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/54904069/how-to-schedule-a-cronjob-which-executes-a-kubectl-command',
    logs: `Back-off restarting failed container

---
State:          Terminated
      Reason:       Error
      Exit Code:    127

---
Name:           hello-1551276000
Namespace:      jp-test
Selector:       controller-uid=fa009d78-3a97-11e9-ae31-ac1f6b1a0950
Labels:         controller-uid=fa009d78-3a97-11e9-ae31-ac1f6b1a0950
                job-name=hello-1551276000
Annotations:    <none>
Controlled By:  CronJob/hello
Parallelism:    1
Completions:    1
Start Time:     Wed, 27 Feb 2019 15:00:02 +0100
Pods Statuses:  0 Running / 0 Succeeded / 0 Failed
Pod Template:
  Labels:  controller-uid=fa009d78-3a97-11e9-ae31-ac1f6b1a0950
           job-name=hello-1551276000
  Containers:
   hello:
    Image:      busybox
    Port:       <none>
    Host Port:  <none>
    Args:
      /bin/sh
      -c
      kubectl patch deployment runners -p '{"spec":{"template":{"spec":{"containers":[{"name":"jp-runner","env":[{"name":"START_TIME","value":"'$(date +%s)'"}]}]}}}}' -n jp-test
    Environment:  <none>
    Mounts:       <none>
  Volumes:        <none>
Events:
  Type     Reason                Age              From            Message
  ----     ------                ----             ----            -------
  Normal   SuccessfulCreate      7m               job-controller  Created pod: hello-1551276000-lz4dp
  Normal   SuccessfulDelete      1m               job-controller  Deleted pod: hello-1551276000-lz4dp
  Warning  BackoffLimitExceeded  1m (x2 over 1m)  job-controller  Job has reached the specified bac`,
  },
  {
    name: 'p7-php-relative-backup-dir', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/8458197/php-cron-job-cant-create-new-files',
    logs: `sh: site-backups/CLIENT_DIRECTORY/DB_DUMP_FILE.sql: No such file or directory
`,
  },
  {
    name: 'p7-readonly-fs-errors', category: 'resources', severity: 'medium', exitCode: 1,
    source: 'https://askubuntu.com/questions/1253767/consistent-read-only-filesystem-in-ubuntu-20-04-lts',
    logs: `Jun 26 10:03:53 mal NetworkManager[1298]: <info>  [1593180233.9376] manager: NetworkManager state is now CONNECTED_GLOBAL
Jun 26 10:04:03 mal systemd[1]: NetworkManager-dispatcher.service: Succeeded.
Jun 26 10:04:24 mal anacron[1290]: Job \`cron.daily' terminated
Jun 26 10:04:24 mal anacron[1290]: Normal exit (1 job run)
Jun 26 10:04:24 mal systemd[1]: anacron.service: Succeeded.
Jun 26 10:05:01 mal CRON[7965]: (root) CMD (command -v debian-sa1 > /dev/null && debian-sa1 1 1)
Jun 26 10:07:00 mal systemd-resolved[1282]: Server returned error NXDOMAIN, mitigating potential DNS violation DVE-2018-0001, retrying transaction with reduced feature level UDP.
Jun 26 10:07:07 mal kernel: [  529.845356] ata1.00: READ LOG DMA EXT failed, trying PIO
Jun 26 10:07:07 mal kernel: [  529.846653] ata1.00: exception Emask 0x0 SAct 0x1000000 SErr 0x0 action 0x0
Jun 26 10:07:07 mal kernel: [  529.846656] ata1.00: irq_stat 0x40000008
Jun 26 10:07:07 mal kernel: [  529.846659] ata1.00: failed command: READ FPDMA QUEUED
Jun 26 10:07:07 mal kernel: [  529.846663] ata1.00: cmd 60/08:c0:e8:47:91/00:00:14:00:00/40 tag 24 ncq dma 4096 in
Jun 26 10:07:07 mal kernel: [  529.846663]          res 41/40:00:ec:47:91/00:00:14:00:00/00 Emask 0x409 (media error) <F>
Jun 26 10:07:07 mal kernel: [  529.846665] ata1.00: status: { DRDY ERR }
Jun 26 10:07:07 mal kernel: [  529.846666] ata1.00: error: { UNC }
Jun 26 10:07:07 mal kernel: [  529.852714] ata1.00: configured for UDMA/133
Jun 26 10:07:07 mal kernel: [  529.8`,
  },
  {
    name: 'p7-bad-interpreter-not-exec', category: 'dependency', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/7443118/bad-interpreter-error-while-executing-cron-job-using-cpanel',
    logs: `/bin/sh: /home/somme_user/public_html/xml_feed/cron_job_wod.py: /usr/bin/python.2.6.2: bad interpreter: Permission denied
`,
  },
  {
    name: 'p7-crontab-pasted-in-bash', category: 'code', severity: 'medium', exitCode: 1,
    source: 'https://stackoverflow.com/questions/59902402/bash-10-no-such-file-or-directory-when-running-cron-job',
    command: `run_job.sh`,
    logs: `-bash: */10: No such file or directory when running
`,
  },
]
