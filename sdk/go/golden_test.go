package main

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// Cas dorés communs aux SDK (../testdata/golden.json, référence : le bloc partagé bash/Python).
// Dates des fichiers exclues : rendues dans le fuseau de la machine.
type golden struct {
	Mask []struct {
		In  string `json:"in"`
		Out string `json:"out"`
	} `json:"mask"`
	FpDiff []struct {
		Name string              `json:"name"`
		Old  fingerprint         `json:"old"`
		New  fingerprint         `json:"new"`
		Out  []map[string]string `json:"out"`
	} `json:"fpdiff"`
}

func comparable(xs []map[string]string) []map[string]string {
	out := []map[string]string{}
	for _, x := range xs {
		if x["kind"] == "file" {
			x = map[string]string{"kind": x["kind"], "label": x["label"]}
		}
		out = append(out, x)
	}
	return out
}

func TestGolden(t *testing.T) {
	b, err := os.ReadFile("../testdata/golden.json")
	if err != nil {
		t.Fatal(err)
	}
	var g golden
	if err := json.Unmarshal(b, &g); err != nil {
		t.Fatal(err)
	}
	for _, c := range g.Mask {
		if got := maskSecrets(c.In); got != c.Out {
			t.Errorf("masquage %q :\n  obtenu  %q\n  attendu %q", c.In, got, c.Out)
		}
	}
	for _, c := range g.FpDiff {
		if got := comparable(fingerprintDiff(c.Old, c.New)); !reflect.DeepEqual(got, comparable(c.Out)) {
			t.Errorf("empreinte %s :\n  obtenu  %v\n  attendu %v", c.Name, got, comparable(c.Out))
		}
	}
}
