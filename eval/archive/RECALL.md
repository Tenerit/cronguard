# Rôle IA — déjà vu ? (2026-11-11)

Requêtes : 124 · paires quasi identiques exclues : 0

| seuil | couverture | précision | hasard | faux montrés |
|---|---|---|---|---|
| 0.6 | 90 % (112/124) | 35 % | 15 % | 73 |
| 0.7 | 41 % (51/124) | 47 % | 21 % | 27 |
| 0.8 | 10 % (13/124) | 46 % | 21 % | 7 |
| 0.9 | 2 % (3/124) | 67 % | 19 % | 1 |

## Rappels au seuil 0.8

- ✓ **p5-ruby-shebang-127** (cos 0.959) ← https://askubuntu.com/questions/85558/verify-if-crontab-works
  The syntax for the crontab entry looks correct. Indeed, if you edit your crontab using "crontab -e" (as you should), you'll get an error if you specify a syntactically invalid crontab entry anyway. Firstly, does /path_to
- ✗ **p2-ffmpeg-display-boot** (cos 0.949) ← https://unix.stackexchange.com/questions/10121/open-a-window-on-a-remote-x-display-why-cannot-open-display
  (Adapted from Linux: wmctrl cannot open display when session initiated via ssh+screen) DISPLAY and AUTHORITY An X program needs two pieces of information in order to connect to an X display. It needs the address of the d
- ✓ **p4-bundle-path-environment** (cos 0.922) ← https://serverfault.com/questions/318638/my-cron-tasks-report-command-not-found
  The deafult PATH for CRON jobs is usually /usr/bin:/bin. Your commands bundle and backup are likely not in the default path. One solution is to change your crontab and include the full path to these commands. 0 0,6,12,18
- ✗ **p5-crontab-percent-expr** (cos 0.881) ← https://serverfault.com/questions/271900/ubuntu-cronjob-failing-with-exit-code-2
  Your script seems to be exiting with status 2, which cron interprets as an error. Does it exit with status 0 if run by hand? /usr/local/bin/sqlbackup.sh -e echo $? Check you're not assuming things about the environment t
- ✗ **p3-git-push-root-home** (cos 0.880) ← https://serverfault.com/questions/593382/hg-pull-from-bitbucket-fails-when-run-from-cron
  Try specifying the ssh command explicitly e.g. hg pull -e 'ssh -i /location/of/key' Cron runs with a minimal shell, so won't have access to your ssh-agent process because the SSH environment variables aren't set. 
- ✓ **p3-ruby-rvm-env** (cos 0.867) ← https://unix.stackexchange.com/questions/41394/bash-script-doesnt-work-as-cronjob
  This should do it. Just make sure you got the right paths. BTW, GoAccess is nifty. #!/bin/bash PATH=$PATH:/home/ _logdir="/srv/www/logs" _logfiles="${_logdir}/access_*.log" for logfile in $_logfiles; do _curfilename="${l
- ✗ **p4-python3-import** (cos 0.864) ← https://unix.stackexchange.com/questions/454957/cron-job-to-run-under-conda-virtual-environment
  Posted a working solution (on Ubuntu 18.04) with detailed reasoning on SO. The short form is: 1. Copy snippet appended by Anaconda in ~/.bashrc (at the end of the file) to a separate file ~/.bashrc_conda As of Anaconda 2
- ✓ **p4-java-path** (cos 0.850) ← https://unix.stackexchange.com/questions/219896/aws-cli-not-working-in-a-crontab
  You need to specify the full path to the aws executable: 50 12 * * * /usr/local/bin/aws --version > ~/yolo.swag 
- ✓ **p7-crontab-pasted-in-bash** (cos 0.835) ← https://unix.stackexchange.com/questions/21297/how-do-i-add-an-entry-to-my-crontab
  You can't use crontab like that. Use man crontab to read about the correct way of calling this utility. You'll want to use crontab -e to edit the current user's cron entries (you can add/modify/remove lines). Use crontab
- ✗ **p2-php-oom-ssh-safe-mode** (cos 0.833) ← https://serverfault.com/questions/295584/php-cli-memory-limit
  IIRC, an unlimited memory_limit isn't supported by the CLI (I'll try to find a source for this) but for now, try passing it into the command: php -d memory_limit=128M my_script.php UPDATE Apparently I was dreaming about 
- ✓ **p3-crontab-percent-date** (cos 0.830) ← https://unix.stackexchange.com/questions/199761/usage-of-in-the-crontab
  okay - figured it out. Posting back just incase if someone runs into it someday at sometime. The % sign has a special meaning in crontab. it's changed to newline and any string after the first % will be sent to the comma
- ✗ **p2-cron-perm-denied-owner** (cos 0.804) ← https://unix.stackexchange.com/questions/298963/passphraseless-access-to-rsync-with-ssh-through-cron-fails
  The -i option of ssh is supposed to input the file name that contains the private key, not public key. But you have presumably given the file name containing the public key, given by the name /home/<username>/.ssh/id_rsa
- ✗ **p7-docker-cron-not-installed** (cos 0.801) ← https://serverfault.com/questions/416119/what-is-the-correct-way-of-getting-crontab-on-centos-6
  # rpm -qf `which crontab` cronie-1.4.4-7.el6.x86_64 Vixie-cron was replaced with Cronie in EL6. Likely it wasn't installed in your "minimal" installation; they really do strive to be minimal with it. 
