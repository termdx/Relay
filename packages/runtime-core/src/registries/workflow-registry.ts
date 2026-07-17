import type { ManifestStore } from '../manifest/manifest-store';
import {
  workflowManifestSchema,
  type WorkflowManifest,
} from '../schemas/workflow';

export interface CreateWorkflowInput {
  id: string;
  displayName?: string;
  description?: string;
  module?: string;
}

/** Manages workflow definitions (workflows/<id>.yaml). */
export class WorkflowRegistry {
  constructor(private readonly store: ManifestStore<WorkflowManifest>) {}

  list(): Promise<WorkflowManifest[]> {
    return this.store.readAll();
  }

  info(id: string): Promise<WorkflowManifest> {
    return this.store.read(id);
  }

  remove(id: string): Promise<void> {
    return this.store.remove(id);
  }

  async create(input: CreateWorkflowInput): Promise<WorkflowManifest> {
    const manifest = workflowManifestSchema.parse({
      id: input.id,
      version: '0.1.0',
      displayName: input.displayName,
      description: input.description,
      module: input.module,
    });
    await this.store.create(manifest);
    return manifest;
  }
}
