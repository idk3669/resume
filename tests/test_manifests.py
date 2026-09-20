"""Static consistency checks, not a substitute for API-server/CNI validation."""
from pathlib import Path
import unittest
import yaml

ROOT = Path(__file__).resolve().parents[1]
class ManifestTests(unittest.TestCase):
    def test_workload_security_and_services(self):
        docs = []
        for path in (ROOT / 'k8s').glob('*.yaml'):
            docs.extend(d for d in yaml.safe_load_all(path.read_text()) if d)
        deployments = [d for d in docs if d['kind'] == 'Deployment']
        self.assertEqual(len(deployments), 2)
        for deployment in deployments:
            pod = deployment['spec']['template']['spec']
            self.assertEqual(pod['serviceAccountName'], 'service-resume')
            self.assertFalse(pod['automountServiceAccountToken'])
            self.assertTrue(pod['securityContext']['runAsNonRoot'])
            self.assertEqual(deployment['spec']['replicas'], 2)
            for container in pod['containers']:
                self.assertTrue(container['securityContext']['readOnlyRootFilesystem'])
                self.assertFalse(container['securityContext']['allowPrivilegeEscalation'])
                self.assertIn('readinessProbe', container)
                self.assertIn('livenessProbe', container)
        for role in [d for d in docs if d['kind'] == 'Role']:
            for rule in role['rules']:
                self.assertLessEqual(set(rule['verbs']), {'get', 'list', 'watch'})
                self.assertNotIn('secrets', rule['resources'])
        api_service = next(d for d in docs if d['kind'] == 'Service' and d['metadata']['name'] == 'resume-api')
        self.assertEqual(api_service['spec']['type'], 'ClusterIP')
        config = next(d for d in docs if d['kind'] == 'Kustomization')
        self.assertNotIn('disableNameSuffixHash', config.get('generatorOptions', {}))
        for filename in config['resources']:
            self.assertTrue((ROOT / 'k8s' / filename).is_file())

    def test_compose_api_not_exposed(self):
        config = yaml.safe_load((ROOT / 'compose.yaml').read_text())
        self.assertNotIn('ports', config['services']['resume-api'])
        self.assertTrue(config['services']['resume-web']['read_only'])

if __name__ == '__main__':
    unittest.main()
