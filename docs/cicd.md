# GitHub Actions → GHCR → Argo CD

Repository: https://github.com/idk3669/resume

- main: source and reviewed infrastructure configuration.
- deploy: CI-generated k8s snapshot, updated only after tests and both image pushes succeed. Do not edit this branch manually.
- Images: ghcr.io/idk3669/resume-api and ghcr.io/idk3669/resume-web. Each source commit has a sha tag; deployment uses immutable digests.
- Pull requests only run tests; they cannot publish or deploy.
- Workflow uses GITHUB_TOKEN; no personal token or Kubernetes administrator credential is needed in Actions.

Push the contents of the resume-platform directory at repository root, including .github. Do not push its parent workspace. Check staged files before committing: no PDF, image archives, kubeconfig, keys or credentials.

After the first successful Actions run, open each GHCR package's settings and change visibility to Public. A public Git repository does not automatically make its container packages public. Verify anonymous pulls of both images before connecting Argo CD.

Install a supported, version-pinned Argo CD non-HA release on the cluster, then apply k8s/platform/argocd/application.yaml. This manifest does not install Argo CD. The project restricts deployment to the resume namespace and the listed kinds. Platform controllers and Gateway CRDs are not managed by the application.

Before the first sync, verify Envoy Gateway is installed and routes to the app: this source changes resume-web to ClusterIP and removes the old app NodePort. Check the Argo CD diff, manually sync, and verify external access. Then enable automatic synchronization and self-healing on Application/resume. Keep automatic pruning disabled initially to retain hashed ConfigMaps for rollback.

Normal changes: edit main → push → tests → publish both images → update deploy → Argo CD sync. To roll back under automated sync, revert the source change on main and let CI publish a new tested snapshot. An imperative kubectl rollout undo alone will be reversed by GitOps reconciliation.

Current status: workflow and Application are prepared locally. Remote push, Actions execution, public package visibility, Argo CD installation and internet URL verification are not yet confirmed.
