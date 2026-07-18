# AI

AI in Relay drafts, summarizes, and answers — it never writes business data
directly, and nothing AI-generated reaches a client without human approval.

## Capabilities, not vendors

Backend modules depend on capability ports; providers are adapters resolved
from runtime manifests (`ai/<id>.yaml`):

| Capability | Purpose | Status |
|---|---|---|
| draft | Transcript → summary + task list (meeting module) | shipped (Gemini + stub) |
| chat | Grounded Q&A over retrieved knowledge (portal, desktop) | shipped (Gemini + stub) |
| embed | Chunk embeddings for the knowledge base (pgvector, 768-dim) | shipped (Gemini + stub) |

Modules declare `requiredAiCapabilities`; the runtime's dependency resolver
enforces that an installed provider covers them. Provider API keys live in the
runtime secret store.

## Providers

Gemini is wired today. The provider registry is designed for more (OpenAI,
Anthropic, Ollama, OpenRouter, …) — each is a manifest plus an adapter per
capability. A gateway (LiteLLM) may later slot in as a single adapter if
provider sprawl warrants it; it is not a prerequisite.

## Rules

- Every AI output that could reach a client is a **draft** attached to an
  approval record.
- Chat answers must be grounded in retrieved knowledge chunks and cite them;
  retrieval scoping (client/project) happens in the query, never via prompt.
- Prompts and generation config live with the owning module; the stub
  provider keeps every AI feature testable offline.
- Long-running AI work (bulk embedding, digest generation) belongs in the
  orchestration layer, not request handlers.
