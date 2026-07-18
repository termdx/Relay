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

  /** Update an agent in place; unset fields keep their current value. */
  async update(
    id: string,
    changes: Partial<Omit<CreateAgentInput, 'id'>>,
  ): Promise<AgentManifest> {
    const existing = await this.store.read(id);
    const memoryKind = changes.memory ?? existing.memory.kind;
    const manifest = agentManifestSchema.parse({
      ...existing,
      name: changes.name ?? existing.name,
      description: changes.description ?? existing.description,
      model: changes.model ?? existing.model,
      // Empty string clears the mission; undefined keeps it.
      mission:
        changes.mission !== undefined
          ? changes.mission || undefined
          : existing.mission,
      projects: changes.projects ?? existing.projects,
      tools: changes.tools ?? existing.tools,
      workflow: changes.workflow ?? existing.workflow,
      memory: { enabled: memoryKind !== 'none', kind: memoryKind },
    });
    await this.store.write(manifest);
    return manifest;
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
