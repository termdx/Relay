import { join } from 'node:path';

/** The on-disk layout of a Relay workspace. The runtime owns every path here. */
export interface WorkspacePaths {
  root: string;
  relayYaml: string;
  modulesDir: string;
  integrationsDir: string;
  aiDir: string;
  workflowsDir: string;
  agentsDir: string;
  secretsDir: string;
  secretsFile: string;
  generatedDir: string;
  composeFile: string;
  envFile: string;
  lockFile: string;
}

export const RELAY_YAML = 'relay.yaml';

export function workspacePaths(root: string): WorkspacePaths {
  const generatedDir = join(root, 'generated');
  const secretsDir = join(root, 'secrets');
  return {
    root,
    relayYaml: join(root, RELAY_YAML),
    modulesDir: join(root, 'modules'),
    integrationsDir: join(root, 'integrations'),
    aiDir: join(root, 'ai'),
    workflowsDir: join(root, 'workflows'),
    agentsDir: join(root, 'agents'),
    secretsDir,
    secretsFile: join(secretsDir, 'secrets.enc'),
    generatedDir,
    composeFile: join(generatedDir, 'docker-compose.yml'),
    envFile: join(generatedDir, '.env'),
    lockFile: join(generatedDir, 'runtime.lock'),
  };
}

/** Directories that make up an initialized workspace, in creation order. */
export function workspaceDirs(paths: WorkspacePaths): string[] {
  return [
    paths.modulesDir,
    paths.integrationsDir,
    paths.aiDir,
    paths.workflowsDir,
    paths.agentsDir,
    paths.secretsDir,
    paths.generatedDir,
  ];
}
