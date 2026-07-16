# Backend

## Principles

-   Modular monolith
-   Thin API
-   Domain-driven modules
-   Event-driven communication

## Modules

-   Auth
-   Client
-   Project
-   Timeline
-   Meeting
-   Knowledge
-   Deployment
-   Notification
-   AI

API responsibilities:

-   Authentication
-   CRUD
-   Validation
-   File uploads
-   WebSocket
-   Start Temporal workflows

Never execute long-running AI tasks inside request handlers.
