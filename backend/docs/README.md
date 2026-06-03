# Khoroch — Backend Plan

**Khoroch** (খরচ) is a personal expense management application built with NestJS, PostgreSQL, and Drizzle ORM.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS (v11) |
| Language | TypeScript |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| Auth | JWT (access + refresh tokens) |
| Validation | class-validator + class-transformer |
| Config | @nestjs/config (.env) |
| Testing | Jest + Supertest |

## Development Phases

| Phase | Topic | File |
|---|---|---|
| 1 | Project Setup & Configuration | [phase-1-setup.md](./phase-1-setup.md) |
| 2 | Database Schema Design | [phase-2-schema.md](./phase-2-schema.md) |
| 3 | Authentication Module | [phase-3-auth.md](./phase-3-auth.md) |
| 4 | Core Expense Modules | [phase-4-core-modules.md](./phase-4-core-modules.md) |
| 5 | Reports & Analytics | [phase-5-reports.md](./phase-5-reports.md) |
| 6 | Testing & Deployment | [phase-6-testing-deployment.md](./phase-6-testing-deployment.md) |

## High-Level Feature Set

- User registration and authentication (JWT)
- Expense CRUD with categories and tags
- Income tracking
- Budget limits per category per period
- Monthly / yearly summaries and reports
- Recurring expense support
- Multi-currency support (optional phase)

## Folder Structure (target)

```
src/
├── app.module.ts
├── main.ts
├── common/
│   ├── decorators/
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── guards/
│   ├── interceptors/
│   │   └── response.interceptor.ts
│   ├── pipes/
│   └── types/
│       └── api-response.type.ts
├── config/
│   └── database.config.ts
├── database/
│   ├── drizzle.module.ts
│   ├── drizzle.provider.ts
│   └── schema/
│       ├── users.schema.ts
│       ├── categories.schema.ts
│       ├── expenses.schema.ts
│       ├── incomes.schema.ts
│       ├── budgets.schema.ts
│       └── index.ts
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   ├── jwt.strategy.ts
│   │   └── jwt-refresh.strategy.ts
│   └── dto/
├── users/
│   ├── users.module.ts
│   ├── users.service.ts
│   └── dto/
├── categories/
├── expenses/
├── incomes/
├── budgets/
└── reports/
```
