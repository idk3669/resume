# Monitoring stack

Argo CD manages two applications:

1. `local-path-provisioner` v0.0.37 creates `local-path` persistent volumes on the selected worker node.
2. `monitoring` installs the pinned `kube-prometheus-stack` chart 89.2.0.

The local lab profile deliberately uses one Prometheus and one Grafana instance. Prometheus retains 3 days in a 10Gi local PVC; Grafana uses a 2Gi local PVC. A local-path volume survives Pod restart but is not multi-node replicated, so this is not a production HA storage design.

Grafana runs only on the VM network at `http://192.168.96.10:30300`. Do not add it to the public Cloudflare route. The chart installs node, workload and Kubernetes dashboards. Resume API request metrics require a later `/metrics` endpoint and `ServiceMonitor`.

Before applying the Argo applications, create the Grafana administrator secret once. Do not commit it:

```bash
kubectl create namespace monitoring
kubectl -n monitoring create secret generic monitoring-grafana-admin \
  --from-literal=admin-user=admin \
  --from-literal=admin-password='<choose-a-long-password>'
```

Apply the versioned Argo declarations from the cloned repository after their main-branch commit has been pushed:

```bash
kubectl apply -f k8s/platform/argocd/monitoring-applications.yaml
```

Verify first that `local-path-provisioner` is Healthy, then allow `monitoring` to sync. Grafana credentials can be verified without printing the password:

```bash
kubectl -n monitoring get secret monitoring-grafana-admin
kubectl -n monitoring get pods
kubectl get pvc -n monitoring
```
