#!/usr/bin/env bash
set -euo pipefail
# The deploy branch contains a snapshot only after BOTH images were published.
# Argo CD must not track main: main can contain changes still being tested.
head_sha=$(git ls-remote origin refs/heads/main | cut -f1)
if [[ "$head_sha" != "$SOURCE_SHA" ]]; then
  echo 'A newer main commit exists; skip stale deployment promotion.'
  exit 0
fi
snapshot=$(mktemp -d)
cp -R k8s "$snapshot/k8s"
python -m pip install PyYAML==6.0.2
export SNAPSHOT_DIR="$snapshot"
python - <<'PY'
import os
from pathlib import Path
import yaml
p = Path(os.environ['SNAPSHOT_DIR']) / 'k8s/kustomization.yaml'
data = yaml.safe_load(p.read_text())
for image in data['images']:
    image['newName'] = 'ghcr.io/idk3669/' + image['name']
    image.pop('newTag', None)
    image['digest'] = os.environ['API_DIGEST' if image['name'] == 'resume-api' else 'WEB_DIGEST']
p.write_text(yaml.safe_dump(data, sort_keys=False))
PY
cd "$snapshot"
git init
git remote add origin https://github.com/idk3669/resume.git
gh auth setup-git
if git ls-remote --exit-code --heads origin deploy >/dev/null; then
  git fetch origin deploy
  # Keep the generated files while attaching the existing deployment history.
  git reset --mixed FETCH_HEAD
fi
git checkout -B deploy
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
git add k8s
if git diff --cached --quiet; then exit 0; fi
git commit -m "Deploy source $SOURCE_SHA"
git push origin HEAD:deploy
