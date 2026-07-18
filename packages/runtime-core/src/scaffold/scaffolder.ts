import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentManifest } from '../schemas/agent';
import type { ModuleManifest } from '../schemas/module';
import type { WorkflowManifest } from '../schemas/workflow';

/**
 * Writes the developer-facing scaffold alongside a manifest (the manifest
 * itself is written by the manifest store). Deliberately minimal in v1 — a
 * README plus a starter stub — since in-process module/agent code loading is
 * a later phase.
 */
export async function scaffoldAgent(
  agentsDir: string,
  manifest: AgentManifest,
): Promise<string> {
  const dir = join(agentsDir, manifest.id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'README.md'),
    `# ${manifest.name}\n\n${manifest.description ?? ''}\n\n- Model: \`${manifest.model}\`\n- Tools: ${manifest.tools.join(', ') || 'none'}\n- Memory: ${manifest.memory.kind}\n`,
    'utf8',
  );
  // Framework-neutral stub: agent loops run as orchestration activities using
  // the provider SDK's native tool-calling (ai.md) — no agent framework.
  await writeFile(
    join(dir, 'agent.ts'),
    `/** Agent: ${manifest.name}\n * Model: ${manifest.model}\n */\n\n// TODO: implement the ${manifest.id} agent loop.\n\nexport function buildAgent(): never {\n  throw new Error('Implement the ${manifest.id} agent');\n}\n`,
    'utf8',
  );
  return dir;
}

export async function scaffoldWorkflow(
  workflowsDir: string,
  manifest: WorkflowManifest,
): Promise<string> {
  const dir = join(workflowsDir, manifest.id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'README.md'),
    `# ${manifest.displayName ?? manifest.id}\n\n${manifest.description ?? ''}\n${manifest.module ? `\nOwning module: \`${manifest.module}\`\n` : ''}`,
    'utf8',
  );
  return dir;
}

export async function scaffoldModule(
  modulesDir: string,
  manifest: ModuleManifest,
): Promise<string> {
  const dir = join(modulesDir, manifest.id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'README.md'),
    `# ${manifest.displayName ?? manifest.id}\n\n${manifest.description ?? ''}\n\nDeclares: ${
      Object.entries(manifest.capabilities)
        .filter(([, on]) => on)
        .map(([name]) => name)
        .join(', ') || 'no capabilities yet'
    }.\n`,
    'utf8',
  );
  return dir;
}
