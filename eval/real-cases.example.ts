/**
 * Jeu d'éval « VRAIS LOGS » — modèle.
 *
 * POURQUOI : le jeu labo (eval/cases.ts) est écrit maison, donc volontairement tranché.
 * Le chiffre qui valide réellement le claim de précision se mesure sur des incidents RÉELS
 * et INDÉPENDANTS — pas sur des fixtures qu'on a soi-même rédigées.
 *
 * COMMENT :
 *   1. Copie ce fichier → eval/real-cases.ts  (gitignored : peut contenir des données sensibles)
 *   2. Colle ~20 vrais logs d'incidents (anonymise IP/host/secrets — sanitizeLogs le fait aussi
 *      à l'envoi, mais nettoie à la source par prudence).
 *   3. Étiquette chaque cas avec la catégorie + sévérité ATTENDUES (le ground truth).
 *      Étiquette à l'aveugle (sans regarder ce que sort le modèle) pour éviter le biais.
 *   4. Lance :  npx tsx eval/run.ts --set real --runs 5
 *      → catégorie exacte ≥ 75% (moyenne) → le claim tient. Sinon → reformuler.
 *
 * Vise ≥ 20 cas, répartis sur les catégories réelles que tu vois en prod.
 */
import type { EvalCase } from './cases'

export const REAL_CASES: EvalCase[] = [
  {
    name: 'real-01-exemple',
    category: 'database',   // ground truth — étiqueté à l'aveugle
    severity: 'high',
    exitCode: 1,
    logs: `// colle ici le vrai log d'incident (anonymisé)
// ex: FATAL: remaining connection slots are reserved for non-replication superuser connections`,
  },

  // … ajoute ~19 autres cas réels ici …
]
