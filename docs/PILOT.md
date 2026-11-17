# Essai pilote de 14 jours — CronGuard

*English version below.*

Merci d'essayer CronGuard. L'essai est fait pour vous coûter peu : **environ 20 minutes d'installation, aucun appel,
rien ne quitte vos serveurs**, et tout se retire en une commande.

## Ce qu'on vous propose

Surveiller **3 à 10 de vos vrais crons** pendant 14 jours — idéalement dont au moins un qui a déjà cassé. Quand un job
échoue, CronGuard vous alerte et vous montre ce qu'il a constaté sur la machine (ce qui diffère entre votre shell et
cron : PATH, variables, dossier courant, utilisateur ; ce qui a changé depuis la dernière réussite). S'il ne sait pas,
il le dit.

## Installation (≈ 20 min)

Suivez le **Quick start** du [README](../README.md#quick-start-5-minutes) :
1. lancer le conteneur sur une machine Linux avec Docker ;
2. créer votre compte dans le navigateur ;
3. **Import a crontab** : collez `crontab -l`, relisez, créez ; recopiez sur la machine des jobs la commande
   d'installation du SDK et la crontab enveloppée qu'il vous donne ;
4. branchez une alerte (Slack, Teams, ntfy sur votre téléphone, e-mail…).

Avant de recoller la crontab, gardez une copie : `crontab -l > crontab.avant-cronguard`.

## À la fin (J14)

1. Générez le rapport, calculé chez vous et **anonymisé par défaut** (aucun nom de job ni texte d'erreur) :
   `docker exec cronguard node dist/services/pilot-report.js --days 14 > pilote.md`
2. Relisez-le, et si vous le voulez bien, envoyez-le en réponse au message LinkedIn, avec trois réponses courtes :
   - Qu'est-ce que CronGuard vous a appris que vous ne saviez pas ?
   - Si on l'éteignait demain, qu'est-ce qui vous manquerait ? (« rien » est une réponse utile)
   - À quel prix mensuel ce serait trop cher ? Acceptable ? Une bonne affaire ?

## Retirer CronGuard

`crontab crontab.avant-cronguard` puis `docker rm -f cronguard && docker volume rm cronguard-data`.

---

# 14-day pilot — CronGuard

About **20 minutes to install, no call, nothing leaves your servers**, removed with one command.

Watch **3 to 10 of your real cron jobs** for 14 days, ideally including one that has failed before. Install with the
[Quick start](../README.md#quick-start-5-minutes) (keep a copy first: `crontab -l > crontab.before-cronguard`).
On day 14, run `docker exec cronguard node dist/services/pilot-report.js --days 14 > pilot.md` (anonymised by default),
read it, and if you are happy to, send it back with three short answers: what did CronGuard tell you that you didn't
know? What would you miss if it were switched off tomorrow? At what monthly price would it be too expensive / fair / a
bargain? To remove it: `crontab crontab.before-cronguard`, then `docker rm -f cronguard && docker volume rm cronguard-data`.
