package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"testing"
)

// La liste de masquage est celle de _CG_MASK (sdk/python), assertions (?!…) retirées.
func TestMaskSameListAsPython(t *testing.T) {
	py, err := os.ReadFile("../python/cronguard.py")
	if err != nil {
		t.Fatal(err)
	}
	s := string(py)
	i := strings.Index(s, "_CG_MASK = [")
	block := s[i : i+strings.Index(s[i:], "\n]")]
	la := regexp.MustCompile(`\(\?!(?:[^()]|\([^()]*\))*\)`)
	var want []string
	for _, m := range regexp.MustCompile(`r'((?:\\.|[^'\\])*)'`).FindAllStringSubmatch(block, -1) {
		want = append(want, la.ReplaceAllString(m[1], ""))
	}
	if len(want) < 25 || strings.Join(want, "\n") != strings.Join(maskSrc, "\n") {
		t.Fatalf("liste différente de sdk/python _CG_MASK (%d contre %d motifs)", len(maskSrc), len(want))
	}
	for k := range maskReject { // chaque refus vise bien un motif existant
		n := 0
		for _, p := range maskSrc {
			if strings.Contains(p, k) {
				n++
			}
		}
		if n != 1 {
			t.Fatalf("refus %q : %d motifs", k, n)
		}
	}
}

func TestMaskSecrets(t *testing.T) {
	out := maskSecrets("connect postgres://app:S3cretPw@db/x failed\nAPI_TOKEN=abcd1234efgh\nPermitRootLogin password=NO")
	for _, leak := range []string{"S3cretPw", "abcd1234efgh"} {
		if strings.Contains(out, leak) {
			t.Fatalf("secret visible : %s", out)
		}
	}
	if !strings.Contains(out, "password=NO") { // (?!(?:YES|NO)\b) en Python
		t.Fatalf("« NO » masqué à tort : %s", out)
	}
	if got := maskSecrets("docker login -p $REG_PASS registry"); strings.Contains(got, "REDACTED") {
		t.Fatalf("variable shell masquée à tort : %s", got)
	}
}

type srv struct {
	mu   sync.Mutex
	got  []map[string]any
	keys []string
	*httptest.Server
}

func newSrv() *srv {
	s := &srv{}
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		var m map[string]any
		json.Unmarshal(b, &m)
		s.mu.Lock()
		s.got, s.keys = append(s.got, m), append(s.keys, filepath.Base(r.URL.Path))
		s.mu.Unlock()
		w.Write([]byte("{}"))
	}))
	return s
}

func setup(t *testing.T, url string) string {
	d := t.TempDir()
	t.Setenv("CG_STATE_DIR", d)
	t.Setenv("CRONGUARD_URL", url)
	t.Setenv("CG_PROBE_NET", "0")
	t.Setenv("CG_EXPECT", "")
	return d
}

func TestRunFailureWithStepsAndPaths(t *testing.T) {
	s := newSrv()
	defer s.Close()
	setup(t, s.URL)
	code := run("job", []string{"sh", "-c", `cat /nonexistent/in.csv; exit 3`})
	if code != 3 || len(s.got) != 1 {
		t.Fatalf("code %d, %d pings", code, len(s.got))
	}
	b := s.got[0]
	ctx := b["context"].(map[string]any)
	if b["status"] != "fail" || b["exit_code"] != float64(3) || b["command"] != "cat /nonexistent/in.csv; exit 3" {
		t.Fatalf("ping : %v", b)
	}
	paths := ctx["paths"].([]any)
	if paths[0].(map[string]any)["path"] != "/nonexistent/in.csv" || paths[0].(map[string]any)["exists"] != false {
		t.Fatalf("chemins : %v", paths)
	}
}

func TestSteps(t *testing.T) {
	s := newSrv()
	defer s.Close()
	setup(t, s.URL)
	bin := os.Getenv("CG_TEST_BIN") // binaire compilé, pour que le script appelle « cronguard step »
	if bin == "" {
		t.Skip("CG_TEST_BIN absent")
	}
	run("steps", []string{"sh", "-c", bin + " step dump; " + bin + " step upload; echo 'upload failed: 403'; exit 1"})
	steps := s.got[0]["context"].(map[string]any)["steps"].([]any)
	if len(steps) != 2 || steps[1].(map[string]any)["name"] != "upload" {
		t.Fatalf("étapes : %v", steps)
	}
}

func TestQueueReplayInOrder(t *testing.T) {
	d := setup(t, "http://127.0.0.1:1")
	for _, i := range []string{"1", "2", "3"} {
		run("queue", []string{"sh", "-c", "echo run " + i + "; exit 1"})
	}
	if n := len(queued(filepath.Join(d, "queue"))); n != 3 {
		t.Fatalf("file : %d", n)
	}
	s := newSrv()
	defer s.Close()
	t.Setenv("CRONGUARD_URL", s.URL)
	run("queue", []string{"true"})
	var seq []string
	for _, g := range s.got {
		if o, ok := g["output"].(string); ok {
			seq = append(seq, strings.TrimSpace(o))
		} else {
			seq = append(seq, g["status"].(string))
		}
	}
	if strings.Join(seq, ",") != "run 1,run 2,run 3,success" {
		t.Fatalf("ordre : %v", seq)
	}
}

func TestExpectAndChanged(t *testing.T) {
	s := newSrv()
	defer s.Close()
	d := setup(t, s.URL)
	t.Setenv("CG_PARITY_VAR", "1")
	script := filepath.Join(d, "job.sh")
	os.WriteFile(script, []byte("#!/bin/sh\ntrue\n"), 0o755)
	run("exp", []string{script}) // réussite : empreinte gardée
	os.Unsetenv("CG_PARITY_VAR")
	os.WriteFile(script, []byte("#!/bin/sh\necho changed\ntrue\n"), 0o755)
	t.Setenv("CG_EXPECT", filepath.Join(d, "db-*.dump")+" min=1k")
	code := run("exp", []string{script})
	b := s.got[1]
	if code != 0 || b["status"] != "fail" || b["exit_code"] != float64(0) {
		t.Fatalf("CG_EXPECT : code %d, %v", code, b)
	}
	ctx := b["context"].(map[string]any)
	if ctx["expect"].([]any)[0].(map[string]any)["reason"] != "absent" {
		t.Fatalf("expect : %v", ctx["expect"])
	}
	labels := ""
	for _, c := range ctx["changed"].([]any) {
		labels += c.(map[string]any)["label"].(string) + "|"
	}
	if !strings.Contains(labels, "variable CG_PARITY_VAR absente") || !strings.Contains(labels, "job.sh modifié depuis la dernière réussite") {
		t.Fatalf("changé : %s", labels)
	}
}

func TestOverlapSkip(t *testing.T) {
	s := newSrv()
	defer s.Close()
	d := setup(t, s.URL)
	os.WriteFile(filepath.Join(d, "ov.lock"), []byte("1 1700000000\n"), 0o600) // pid 1 : toujours vivant
	t.Setenv("CG_SKIP_IF_RUNNING", "1")
	flag := filepath.Join(d, "ran")
	if code := run("ov", []string{"touch", flag}); code != 0 {
		t.Fatalf("code %d", code)
	}
	if _, err := os.Stat(flag); err == nil {
		t.Fatal("commande lancée malgré CG_SKIP_IF_RUNNING")
	}
	b := s.got[0]
	if b["exit_code"] != float64(75) || b["context"].(map[string]any)["overlap"].(map[string]any)["pid"] != float64(1) {
		t.Fatalf("chevauchement : %v", b)
	}
}

func TestCommandNotFound(t *testing.T) {
	s := newSrv()
	defer s.Close()
	setup(t, s.URL)
	if code := run("nf", []string{"no-such-tool-xyz"}); code != 127 {
		t.Fatalf("code %d", code)
	}
	if !strings.Contains(s.got[0]["output"].(string), "no-such-tool-xyz") {
		t.Fatalf("sortie : %v", s.got[0]["output"])
	}
}
