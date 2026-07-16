# Architecture

## Philosophy

Agency OS is composed of three core systems:

-   **System of Record** --- API + PostgreSQL
-   **System of Orchestration** --- Temporal
-   **System of Intelligence** --- LangGraph + AI Gateway

Desktop is the control plane. The backend is the source of truth.

## High-Level Architecture

``` text
Desktop (Tauri)
    │
REST + WebSocket
    │
API Server
    │
├── PostgreSQL
├── Redis
├── Object Storage
└── Temporal Server
         │
   Temporal Workers
         │
     LangGraph
         │
     LiteLLM
         │
Model Providers
```
