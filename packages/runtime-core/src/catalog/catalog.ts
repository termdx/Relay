import {
  integrationManifestSchema,
  type IntegrationManifest,
} from '../schemas/integration';
import { moduleManifestSchema, type ModuleManifest } from '../schemas/module';

/**
 * Built-in catalog of installable modules and integrations. Until a remote
 * registry exists, `relay module add <id>` / `relay integration add <id>`
 * install from here. Dependencies declared here drive resolution.
 */
const MODULES = {
  projects: {
    id: 'projects',
    version: '0.1.0',
    displayName: 'Projects',
    description: 'Clients, projects, and members — the base record module.',
    capabilities: { apiRoutes: true, storage: true },
    services: [
      {
        name: 'backend',
        image: 'relay-backend:local',
        ports: ['3000:3000'],
        env: {
          PORT: '3000',
          DATABASE_URL:
            'postgresql://relay:${POSTGRES_PASSWORD}@postgres:5432/relay',
          JWT_SECRET: '${JWT_SECRET}',
          AI_PROVIDER: '${AI_PROVIDER}',
          GEMINI_API_KEY: '${GEMINI_API_KEY}',
          GEMINI_MODEL: '${GEMINI_MODEL}',
          // Integration credentials, resolved from the secret store at
          // generate time; ':-' keeps compose quiet when not installed.
          GITHUB_TOKEN: '${GITHUB_TOKEN:-}',
          SMTP_URL: '${SMTP_URL:-}',
          SMTP_FROM: '${SMTP_FROM:-}',
        },
        dependsOn: ['postgres'],
        restart: 'unless-stopped',
        healthcheck: {
          // Node is always present in the backend image; wget/curl are not.
          test: [
            'CMD',
            'node',
            '-e',
            "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
          ],
          interval: '15s',
          timeout: '5s',
          retries: 5,
        },
      },
    ],
  },
  meeting: {
    id: 'meeting',
    version: '0.1.0',
    displayName: 'Meetings',
    description: 'Meeting → approval → tasks loop.',
    dependencies: ['projects'],
    requiredIntegrations: ['github'],
    requiredAiCapabilities: ['draft'],
    capabilities: { apiRoutes: true, ai: true },
  },
  timeline: {
    id: 'timeline',
    version: '0.1.0',
    displayName: 'Timeline',
    description: 'Per-project activity timeline.',
    dependencies: ['projects'],
    capabilities: { apiRoutes: true },
  },
  knowledge: {
    id: 'knowledge',
    version: '0.1.0',
    displayName: 'Knowledge',
    description: 'Project knowledge index for client Q&A.',
    dependencies: ['projects'],
    requiredAiCapabilities: ['chat'],
    capabilities: { apiRoutes: true, ai: true, storage: true },
  },
} as const;

const INTEGRATIONS = {
  github: {
    id: 'github',
    version: '0.1.0',
    displayName: 'GitHub',
    credentials: [{ name: 'token', secretRef: 'github.token', required: true }],
    healthChecks: [
      { name: 'api', type: 'http', target: 'https://api.github.com' },
    ],
  },
  slack: {
    id: 'slack',
    version: '0.1.0',
    displayName: 'Slack',
    credentials: [{ name: 'token', secretRef: 'slack.token', required: true }],
  },
  smtp: {
    id: 'smtp',
    version: '0.1.0',
    displayName: 'Email (SMTP)',
    description:
      'Outbound email: approval requests, digests. URL form: smtp[s]://user:pass@host:port',
    credentials: [
      { name: 'url', secretRef: 'smtp.url', required: true },
      { name: 'from', secretRef: 'smtp.from', required: false },
    ],
  },
} as const;

export const MODULE_CATALOG: Record<string, ModuleManifest> = Object.fromEntries(
  Object.entries(MODULES).map(([id, raw]) => [id, moduleManifestSchema.parse(raw)]),
);

export const INTEGRATION_CATALOG: Record<string, IntegrationManifest> =
  Object.fromEntries(
    Object.entries(INTEGRATIONS).map(([id, raw]) => [
      id,
      integrationManifestSchema.parse(raw),
    ]),
  );
