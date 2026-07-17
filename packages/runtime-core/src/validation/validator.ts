import type { AgentManifest } from '../schemas/agent';
import type { AiProviderManifest } from '../schemas/ai-provider';
import type { IntegrationManifest } from '../schemas/integration';
import type { ModuleManifest } from '../schemas/module';
import type { WorkflowManifest } from '../schemas/workflow';

export interface Diagnostic {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ValidationInput {
  modules: ModuleManifest[];
  integrations: IntegrationManifest[];
  aiProviders: AiProviderManifest[];
  secretRefs: string[];
  workflows?: WorkflowManifest[];
  agents?: AgentManifest[];
}

/** Find a dependency cycle among installed modules, if any. */
function findCycle(modules: ModuleManifest[]): string[] | null {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  let cycle: string[] | null = null;

  const visit = (id: string, stack: string[]): void => {
    if (cycle || done.has(id)) return;
    if (visiting.has(id)) {
      cycle = [...stack.slice(stack.indexOf(id)), id];
      return;
    }
    const module = byId.get(id);
    if (!module) return; // missing deps handled separately
    visiting.add(id);
    for (const dep of module.dependencies) visit(dep, [...stack, id]);
    visiting.delete(id);
    done.add(id);
  };

  for (const module of modules) visit(module.id, []);
  return cycle;
}

/**
 * Whole-workspace validation. Aggregates the problems that would make a
 * generated runtime incoherent: missing/circular deps, unmet integrations or
 * AI capabilities, missing secrets, and host-port conflicts.
 */
export function validateWorkspace(input: ValidationInput): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const moduleIds = new Set(input.modules.map((m) => m.id));
  const integrationIds = new Set(input.integrations.map((i) => i.id));
  const capabilities = new Set(input.aiProviders.flatMap((p) => p.capabilities));
  const secretRefs = new Set(input.secretRefs);

  for (const module of input.modules) {
    for (const dep of module.dependencies) {
      if (!moduleIds.has(dep)) {
        diagnostics.push({
          level: 'error',
          code: 'MISSING_DEPENDENCY',
          message: `module "${module.id}" depends on "${dep}", which is not installed`,
        });
      }
    }
    for (const integration of module.requiredIntegrations) {
      if (!integrationIds.has(integration)) {
        diagnostics.push({
          level: 'error',
          code: 'MISSING_INTEGRATION',
          message: `module "${module.id}" requires integration "${integration}", which is not installed`,
        });
      }
    }
    for (const capability of module.requiredAiCapabilities) {
      if (!capabilities.has(capability)) {
        diagnostics.push({
          level: 'error',
          code: 'MISSING_AI_CAPABILITY',
          message: `module "${module.id}" requires AI capability "${capability}" — no installed provider offers it`,
        });
      }
    }
  }

  const cycle = findCycle(input.modules);
  if (cycle) {
    diagnostics.push({
      level: 'error',
      code: 'CIRCULAR_DEPENDENCY',
      message: `circular module dependency: ${cycle.join(' -> ')}`,
    });
  }

  for (const integration of input.integrations) {
    for (const field of integration.credentials) {
      if (field.required && !secretRefs.has(field.secretRef)) {
        diagnostics.push({
          level: 'error',
          code: 'MISSING_SECRET',
          message: `integration "${integration.id}" needs secret "${field.secretRef}", which is not set`,
        });
      }
    }
  }

  const workflowIds = new Set((input.workflows ?? []).map((w) => w.id));
  for (const workflow of input.workflows ?? []) {
    if (workflow.module && !moduleIds.has(workflow.module)) {
      diagnostics.push({
        level: 'error',
        code: 'MISSING_WORKFLOW_MODULE',
        message: `workflow "${workflow.id}" references module "${workflow.module}", which is not installed`,
      });
    }
  }

  const providerIds = new Set(input.aiProviders.map((p) => p.id));
  for (const agent of input.agents ?? []) {
    if (agent.workflow && !workflowIds.has(agent.workflow)) {
      diagnostics.push({
        level: 'error',
        code: 'MISSING_AGENT_WORKFLOW',
        message: `agent "${agent.id}" references workflow "${agent.workflow}", which does not exist`,
      });
    }
    const providerPrefix = agent.model.split('/')[0];
    if (providerPrefix && !providerIds.has(providerPrefix)) {
      diagnostics.push({
        level: 'warning',
        code: 'UNKNOWN_AGENT_PROVIDER',
        message: `agent "${agent.id}" uses model "${agent.model}" but no AI provider "${providerPrefix}" is installed`,
      });
    }
  }

  const portOwners = new Map<string, string>();
  for (const module of input.modules) {
    for (const service of module.services) {
      for (const mapping of service.ports ?? []) {
        const hostPort = mapping.split(':')[0] ?? mapping;
        const owner = `${module.id}/${service.name}`;
        const existing = portOwners.get(hostPort);
        if (existing) {
          diagnostics.push({
            level: 'error',
            code: 'PORT_CONFLICT',
            message: `host port ${hostPort} is claimed by both "${existing}" and "${owner}"`,
          });
        } else {
          portOwners.set(hostPort, owner);
        }
      }
    }
  }

  return diagnostics;
}
