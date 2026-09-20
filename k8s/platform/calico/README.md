# Calico network configuration

This directory records the local cluster's Calico configuration. The cluster uses Calico `v3.32.2` with a `10.244.0.0/16` Pod network and VXLAN encapsulation. That Pod CIDR must match the `--pod-network-cidr` passed to `kubeadm init`.

Install the upstream CRDs and operator once, then apply the locally managed settings:

```bash
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.32.2/manifests/v1_crd_projectcalico_org.yaml
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.32.2/manifests/tigera-operator.yaml
kubectl apply -f installation.yaml
```

The first two are vendor manifests pinned to the exact Calico release. `installation.yaml` is the environment-specific manifest maintained in this repository. Do not use `kubectl apply` for the large upstream CRD bundle; Calico recommends `create` for initial installation because client-side apply can exceed request limits.

Verify the rollout from the control-plane node:

```bash
kubectl get nodes
kubectl get pods -n calico-system
kubectl get ippools
```
