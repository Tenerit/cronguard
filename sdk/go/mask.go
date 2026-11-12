package main

import (
	"regexp"
	"sort"
	"strings"
)

// Secrets masqués sur la machine du job, avant tout envoi. Copie de _CG_MASK (sdk/python) SANS les assertions
// (?!…), que le moteur regex de Go (RE2) ne connaît pas : main_test.go vérifie que c'est bien la même liste.
// Chaque assertion retirée devient un refus de la valeur trouvée (maskReject), au même effet.
var maskSrc = []string{
	`(?i)\b(?:password|passwd|pwd|secret)\s*[:=]\s*(\S+)`,
	`(?i)\b[a-z][a-z0-9+.-]*://[^\s:/@]+:([^\s@/]+)@`,
	`(?i)\bbearer\s+([A-Za-z0-9_\-.]{20,})`,
	`(?i)\bAuthorization:\s*(?:Basic|Bearer|Token)\s+([A-Za-z0-9+/=._-]{8,})`,
	`(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)`,
	`\b(AKIA[0-9A-Z]{16})\b`,
	`(?i)\baws_secret_access_key[\s=:]+([A-Za-z0-9/+]{40})`,
	`(?i)\b((?:sk|pk|rk|re)_(?:live|test|prod|staging)_[A-Za-z0-9_-]{16,})`,
	`(?i)\b(?:api[_-]?key|x-api-key|apikey|auth[_-]?token|access[_-]?token|secret[_-]?key)\s*[=:]\s*([A-Za-z0-9_\-.]{20,})`,
	`\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{22,}|glpat-[A-Za-z0-9_-]{20,})`,
	`\b(xox[abposr]-[A-Za-z0-9-]{10,})`,
	`hooks\.slack\.com/services/([A-Za-z0-9]+/[A-Za-z0-9]+/[A-Za-z0-9]+)`,
	`\b(AIza[0-9A-Za-z_-]{30,})`,
	`\b(sk-(?:proj-|ant-[a-z0-9]+-)?[A-Za-z0-9_-]{20,})`,
	`\b(SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,})`,
	`\b(npm_[A-Za-z0-9]{30,}|pypi-[A-Za-z0-9_-]{30,})`,
	`/bot(\d{6,}:[A-Za-z0-9_-]{30,})`,
	`\b(?:AccountKey|SharedAccessKey|sig)=([A-Za-z0-9+/%=]{20,})`,
	`-----BEGIN [A-Z ]*PRIVATE KEY-----([\s\S]*?)-----END [A-Z ]*PRIVATE KEY-----`,
	`\bcurl\b[^\n]*?\s(?:-u|--user)\s+[^\s:]+:(\S+)`,
	`(?:\b(?:docker|podman|helm|oras)\s+(?:registry\s+)?login\b[^\n]*?\s-p|--password)(?:\s+|=)[\'"]?([^\s\'"]{4,})`,
	`(?i)\b(?:mysql(?:dump|admin|import)?)\b[^\n|;&]*?\s-p([^\s]+)`,
	`(?i)\bsshpass\s+-p\s*(\S+)`,
	`\b[A-Z][A-Z0-9_]*(?:PASS|PASSWORD|PASSWD|PWD|TOKEN|SECRET|API_KEY|APIKEY|PRIVATE_KEY|AUTH)\s*=\s*[\'"]?([^\s\'"]{4,})`,
	`(?i)"(?:api_?key|apiKey|token|secret|password|passwd|access_?token|client_?secret|private_?key(?:_?id)?)"\s*:\s*"([^"]{6,})"`,
	`\b(key-[0-9a-f]{32})\b`,
	`\b(do[por]_v1_[a-f0-9]{64})\b`,
	`\b(whsec_[A-Za-z0-9]{24,})\b`,
	`https://([0-9a-f]{32})@[\w.-]*sentry\.io`,
	`\bldap\w+\b[^\n]*?\s-w\s+[\'"]?([^\s\'"]{4,})`,
	`(?:^|\s)AUTH\s+([^\s]{6,})`,
	`(?im)^\s*[a-z_]*(?:secret|password|passwd|token|api_?key)[a-z_]*\s*=\s*(\S{4,})`,
}

// Clé : un extrait du motif concerné ; valeur : ce que l'assertion Python refusait.
var maskReject = map[string]*regexp.Regexp{
	"password|passwd|pwd|secret)": regexp.MustCompile(`^(?:YES|NO)\b|^[^\s:]+:$`), // (?!(?:YES|NO)\b)(?![^\s:]+:(?:\s|$))
	"docker|podman|helm|oras":     regexp.MustCompile(`^[-$]`),                    // (?![-$])
	`AUTH\s+(`:                    regexp.MustCompile(`^\[`),                      // (?!\[)
}

type maskRule struct{ re, reject *regexp.Regexp }

var maskRules = func() []maskRule {
	var out []maskRule
	for _, p := range maskSrc {
		r := maskRule{re: regexp.MustCompile("(?m)" + p)}
		for k, rej := range maskReject {
			if strings.Contains(p, k) {
				r.reject = rej
			}
		}
		out = append(out, r)
	}
	return out
}()

var shellVar = regexp.MustCompile(`^\$\{?\w+\}?$`)

func maskSecrets(text string) string {
	vals := map[string]bool{}
	for _, r := range maskRules {
		for _, m := range r.re.FindAllStringSubmatch(text, -1) {
			v := m[0]
			for _, g := range m[1:] {
				if g != "" {
					v = g
					break
				}
			}
			if len(v) >= 4 && !shellVar.MatchString(v) && !strings.Contains(v, "[REDACTED") && (r.reject == nil || !r.reject.MatchString(v)) {
				vals[v] = true
			}
		}
	}
	var list []string
	for v := range vals {
		list = append(list, v)
	}
	sort.Slice(list, func(i, j int) bool { return len(list[i]) > len(list[j]) })
	for _, v := range list {
		text = strings.ReplaceAll(text, v, "[REDACTED]")
	}
	return text
}
