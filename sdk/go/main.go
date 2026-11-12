// CronGuard — binaire statique, sans dépendance (ni bash, ni python3, ni curl).
//
//	cronguard run <ping-key> [--] <commande> [args...]   exécute, mesure, envoie le ping (code de sortie = celui de la commande)
//	cronguard step <nom>                                   marque une étape (depuis un script lancé par « run »)
//
// Mêmes fichiers d'état que les SDK bash et Python (CG_STATE_DIR : empreinte <clé>.ok.json, file queue/, verrou,
// marqueur d'échec), mêmes champs envoyés, mêmes libellés : on peut passer d'un SDK à l'autre sans rien perdre.
// Constate, ne devine pas : noms, chemins, tailles, dates, versions ; jamais une valeur de variable ni un contenu.
//
// Compilation : CGO_ENABLED=0 GOOS=linux go build -ldflags "-s -w" -o cronguard .
package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"os/user"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func main() {
	if len(os.Args) >= 3 && os.Args[1] == "step" {
		step(os.Args[2])
		return
	}
	if len(os.Args) >= 4 && os.Args[1] == "run" {
		args := os.Args[3:]
		if args[0] == "--" {
			args = args[1:]
		}
		if len(args) > 0 {
			os.Exit(run(os.Args[2], args))
		}
	}
	fmt.Fprintln(os.Stderr, "usage : cronguard run <ping-key> [--] <commande> [args...]\n        cronguard step <nom>")
	os.Exit(2)
}

// ── État ─────────────────────────────────────────────────────────────────────

func stateDir() string {
	if d := os.Getenv("CG_STATE_DIR"); d != "" {
		return d
	}
	if d := os.Getenv("XDG_STATE_HOME"); d != "" {
		return filepath.Join(d, "cronguard")
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".local", "state", "cronguard")
}

var unsafeKey = regexp.MustCompile(`[^A-Za-z0-9_-]`)

func base(key string) string { return filepath.Join(stateDir(), unsafeKey.ReplaceAllString(key, "_")) }

func writePrivate(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o600)
}

// ── Étapes ───────────────────────────────────────────────────────────────────

func step(name string) {
	f := os.Getenv("_CG_STEPS_FILE")
	if f == "" {
		return
	}
	if fh, err := os.OpenFile(f, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600); err == nil {
		fmt.Fprintf(fh, "%d %s\n", time.Now().UnixMilli(), name)
		fh.Close()
	}
}

func readSteps(f string) []map[string]any {
	data, _ := os.ReadFile(f)
	var out []map[string]any
	for _, line := range strings.Split(string(data), "\n") {
		at, name, ok := strings.Cut(strings.TrimSpace(line), " ")
		if n, err := strconv.ParseInt(at, 10, 64); ok && err == nil && name != "" {
			if len(name) > 60 {
				name = name[:60]
			}
			out = append(out, map[string]any{"name": name, "at": n})
		}
	}
	if len(out) > 20 {
		out = out[len(out)-20:]
	}
	return out
}

// ── Exécution ────────────────────────────────────────────────────────────────

// tail garde les derniers octets de la sortie (la cause est presque toujours à la fin).
type tail struct{ b []byte }

func (t *tail) Write(p []byte) (int, error) {
	t.b = append(t.b, p...)
	if len(t.b) > 20000 {
		t.b = t.b[len(t.b)-20000:]
	}
	return len(p), nil
}

func run(key string, args []string) int {
	start := time.Now()
	oomStart := oomKills()
	// Commande envoyée à l'échec : forme de l'import « bash -c "<cmd>" », sinon les arguments joints (comme cg_run).
	command := strings.Join(args, " ")
	if len(args) >= 3 && (args[0] == "bash" || args[0] == "sh") && args[1] == "-c" {
		command = args[2]
	}

	// Chevauchement : même verrou que bash/Python (« pid début »).
	lock := base(key) + ".lock"
	var overlap map[string]any
	if data, err := os.ReadFile(lock); err == nil {
		f := strings.Fields(string(data))
		if len(f) >= 2 {
			pid, e1 := strconv.Atoi(f[0])
			since, e2 := strconv.ParseInt(f[1], 10, 64)
			if e1 == nil && e2 == nil && pid > 0 && pid != os.Getpid() && syscall.Kill(pid, 0) == nil {
				overlap = map[string]any{"pid": pid, "since": since}
			}
		}
	}
	out := &tail{}
	code := 0
	if overlap != nil && os.Getenv("CG_SKIP_IF_RUNNING") == "1" {
		fmt.Fprintf(out, "cronguard: exécution précédente toujours en cours (pid %v) : exécution sautée (CG_SKIP_IF_RUNNING=1)\n", overlap["pid"])
		report(key, command, 75, start, out.b, oomStart, overlap, "") // EX_TEMPFAIL : la commande n'a pas été lancée
		return 0
	}
	_ = writePrivate(lock, []byte(fmt.Sprintf("%d %d\n", os.Getpid(), time.Now().Unix())))
	defer func() {
		if data, err := os.ReadFile(lock); err == nil && strings.HasPrefix(string(data), strconv.Itoa(os.Getpid())+" ") {
			os.Remove(lock)
		}
	}()

	stepsFile := filepath.Join(os.TempDir(), fmt.Sprintf("cg_steps_%d", os.Getpid()))
	defer os.Remove(stepsFile)

	cmd := exec.Command(args[0], args[1:]...)
	cmd.Env = append(os.Environ(), "_CG_STEPS_FILE="+stepsFile)
	cmd.Stdin = os.Stdin
	// La sortie reste visible (cron, kubectl logs) ET elle est gardée pour le diagnostic.
	cmd.Stdout = io.MultiWriter(os.Stdout, out)
	cmd.Stderr = io.MultiWriter(os.Stderr, out)
	if err := cmd.Start(); err != nil {
		fmt.Fprintf(out, "cronguard: %s: %v\n", args[0], err)
		fmt.Fprintf(os.Stderr, "cronguard: %s: %v\n", args[0], err)
		code = 127
		if errors.Is(err, os.ErrPermission) {
			code = 126
		}
	} else {
		sig := make(chan os.Signal, 2)
		signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT, syscall.SIGHUP)
		go func() {
			for s := range sig {
				cmd.Process.Signal(s) // arrêt demandé (kubectl, systemd) : transmis à la commande, le ping part quand même
			}
		}()
		err := cmd.Wait()
		signal.Stop(sig)
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			code = ee.ExitCode()
			if ws, ok := ee.Sys().(syscall.WaitStatus); ok && ws.Signaled() {
				code = 128 + int(ws.Signal())
			}
		}
	}
	report(key, command, code, start, out.b, oomStart, overlap, stepsFile)
	return code
}

// report construit et envoie le ping (même logique que cg_end dans le SDK bash).
func report(key, command string, code int, start time.Time, raw []byte, oomStart *int, overlap map[string]any, stepsFile string) {
	duration := time.Since(start).Milliseconds()
	text := string(raw)
	var expect []map[string]any
	expectFailed := false
	if spec := os.Getenv("CG_EXPECT"); code == 0 && spec != "" {
		expect = checkExpect(spec, float64(start.Unix()))
		var bad []string
		for _, r := range expect {
			if r["ok"] == false {
				p, _ := r["path"].(string)
				if p == "" {
					p, _ = r["pattern"].(string)
				}
				bad = append(bad, fmt.Sprintf("%s (%s)", p, r["reason"]))
			}
		}
		if len(bad) > 0 {
			expectFailed = true
			text += "\ncronguard: sortie attendue non conforme : " + strings.Join(bad, "; ") + "\n"
		}
	}
	// Processus tué par le noyau (mémoire) alors que la commande sort avec 0 : panne silencieuse, signalée.
	if code == 0 && !expectFailed && oomStart != nil {
		if now := oomKills(); now != nil && *now > *oomStart {
			expectFailed = true
			text += "\ncronguard: un processus du job a été tué par le noyau (mémoire) pendant cette exécution, malgré le code 0\n"
		}
	}
	text = maskSecrets(text) // masqués sur la machine du job, avant tout envoi
	marker := base(key) + ".fail"
	body := map[string]any{"exit_code": code}
	if duration > 0 {
		body["duration_ms"] = duration
	}
	if code != 0 || expectFailed {
		ctx := runContext(text, command, oomStart)
		if ch := changesSinceSuccess(key, command); len(ch) > 0 {
			ctx["changed"] = ch
		}
		if expect != nil {
			ctx["expect"] = expect
		}
		if stepsFile != "" {
			if s := readSteps(stepsFile); len(s) > 0 {
				ctx["steps"], ctx["stepsEnd"] = s, time.Now().UnixMilli()
			}
		}
		if overlap != nil {
			ctx["overlap"] = overlap
		}
		// Résolution constatée : seules les lignes que lisent les sondes, relues à la réussite suivante.
		var keep []string
		for _, l := range strings.Split(text, "\n") {
			if probeLine.MatchString(l) {
				keep = append(keep, l)
			}
		}
		if len(keep) > 20 {
			keep = keep[len(keep)-20:]
		}
		_ = writePrivate(marker, []byte(strings.Join(keep, "\n")))
		if len(text) > 3000 {
			text = text[len(text)-3000:]
		}
		body["status"], body["output"], body["context"] = "fail", text, ctx
		if command != "" {
			c := command
			if len(c) > 1000 {
				c = c[:1000]
			}
			body["command"] = c
		}
	} else {
		body["status"] = "success"
		if lines, err := os.ReadFile(marker); err == nil {
			body["context"] = runContext(string(lines), command, nil)
			os.Remove(marker)
		}
		saveFingerprint(key, command)
	}
	ping(key, body)
}

var probeLine = regexp.MustCompile(`not found|No such file|Permission denied|cannot open|can.t open|cannot access|cannot stat|Read-only file system`)

// ── Envoi : ne jamais perdre une panne ───────────────────────────────────────

func send(key string, body []byte) bool { // vrai si 2xx ou 4xx (un 4xx ne passerait pas mieux plus tard)
	url := os.Getenv("CRONGUARD_URL")
	if url == "" {
		url = "http://localhost:3000"
	}
	c := http.Client{Timeout: 5 * time.Second}
	r, err := c.Post(strings.TrimRight(url, "/")+"/ping/"+key, "application/json", bytes.NewReader(body))
	if err != nil {
		return false
	}
	r.Body.Close()
	return r.StatusCode < 500
}

func queued(q string) []string {
	ents, _ := os.ReadDir(q)
	var names []string
	for _, e := range ents {
		if strings.Contains(e.Name(), "__") { // pas le compteur .seq
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)
	return names
}

// Même file que bash/Python : <état>/queue/NNNNNNNNNNNN__clé, compteur .seq, 200 au plus, renvoyée dans l'ordre.
func ping(key string, body map[string]any) {
	data, _ := json.Marshal(body)
	q := filepath.Join(stateDir(), "queue")
	names := queued(q)
	if len(names) > 50 {
		names = names[:50]
	}
	for _, f := range names {
		b, err := os.ReadFile(filepath.Join(q, f))
		if err != nil || !send(f[strings.Index(f, "__")+2:], b) {
			break
		}
		os.Remove(filepath.Join(q, f))
	}
	if send(key, data) {
		return
	}
	if os.MkdirAll(q, 0o700) != nil {
		return
	}
	n := 1
	if b, err := os.ReadFile(filepath.Join(q, ".seq")); err == nil {
		if v, err := strconv.Atoi(strings.TrimSpace(string(b))); err == nil {
			n = v + 1
		}
	}
	_ = os.WriteFile(filepath.Join(q, ".seq"), []byte(strconv.Itoa(n)), 0o600)
	_ = os.WriteFile(filepath.Join(q, fmt.Sprintf("%012d__%s", n, unsafeKey.ReplaceAllString(key, "_"))), data, 0o600)
	if all := queued(q); len(all) > 200 {
		for _, old := range all[:len(all)-200] {
			os.Remove(filepath.Join(q, old))
		}
	}
	fmt.Fprintln(os.Stderr, "cronguard: serveur injoignable, ping gardé et renvoyé au prochain envoi")
}

// ── Contexte ─────────────────────────────────────────────────────────────────

func runner() string { // même règle que _runner (sdk/python)
	if os.Getenv("KUBERNETES_SERVICE_HOST") != "" {
		return "kubernetes"
	}
	if os.Getenv("INVOCATION_ID") != "" {
		return "systemd"
	}
	cron, pid := false, os.Getppid()
	for i := 0; i < 8 && pid > 1; i++ {
		comm, err := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid))
		if err != nil {
			break
		}
		if c := strings.TrimSpace(string(comm)); c == "cron" || c == "crond" || c == "anacron" {
			cron = true
			break
		}
		stat, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
		if err != nil {
			break
		}
		f := strings.Fields(string(stat[bytes.LastIndexByte(stat, ')')+1:]))
		if len(f) < 2 {
			break
		}
		pid, _ = strconv.Atoi(f[1])
	}
	_, e1 := os.Stat("/.dockerenv")
	_, e2 := os.Stat("/run/.containerenv")
	if e1 == nil || e2 == nil {
		if cron {
			return "container-cron"
		}
		return "container"
	}
	if cron {
		return "crontab"
	}
	if v := os.Getenv("XPC_SERVICE_NAME"); v != "" && v != "0" {
		return "launchd"
	}
	return ""
}

func trunc(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}

func runContext(text, command string, oomStart *int) map[string]any {
	u := ""
	if cu, err := user.Current(); err == nil {
		u = cu.Username
	}
	cwd, _ := os.Getwd()
	lang := os.Getenv("LC_ALL")
	if lang == "" {
		lang = os.Getenv("LANG")
	}
	ctx := map[string]any{
		"user": u, "home": os.Getenv("HOME"), "path": trunc(os.Getenv("PATH"), 1024), "shell": os.Getenv("SHELL"),
		"lang": lang, "cwd": trunc(cwd, 256), "display": os.Getenv("DISPLAY") != "", "sshAgent": os.Getenv("SSH_AUTH_SOCK") != "",
	}
	if r := runner(); r != "" {
		ctx["runner"] = r
	}
	if len(text) > 20000 {
		text = text[len(text)-20000:]
	}
	paths := pathProbe(text)
	if len(paths) > 0 {
		ctx["paths"] = paths
	}
	ctx["resources"] = resources(oomStart, paths, text, command)
	if n := netProbe(text, command); len(n) > 0 {
		ctx["net"] = n
	}
	return ctx
}

func expandUser(p string) string {
	if p == "~" || strings.HasPrefix(p, "~/") {
		home, _ := os.UserHomeDir()
		return home + p[1:]
	}
	return p
}

var (
	pathErr  = regexp.MustCompile(`(?i)No such file|Permission denied|cannot open|can't open|cannot access|cannot stat|Read-only file system`)
	denyErr  = regexp.MustCompile(`(?i)Permission denied|Read-only file system`)
	pathToks = regexp.MustCompile(`'([^'\s]{1,200})'|"([^"\s]{1,200})"|(?:^|[\s(=])((?:~|\.{1,2})?/?[\w.@+*-]+(?:/[\w.@+*-]+)+)`)
)

// Chemins cités par l'erreur (même règle que _cg_paths) : existence, propriétaire, droits de l'utilisateur du job.
func pathProbe(text string) []map[string]any {
	var cands []string
	denied := map[string]bool{}
	for _, line := range strings.Split(text, "\n") {
		if !pathErr.MatchString(line) {
			continue
		}
		for _, m := range pathToks.FindAllStringSubmatch(line, -1) {
			p := m[1] + m[2] + m[3]
			if !strings.ContainsAny(p, "/.") {
				continue
			}
			if !contains(cands, p) {
				cands = append(cands, p)
			}
			if denyErr.MatchString(line) {
				denied[p] = true
			}
		}
	}
	var todo []string
	for _, p := range cands {
		todo = append(todo, p)
		par := filepath.Dir(expandUser(p))
		if st, e := os.Stat(par); (denied[p] || hit(expandUser(p)) == "") && par != "." && e == nil && st.IsDir() && !contains(todo, par) {
			todo = append(todo, par) // fichier à créer ou refusé : le dossier parent porte les droits
		}
	}
	var res []map[string]any
	for i, p := range todo {
		if i == 5 {
			break
		}
		q := expandUser(p)
		rel := !filepath.IsAbs(q)
		if h := hit(q); h != "" {
			q = h
		}
		st, err := os.Stat(q)
		d := map[string]any{"path": trunc(p, 256), "relative": rel, "exists": err == nil}
		if err == nil {
			if s, ok := st.Sys().(*syscall.Stat_t); ok {
				d["owner"] = strconv.Itoa(int(s.Uid))
				if pu, e := user.LookupId(strconv.Itoa(int(s.Uid))); e == nil {
					d["owner"] = pu.Username
				}
			}
			d["mode"] = fmt.Sprintf("%o", st.Mode().Perm())
			d["readable"] = syscall.Access(q, 4) == nil
			d["writable"] = syscall.Access(q, 2) == nil
		}
		res = append(res, d)
	}
	return res
}

// hit : le fichier lui-même, ou pour un motif (« laravel-*.log ») le premier fichier qui y correspond ; "" sinon.
func hit(q string) string {
	if !strings.Contains(q, "*") {
		if _, err := os.Stat(q); err == nil {
			return q
		}
		return ""
	}
	m, _ := filepath.Glob(q)
	if len(m) == 0 {
		return ""
	}
	sort.Strings(m)
	return m[0]
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

// ── Mémoire et disque ────────────────────────────────────────────────────────
// Le binaire survit à l'OOM de la commande (le noyau tue le plus gros processus) : l'écart du compteur est un fait.

func cgroupDir() string {
	data, err := os.ReadFile("/proc/self/cgroup")
	if err != nil {
		return ""
	}
	for _, l := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(l, "0::") {
			return "/sys/fs/cgroup" + strings.TrimRight(strings.TrimSpace(l[3:]), "/")
		}
	}
	return ""
}

func oomKills() *int {
	data, err := os.ReadFile(cgroupDir() + "/memory.events")
	if err != nil {
		return nil
	}
	for _, l := range strings.Split(string(data), "\n") {
		if f := strings.Fields(l); len(f) == 2 && f[0] == "oom_kill" {
			if n, err := strconv.Atoi(f[1]); err == nil {
				return &n
			}
		}
	}
	return nil
}

var (
	noSpace   = regexp.MustCompile(`(?i)No space left|ENOSPC|Disk quota exceeded|disk full`)
	spacePath = regexp.MustCompile(`'(/[^']+)'|(?:^|\s)(/[\w./@+-]+)`)
	cmdPath   = regexp.MustCompile(`(?:^|[\s=])(/[\w./@+*-]+)`)
)

func resources(oomStart *int, paths []map[string]any, text, command string) map[string]any {
	res := map[string]any{}
	if now := oomKills(); oomStart != nil && now != nil && *now > *oomStart {
		res["oomKills"] = *now - *oomStart
	}
	d := cgroupDir()
	for _, kv := range [][2]string{{"memory.max", "memMax"}, {"memory.peak", "memPeak"}} {
		if v, err := os.ReadFile(d + "/" + kv[0]); err == nil && d != "" {
			res[kv[1]] = trunc(strings.TrimSpace(string(v)), 32)
		}
	}
	var full []string
	for _, l := range strings.Split(text, "\n") {
		if noSpace.MatchString(l) {
			for _, m := range spacePath.FindAllStringSubmatch(l, -1) {
				full = append(full, m[1]+m[2])
			}
		}
	}
	if len(full) == 0 && noSpace.MatchString(text) {
		// Message sans chemin (pg_dump) : chemins absolus de la commande et des sorties attendues (CG_EXPECT).
		var spec []string
		for _, it := range strings.Split(os.Getenv("CG_EXPECT"), ";") {
			if f := strings.Fields(it); len(f) > 0 {
				spec = append(spec, f[0])
			}
		}
		for _, m := range cmdPath.FindAllStringSubmatch(command+" "+strings.Join(spec, " "), -1) {
			if !strings.Contains(filepath.Dir(m[1]), "*") {
				full = append(full, m[1])
			}
		}
	}
	if len(full) > 3 {
		full = full[:3]
	}
	cwd, _ := os.Getwd()
	cands := append(full, cwd)
	for _, p := range paths {
		if p["exists"] == true {
			cands = append(cands, p["path"].(string))
		}
	}
	var disk []map[string]any
	seen := map[uint64]bool{}
	for _, p := range cands {
		q := expandUser(p)
		if st, err := os.Stat(q); err != nil || !st.IsDir() {
			q = filepath.Dir(q)
		}
		var fs syscall.Statfs_t
		st, err := os.Stat(q)
		if err != nil || syscall.Statfs(q, &fs) != nil {
			continue
		}
		dev := uint64(st.Sys().(*syscall.Stat_t).Dev)
		if seen[dev] {
			continue
		}
		seen[dev] = true
		disk = append(disk, map[string]any{"path": trunc(p, 200), "free": fs.Bavail * uint64(fs.Bsize), "total": fs.Blocks * uint64(fs.Bsize)})
	}
	if len(disk) > 4 {
		disk = disk[:4]
	}
	if len(disk) > 0 {
		res["disk"] = disk
	}
	return res
}

// ── Réseau : DNS puis TCP (2 s max) vers les seuls hôtes cités par une erreur réseau, sans rien envoyer ──

var (
	ports   = map[string]int{"http": 80, "https": 443, "ftp": 21, "postgres": 5432, "postgresql": 5432, "mysql": 3306, "redis": 6379, "amqp": 5672, "mongodb": 27017, "smtp": 25, "ldap": 389, "ssh": 22}
	netErr  = regexp.MustCompile(`(?i)refused|timed? ?out|resolve|unreachable|could not connect|couldn.t connect|no route|getaddrinfo|ENOTFOUND|ECONNREFUSED|EHOSTUNREACH|Name or service not known|Temporary failure in name resolution|Connection reset`)
	urlRe   = regexp.MustCompile(`\b([a-z][a-z0-9+.-]*)://(?:[^@/\s]+@)?([A-Za-z0-9.-]+)(?::(\d{1,5}))?`)
	hostRe  = regexp.MustCompile(`\b((?:[A-Za-z0-9-]+\.)+[A-Za-z0-9-]+|localhost|\d+\.\d+\.\d+\.\d+)(?::|,? port | port )(\d{1,5})\b`)
	resolve = regexp.MustCompile(`resolve host:? '?([A-Za-z0-9.-]+)`)
)

func netProbe(text, command string) []map[string]any {
	if os.Getenv("CG_PROBE_NET") == "0" {
		return nil
	}
	type cand struct {
		host string
		port int
	}
	var cands []cand
	addURLs := func(s string) {
		for _, m := range urlRe.FindAllStringSubmatch(s, -1) {
			p, _ := strconv.Atoi(m[3])
			if p == 0 {
				p = ports[strings.ToLower(m[1])]
			}
			cands = append(cands, cand{m[2], p})
		}
	}
	isNet := false
	for _, line := range strings.Split(text, "\n") {
		if !netErr.MatchString(line) {
			continue
		}
		isNet = true
		addURLs(line)
		for _, m := range hostRe.FindAllStringSubmatch(line, -1) {
			p, _ := strconv.Atoi(m[2])
			cands = append(cands, cand{m[1], p})
		}
		for _, m := range resolve.FindAllStringSubmatch(line, -1) {
			cands = append(cands, cand{m[1], 0})
		}
	}
	if isNet { // les URL de la commande donnent souvent le port que le message tait
		addURLs(command)
	}
	var order []string
	best := map[string]int{}
	for _, c := range cands {
		if p, ok := best[c.host]; !ok || (p == 0 && c.port != 0) {
			if !ok {
				order = append(order, c.host)
			}
			best[c.host] = c.port
		}
	}
	var out []map[string]any
	for i, h := range order {
		if i == 3 {
			break
		}
		r := map[string]any{"host": trunc(h, 253), "port": best[h]}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		ips, err := net.DefaultResolver.LookupHost(ctx, h)
		cancel()
		if err != nil || len(ips) == 0 {
			r["dns"] = "fail"
			out = append(out, r)
			continue
		}
		r["dns"] = "ok"
		if best[h] != 0 {
			conn, err := net.DialTimeout("tcp", net.JoinHostPort(ips[0], strconv.Itoa(best[h])), 2*time.Second)
			var ne net.Error
			switch {
			case err == nil:
				conn.Close()
				r["tcp"] = "open"
			case errors.Is(err, syscall.ECONNREFUSED):
				r["tcp"] = "refused"
			case errors.As(err, &ne) && ne.Timeout():
				r["tcp"] = "timeout"
			default:
				r["tcp"] = "unreachable"
			}
		}
		out = append(out, r)
	}
	return out
}

// ── Empreinte d'une réussite et ce qui a changé (même format que _cg_fingerprint : fichiers d'état partagés) ──

type fingerprint struct {
	Command string            `json:"command"`
	Path    string            `json:"path"`
	Cwd     string            `json:"cwd"`
	Vars    []string          `json:"vars"`
	Files   map[string]string `json:"files"`
	Tools   map[string]string `json:"tools"`
}

var tools = map[string]bool{}

func init() {
	for _, t := range strings.Fields("pg_dump pg_restore psql mysqldump mysql mongodump redis-cli rsync curl wget tar gzip zstd python python3 node php ruby java perl aws gcloud az docker kubectl git rclone restic borg openssl ssh scp gpg bundle rake") {
		tools[t] = true
	}
}

var varName = regexp.MustCompile(`^[A-Z][A-Z0-9_]*$`)

func makeFingerprint(command string) fingerprint {
	cwd, _ := os.Getwd()
	fp := fingerprint{Path: trunc(os.Getenv("PATH"), 1024), Cwd: trunc(cwd, 256), Vars: []string{}, Files: map[string]string{}, Tools: map[string]string{}}
	if command != "" {
		h := sha256.Sum256([]byte(command))
		fp.Command = hex.EncodeToString(h[:])[:16]
	}
	for _, kv := range os.Environ() {
		if k, _, _ := strings.Cut(kv, "="); varName.MatchString(k) {
			fp.Vars = append(fp.Vars, k)
		}
	}
	sort.Strings(fp.Vars)
	if len(fp.Vars) > 200 {
		fp.Vars = fp.Vars[:200]
	}
	// shortcut: mots séparés par les espaces (Python utilise shlex) ; un chemin entre guillemets avec espace n'est pas suivi.
	words := strings.Fields(command)
	for i, w := range words {
		if i == 40 {
			break
		}
		if st, err := os.Stat(expandUser(w)); strings.ContainsAny(w, "/.") && err == nil && st.Mode().IsRegular() {
			fp.Files[trunc(w, 200)] = fmt.Sprintf("%d:%d", st.Size(), st.ModTime().Unix())
		}
	}
	for i, w := range words {
		if i == 20 {
			break
		}
		name := filepath.Base(w)
		if !tools[name] || fp.Tools[name] != "" {
			continue
		}
		exe, err := exec.LookPath(w)
		if err != nil {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		b, _ := exec.CommandContext(ctx, exe, "--version").CombinedOutput()
		cancel()
		line, _, _ := strings.Cut(strings.TrimSpace(string(b)), "\n")
		fp.Tools[name] = trunc(line, 120)
	}
	return fp
}

func saveFingerprint(key, command string) {
	if b, err := json.Marshal(makeFingerprint(command)); err == nil {
		_ = writePrivate(base(key)+".ok.json", b)
	}
}

func changesSinceSuccess(key, command string) []map[string]string {
	b, err := os.ReadFile(base(key) + ".ok.json")
	if err != nil {
		return nil
	}
	var old fingerprint
	if json.Unmarshal(b, &old) != nil {
		return nil
	}
	return fingerprintDiff(old, makeFingerprint(command))
}

func fingerprintDiff(old, cur fingerprint) []map[string]string {
	var ch []map[string]string
	if old.Command != "" && old.Command != cur.Command {
		ch = append(ch, map[string]string{"kind": "command", "label": "commande modifiée"})
	}
	if old.Path != cur.Path {
		ch = append(ch, map[string]string{"kind": "env", "label": "PATH", "before": trunc(old.Path, 256), "after": trunc(cur.Path, 256)})
	}
	if old.Cwd != cur.Cwd {
		ch = append(ch, map[string]string{"kind": "env", "label": "dossier de lancement", "before": trunc(old.Cwd, 256), "after": trunc(cur.Cwd, 256)})
	}
	n := 0
	for _, v := range old.Vars {
		if !contains(cur.Vars, v) && n < 10 {
			ch = append(ch, map[string]string{"kind": "var", "label": "variable " + v + " absente depuis la dernière réussite"})
			n++
		}
	}
	show := func(s string, ok bool) string {
		if !ok {
			return "—"
		}
		size, ts, _ := strings.Cut(s, ":")
		sec, _ := strconv.ParseInt(ts, 10, 64)
		return size + " octets, " + time.Unix(sec, 0).Format("2006-01-02 15:04")
	}
	var files []string
	for f := range old.Files {
		files = append(files, f)
	}
	sort.Strings(files)
	for _, f := range files {
		nv, ok := cur.Files[f]
		if nv == old.Files[f] {
			continue
		}
		label := f + " modifié depuis la dernière réussite"
		if !ok {
			label = f + " disparu"
		}
		ch = append(ch, map[string]string{"kind": "file", "label": label, "before": show(old.Files[f], true), "after": show(nv, ok)})
	}
	var ts []string
	for t := range old.Tools {
		ts = append(ts, t)
	}
	sort.Strings(ts)
	for _, t := range ts {
		if nv, ok := cur.Tools[t]; ok && nv != old.Tools[t] {
			ch = append(ch, map[string]string{"kind": "tool", "label": "version de " + t, "before": old.Tools[t], "after": nv})
		}
	}
	if len(ch) > 20 {
		ch = ch[:20]
	}
	return ch
}

// ── Sorties attendues (CG_EXPECT, même syntaxe) : « réussi mais n'a rien produit » ──

var (
	minRe = regexp.MustCompile(`^(\d+)([kKmMgG]?)$`)
	ageRe = regexp.MustCompile(`^(\d+)([smhd])$`)
)

func checkExpect(spec string, started float64) []map[string]any {
	units := map[string]int64{"k": 1024, "m": 1 << 20, "g": 1 << 30, "": 1}
	secs := map[string]float64{"s": 1, "m": 60, "h": 3600, "d": 86400}
	var out []map[string]any
	for _, item := range strings.Split(spec, ";") {
		parts := strings.Fields(item)
		if len(parts) == 0 {
			continue
		}
		if len(out) == 5 {
			break
		}
		opts := map[string]string{}
		for _, p := range parts[1:] {
			if k, v, ok := strings.Cut(p, "="); ok {
				opts[k] = v
			}
		}
		minimum := int64(1)
		if m := minRe.FindStringSubmatch(valueOr(opts["min"], "1")); m != nil {
			n, _ := strconv.ParseInt(m[1], 10, 64)
			minimum = n * units[strings.ToLower(m[2])]
		}
		oldest := started - 2
		a := ageRe.FindStringSubmatch(opts["age"])
		if a != nil {
			n, _ := strconv.ParseFloat(a[1], 64)
			oldest = float64(time.Now().Unix()) - n*secs[a[2]]
		}
		hits, _ := filepath.Glob(expandUser(parts[0]))
		sort.Slice(hits, func(i, j int) bool { return mtime(hits[i]) < mtime(hits[j]) })
		res := map[string]any{"pattern": trunc(parts[0], 200), "ok": false}
		if len(hits) == 0 {
			res["reason"] = "absent"
		} else {
			p := hits[len(hits)-1]
			st, _ := os.Stat(p)
			res["path"], res["size"], res["mtime"] = trunc(p, 200), st.Size(), st.ModTime().Unix()
			switch {
			case float64(st.ModTime().Unix()) < oldest && a != nil:
				res["reason"] = "plus vieux que " + opts["age"]
			case float64(st.ModTime().Unix()) < oldest:
				res["reason"] = "pas modifié pendant cette exécution"
			case st.Size() == 0 && minimum > 0:
				res["reason"] = "vide"
			case st.Size() < minimum:
				res["reason"] = fmt.Sprintf("trop petit (%d octets, minimum %d)", st.Size(), minimum)
			default:
				res["ok"] = true
			}
		}
		out = append(out, res)
	}
	return out
}

func valueOr(v, d string) string {
	if v == "" {
		return d
	}
	return v
}

func mtime(p string) int64 {
	if st, err := os.Stat(p); err == nil {
		return st.ModTime().UnixNano()
	}
	return 0
}
