import type { ManifestStore } from '../manifest/manifest-store';
import { agentManifestSchema, type AgentManifest } from '../schemas/agent';

export interface CreateAgentInput {
  id: string;
  name: string;
  description?: string;
  /** Provider-qualified model, e.g. "gemini/gemini-2.5-flash". */
  model: string;
  /** Standing instruction — Run executes this with zero further input. */
  mission?: string;
  /** Backend project ids the agent operates on. */
  projects?: string[];
  tools?: string[];
  workflow?: string;
  memory?: 'none' | 'buffer' | 'vector';
}

/** Manages agent definitions (agents/<id>.yaml). */
export class AgentRegistry {
  constructor(private readonly store: ManifestStore<AgentManifest>) {}

  list(): Promise<AgentManifest[]> {
    return this.store.readAll();
  }

  info(id: string): Promise<AgentManifest> {
    return this.store.read(id);
  }

  remove(id: string): Promise<void> {
    return this.store.remove(id);
  }

  async create(input: CreateAgentInput): Promise<AgentManifest> {
    const memoryKind = input.memory ?? 'none';
    const manifest = agentManifestSchema.parse({
      id: input.id,
      version: '0.1.0',
      name: input.name,
      description: input.description,
      model: input.model,
      mission: input.mission,
      projects: input.projects ?? [],
      tools: input.tools ?? [],
      workflow: input.workflow,
      memory: { enabled: memoryKind !== 'none', kind: memoryKind },
    });
    await this.store.create(manifest);
    return manifest;
  }
}
