import { describe, it, expect } from 'vitest'
import { validateChoice, HYPOTHESES } from '../src/services/llm/hypotheses'

const LOGS = 'starting sync\n/usr/bin/env: node: No such file or directory\nexit 127'

describe('raisonnement par hypothèses : le code vérifie le choix du modèle', () => {
  it('accepte un mécanisme connu appuyé sur une ligne réelle (espaces et casse tolérés)', () => {
    const c = validateChoice({ ligne: '/usr/bin/env:  NODE: No such file or directory', indice: 'node introuvable', hypothese: 'cron-path' }, LOGS)
    expect(c?.hypothesis.id).toBe('cron-path')
  })
  it('refuse une citation absente des logs (inventée)', () => {
    expect(validateChoice({ ligne: 'node: command not found in PATH', indice: '', hypothese: 'cron-path' }, LOGS)).toBeNull()
  })
  it('refuse « aucune », un identifiant inconnu, une citation trop courte ou une réponse vide', () => {
    expect(validateChoice({ ligne: '/usr/bin/env: node: No such file or directory', hypothese: 'aucune' }, LOGS)).toBeNull()
    expect(validateChoice({ ligne: '/usr/bin/env: node: No such file or directory', hypothese: 'oom' }, LOGS)).toBeNull()
    expect(validateChoice({ ligne: 'exit 127', hypothese: 'cron-path' }, LOGS)).toBeNull()
    expect(validateChoice(null, LOGS)).toBeNull()
  })
  it('identifiants uniques, chaque mécanisme a cause, action et vérification', () => {
    expect(new Set(HYPOTHESES.map(h => h.id)).size).toBe(HYPOTHESES.length)
    for (const h of HYPOTHESES) expect(h.cause && h.action && h.checks.length && h.when).toBeTruthy()
  })
})

import { hypothesesFor } from '../src/services/llm/hypotheses'
import { inferRunner } from '../src/services/llm/run-context'

describe('mécanismes adaptés au lanceur', () => {
  const ids = (r?: Parameters<typeof hypothesesFor>[0]) => hypothesesFor(r).map(h => h.id)
  it('crontab : % et sh-au-lieu-de-bash possibles ; rien de Kubernetes', () => {
    expect(ids('crontab')).toEqual(expect.arrayContaining(['cron-percent', 'cron-sh-not-bash', 'cron-path']))
    expect(ids('crontab')).not.toContain('k8s-memory-limit')
  })
  it('Kubernetes : limites, planification, démarrage du pod ; pas de PATH ni de % de crontab', () => {
    expect(ids('kubernetes')).toEqual(expect.arrayContaining(['k8s-memory-limit', 'k8s-schedule', 'k8s-pod-start', 'code-bad-input']))
    expect(ids('kubernetes')).not.toContain('cron-percent')
    expect(ids('kubernetes')).not.toContain('cron-path')
  })
  it('cron dans un conteneur : variables du conteneur non transmises', () => {
    expect(ids('container-cron')).toContain('container-cron-env')
    expect(ids('container-cron')).not.toContain('cron-env-var')
  })
  it('systemd : environnement de l\'unité, pas celui de crontab', () => {
    expect(ids('systemd')).toContain('systemd-env')
    expect(ids('systemd')).not.toContain('cron-percent')
  })
  it('inconnu = génériques + crontab (cas le plus courant)', () => {
    expect(ids(undefined)).toEqual(ids('crontab'))
  })
  it('un choix hors de la liste montrée est refusé', () => {
    const logs = 'job: OOMKilled after 3m\nexit 137'
    expect(validateChoice({ ligne: 'job: OOMKilled after 3m', hypothese: 'k8s-memory-limit' }, logs, hypothesesFor('crontab'))).toBeNull()
    expect(validateChoice({ ligne: 'job: OOMKilled after 3m', hypothese: 'k8s-memory-limit' }, logs, hypothesesFor('kubernetes'))?.hypothesis.id).toBe('k8s-memory-limit')
  })
  it.each([
    ['Last State: Terminated  Reason: OOMKilled', 'kubernetes'],
    ['Warning  BackoffLimitExceeded  job/report-1', 'kubernetes'],
    ['Nov 10 02:00:01 host systemd[1]: backup.service: Main process exited, code=exited, status=1/FAILURE', 'systemd'],
    ['Nov 10 02:00:01 host CRON[1234]: (root) CMD (/opt/backup.sh)', 'crontab'],
    ['error: something failed', undefined],
  ])('lanceur déduit des logs : %s', (logs, runner) => { expect(inferRunner(logs)).toBe(runner) })
  it('le lanceur relevé par le SDK prime sur les logs', () => {
    expect(inferRunner('CRON[1]: (root) CMD (x)', 'container-cron')).toBe('container-cron')
  })
})
