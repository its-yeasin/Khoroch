# Phase 6 — Testing & Deployment

## Goals

- Unit tests for services
- E2E tests for critical flows
- Production-ready configuration
- Docker setup for local development
- Deployment checklist

---

## Step 6.1 — Unit Testing

Each service should have a corresponding `.spec.ts` file.

### What to test

| Service | Key Test Cases |
|---|---|
| `AuthService` | register (success, duplicate email), login (success, wrong password), refresh (valid, invalid token), logout |
| `ExpensesService` | create, list with filters, ownership enforcement (other user's expense returns 404) |
| `BudgetsService` | create, budget progress calculation, status flags |
| `ReportsService` | summary totals, monthly fill-in of empty months, category percentages |

### Test Setup Pattern

```typescript
// auth.service.spec.ts
describe('AuthService', () => {
  let service: AuthService;
  let mockDb: jest.Mocked<DrizzleDb>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DRIZZLE, useValue: mockDb },
        { provide: JwtService, useValue: { signAsync: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('should throw ConflictException if email already exists', async () => {
    mockDb.select.mockReturnValueOnce({ /* existing user */ });
    await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
  });
});
```

### Run unit tests

```bash
yarn test
yarn test:cov   # with coverage report
```

Target: **> 80% coverage** on services.

---

## Step 6.2 — E2E Testing

E2E tests use a real (test) database. Use a separate `.env.test` with a test database URL.

### Critical E2E Flows

1. **Auth flow**: register → login → access protected route → refresh → logout
2. **Expense flow**: create category → create expense → list expenses → update → delete
3. **Budget flow**: create budget → add expenses → check budget progress
4. **Report flow**: create data → call summary report → verify totals

### E2E Test Setup

```typescript
// test/app.e2e-spec.ts
describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(() => app.close());

  it('POST /api/v1/auth/register', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Test User', email: 'test@test.com', password: 'password123' })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toHaveProperty('accessToken');
        expect(body).toHaveProperty('refreshToken');
      });
  });
});
```

### Run E2E tests

```bash
yarn test:e2e
```

---

## Step 6.3 — Docker Setup (Local Dev)

**`docker-compose.yml`** (in `backend/`):

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    restart: always
    environment:
      POSTGRES_USER: khoroch
      POSTGRES_PASSWORD: khoroch_pass
      POSTGRES_DB: khoroch
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

Start the database:

```bash
docker compose up -d
```

---

## Step 6.4 — Dockerfile (Production)

**`backend/Dockerfile`**:

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
```

Build and run:

```bash
docker build -t khoroch-backend .
docker run -p 3000:3000 --env-file .env khoroch-backend
```

---

## Step 6.5 — Exception Filter

The `HttpExceptionFilter` (defined in Phase 1, Step 1.8) is already registered globally and ensures every error response follows the standard envelope:

```json
{ "error": true, "data": null, "message": "<reason>" }
```

No additional filter is needed. Ensure it is registered **before** the interceptor in `main.ts`:

```typescript
app.useGlobalFilters(new HttpExceptionFilter());     // errors
app.useGlobalInterceptors(new ResponseInterceptor()); // successes
```

### E2E assertion example

```typescript
// Expect success shape
.expect(({ body }) => {
  expect(body.error).toBe(false);
  expect(body.data).toBeDefined();
  expect(body.message).toBe('OK');
});

// Expect error shape
.expect(({ body }) => {
  expect(body.error).toBe(true);
  expect(body.data).toBeNull();
  expect(typeof body.message).toBe('string');
});
```

---

## Step 6.6 — Production Checklist

### Security
- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are strong random secrets (≥ 32 chars)
- [ ] `NODE_ENV=production` set
- [ ] CORS configured — only allowed frontend origins
- [ ] Helmet middleware installed (`yarn add helmet`)
- [ ] Rate limiting on auth endpoints (`@nestjs/throttler`)
- [ ] No stack traces in error responses in production

### Database
- [ ] Migrations run before app starts (`yarn db:migrate`)
- [ ] Database backups configured
- [ ] Connection pool tuned for expected load

### Monitoring
- [ ] Health check endpoint (`@nestjs/terminus`)
- [ ] Structured logging (consider `winston` or `pino`)
- [ ] Request logging middleware

---

## Step 6.7 — Health Check Endpoint

```bash
yarn add @nestjs/terminus
```

```typescript
// src/health/health.controller.ts
@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([]);
  }
}
```

Accessible at `GET /api/v1/health` — returns `{ status: 'ok' }`.

---

## Step 6.8 — CORS & Rate Limiting

```typescript
// main.ts additions
import helmet from 'helmet';
import { ThrottlerGuard } from '@nestjs/throttler';

app.use(helmet());
app.enableCors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
  credentials: true,
});
```

```typescript
// AppModule imports
ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])
// Register APP_GUARD with ThrottlerGuard for auth routes
```

---

## Full Development Workflow

```bash
# 1. Start database
docker compose up -d

# 2. Copy env
cp .env.example .env  # fill in values

# 3. Install dependencies
yarn install

# 4. Push schema / run migrations
yarn db:migrate

# 5. Start dev server
yarn start:dev

# 6. Open API docs
open http://localhost:3000/api/docs
```

---

## Checklist

- [ ] Unit tests written for all services
- [ ] E2E tests cover auth and expense CRUD flows
- [ ] `docker-compose.yml` starts Postgres
- [ ] `Dockerfile` builds production image
- [ ] Global exception filter returns consistent error shape
- [ ] CORS restricted to allowed origins
- [ ] Helmet and rate limiting applied
- [ ] Health check endpoint live
- [ ] All environment variables documented in `.env.example`
