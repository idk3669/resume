#!/usr/bin/env bash
set -euo pipefail
account='system:serviceaccount:resume:service-resume'
check() {
  local expected="$1" verb="$2" resource="$3" result
  result=$(kubectl auth can-i "$verb" "$resource" -n resume --as="$account" || true)
  if [[ "$result" != "$expected" ]]; then
    printf 'FAIL: %s %s expected=%s actual=%s\n' "$verb" "$resource" "$expected" "$result"
    exit 1
  fi
  printf 'PASS: %s %s -> %s\n' "$verb" "$resource" "$result"
}
for resource in pods services deployments.apps replicasets.apps; do
  check yes get "$resource"
  for verb in create update patch delete deletecollection; do
    check no "$verb" "$resource"
  done
done
check no get secrets
check no create pods/exec
check no get nodes
check no patch serviceaccounts
