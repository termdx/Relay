/** Base class for all typed runtime errors. */
export class RuntimeError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class WorkspaceNotFoundError extends RuntimeError {
  constructor(startDir: string) {
    super(
      `No Relay workspace found from ${startDir} (no relay.yaml up the tree). Run "relay init".`,
      'WORKSPACE_NOT_FOUND',
    );
  }
}

export class WorkspaceExistsError extends RuntimeError {
  constructor(dir: string) {
    super(`A Relay workspace already exists at ${dir}.`, 'WORKSPACE_EXISTS');
  }
}

export class ManifestValidationError extends RuntimeError {
  constructor(
    readonly file: string,
    readonly issues: string[],
  ) {
    super(
      `Invalid manifest ${file}:\n  - ${issues.join('\n  - ')}`,
      'MANIFEST_INVALID',
    );
  }
}

export class NotFoundError extends RuntimeError {
  constructor(kind: string, id: string) {
    super(`${kind} "${id}" is not installed.`, 'NOT_FOUND');
  }
}

export class AlreadyExistsError extends RuntimeError {
  constructor(kind: string, id: string) {
    super(`${kind} "${id}" is already installed.`, 'ALREADY_EXISTS');
  }
}

export class WorkspaceLockedError extends RuntimeError {
  constructor(pid: number) {
    super(
      `Workspace is locked by another Relay process (pid ${pid}).`,
      'WORKSPACE_LOCKED',
    );
  }
}

export class UnknownCatalogItemError extends RuntimeError {
  constructor(kind: string, id: string) {
    super(`Unknown ${kind} "${id}" — not in the catalog.`, 'UNKNOWN_CATALOG_ITEM');
  }
}

export class CircularDependencyError extends RuntimeError {
  constructor(readonly cycle: string[]) {
    super(`Circular dependency: ${cycle.join(' -> ')}.`, 'CIRCULAR_DEPENDENCY');
  }
}

export class HasDependentsError extends RuntimeError {
  constructor(id: string, readonly dependents: string[]) {
    super(
      `Cannot remove "${id}" — required by: ${dependents.join(', ')}.`,
      'HAS_DEPENDENTS',
    );
  }
}

export class UnmetDependenciesError extends RuntimeError {
  constructor(id: string, readonly missing: string[]) {
    super(
      `"${id}" needs dependencies not installed: ${missing.join(', ')}. Re-run with dependency install enabled.`,
      'UNMET_DEPENDENCIES',
    );
  }
}
