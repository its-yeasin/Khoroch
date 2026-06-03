# Phase 1 — Project Setup & Configuration

## Goals

- Install all required dependencies
- Configure environment variables
- Set up Drizzle ORM with PostgreSQL connection
- Set up global validation, error filters, and config

---

## Step 1.1 — Install Dependencies

```bash
# Core
yarn add @nestjs/config drizzle-orm postgres dotenv

# Drizzle CLI (dev)
yarn add -D drizzle-kit

# Validation
yarn add class-validator class-transformer

# Auth (needed later but install now)
yarn add @nestjs/jwt @nestjs/passport passport passport-jwt bcryptjs
yarn add -D @types/passport-jwt @types/bcryptjs

# Swagger (API docs)
yarn add @nestjs/swagger swagger-ui-express
```

---

## Step 1.2 — Environment Variables

Create `.env` in `backend/`:

```env
# App
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=postgres://user:password@localhost:5432/khoroch

# JWT
JWT_ACCESS_SECRET=your_access_secret_here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_SECRET=your_refresh_secret_here
JWT_REFRESH_EXPIRES_IN=7d
```

Add `.env` to `.gitignore`. Commit a `.env.example` template.

---

## Step 1.3 — Config Module

**`src/config/database.config.ts`**

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
}));
```

**`src/config/jwt.config.ts`**

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
}));
```

---

## Step 1.4 — Drizzle Module

**`src/database/drizzle.module.ts`**

```typescript
import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('database.url');
        const client = postgres(url);
        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule {}
```

---

## Step 1.5 — Drizzle Kit Config

**`drizzle.config.ts`** (project root of backend):

```typescript
import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
```

Add scripts to `package.json`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:studio": "drizzle-kit studio",
"db:push": "drizzle-kit push"
```

---

## Step 1.6 — Global Bootstrap Setup

**`src/main.ts`**

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Khoroch API')
    .setDescription('Expense Management API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}
bootstrap();
```

---

## Step 1.7 — App Module Update

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from './database/drizzle.module';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, jwtConfig],
    }),
    DrizzleModule,
  ],
})
export class AppModule {}
```

---

## Step 1.8 — Global Response Shape

Every API response — success or error — uses the same envelope:

```json
{ "error": false, "data": { ... }, "message": "OK" }
{ "error": true,  "data": null,  "message": "Unauthorized" }
```

### Type definition

**`src/common/types/api-response.type.ts`**

```typescript
export interface ApiResponse<T = unknown> {
  error: boolean;
  data: T | null;
  message: string;
}
```

### Response interceptor (wraps successful responses)

**`src/common/interceptors/response.interceptor.ts`**

```typescript
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '../types/api-response.type';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        error: false,
        data: data ?? null,
        message: 'OK',
      })),
    );
  }
}
```

### Exception filter (wraps error responses)

**`src/common/filters/http-exception.filter.ts`**

```typescript
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponse } from '../types/api-response.type';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx    = host.switchToHttp();
    const res    = ctx.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse = isHttp ? exception.getResponse() : null;
    const message =
      typeof rawResponse === 'string'
        ? rawResponse
        : (rawResponse as Record<string, unknown>)?.message?.toString() ??
          'Internal server error';

    const body: ApiResponse<null> = { error: true, data: null, message };
    res.status(status).json(body);
  }
}
```

### Register globally in `main.ts`

```typescript
import { ResponseInterceptor }  from './common/interceptors/response.interceptor';
import { HttpExceptionFilter }  from './common/filters/http-exception.filter';

// inside bootstrap()
app.useGlobalInterceptors(new ResponseInterceptor());
app.useGlobalFilters(new HttpExceptionFilter());
```

---

## Checklist

- [ ] All packages installed
- [ ] `.env` created and `.env.example` committed
- [ ] `DrizzleModule` connects to PostgreSQL successfully
- [ ] `ValidationPipe` active globally
- [ ] `ResponseInterceptor` wraps all success responses
- [ ] `HttpExceptionFilter` wraps all error responses
- [ ] Every response conforms to `{ error, data, message }`
- [ ] Swagger UI accessible at `/api/docs`
- [ ] `drizzle-kit` commands work
