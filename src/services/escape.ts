// Échappe les caractères dangereux pour une insertion sûre dans du HTML ou du
// XML/SVG (contenu texte ET valeurs d'attribut). Utilisé pour les valeurs
// contrôlées par l'utilisateur (nom de monitor) et les sorties libres du LLM
// (cause/action) rendues dans le badge SVG et les emails d'alerte.
export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
