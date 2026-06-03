# Phase 3 — Authentication Module

## Goals

- User registration with hashed passwords
- Login returning JWT access + refresh tokens
- Refresh token rotation
- Protected routes via JWT guard
- Profile endpoint

---

## Step 3.1 — Auth Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | `/api/v1/auth/register` | Register new user | Public |
| POST | `/api/v1/auth/login` | Login, receive tokens | Public |
| POST | `/api/v1/auth/refresh` | Rotate refresh token | Bearer (refresh) |
| POST | `/api/v1/auth/logout` | Invalidate refresh token | Bearer (access) |
| GET | `/api/v1/auth/me` | Get current user profile | Bearer (access) |

---

## Step 3.2 — DTOs

**`src/auth/dto/register.dto.ts`**

```typescript
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

**`src/auth/dto/login.dto.ts`**

```typescript
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

---

## Step 3.3 — Auth Service Logic

**`src/auth/auth.service.ts`** — key methods:

### `register(dto: RegisterDto)`
1. Check if email already exists → throw `ConflictException`
2. Hash password with `bcryptjs` (salt rounds: 12)
3. Insert user row
4. Seed default categories for new user
5. Generate and return access + refresh tokens

### `login(dto: LoginDto)`
1. Find user by email → throw `UnauthorizedException` if not found
2. Compare password with stored hash
3. Generate and return access + refresh tokens
4. Store hashed refresh token in `users.refresh_token`

### `refresh(userId, refreshToken)`
1. Load user by ID
2. Compare provided token with stored hash
3. If valid, rotate: generate new pair, update stored hash
4. Return new tokens

### `logout(userId)`
1. Set `users.refresh_token = null`

### Token generation helper

```typescript
private async generateTokens(userId: string, email: string) {
  const [accessToken, refreshToken] = await Promise.all([
    this.jwtService.signAsync(
      { sub: userId, email },
      { secret: this.config.get('jwt.accessSecret'), expiresIn: this.config.get('jwt.accessExpiresIn') },
    ),
    this.jwtService.signAsync(
      { sub: userId, email },
      { secret: this.config.get('jwt.refreshSecret'), expiresIn: this.config.get('jwt.refreshExpiresIn') },
    ),
  ]);
  return { accessToken, refreshToken };
}
```

---

## Step 3.4 — JWT Strategies

**`src/auth/strategies/jwt.strategy.ts`** (access token)

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('jwt.accessSecret'),
    });
  }

  validate(payload: { sub: string; email: string }) {
    return { userId: payload.sub, email: payload.email };
  }
}
```

**`src/auth/strategies/jwt-refresh.strategy.ts`** (refresh token)

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: { sub: string; email: string }) {
    const refreshToken = req.headers.authorization.replace('Bearer ', '').trim();
    return { userId: payload.sub, email: payload.email, refreshToken };
  }
}
```

---

## Step 3.5 — Guards

**`src/common/guards/jwt-auth.guard.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

**`src/common/guards/jwt-refresh.guard.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
```

---

## Step 3.6 — Current User Decorator

**`src/common/decorators/current-user.decorator.ts`**

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

Usage in controllers:

```typescript
@Get('me')
@UseGuards(JwtAuthGuard)
getMe(@CurrentUser() user: { userId: string; email: string }) {
  return this.authService.getMe(user.userId);
}
```

---

## Step 3.7 — Auth Module

```typescript
@Module({
  imports: [
    JwtModule.register({}),
    PassportModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtRefreshStrategy],
})
export class AuthModule {}
```

---

## Step 3.8 — Security Considerations

- Passwords hashed with bcrypt (cost factor 12)
- Refresh tokens stored as bcrypt hashes — raw token never stored
- Access tokens short-lived (15 min), refresh tokens 7 days
- Logout clears stored refresh token (invalidates token family)
- `ValidationPipe` with `whitelist: true` strips unknown fields

---

## Checklist

- [ ] `AuthModule` created and imported in `AppModule`
- [ ] Register and login endpoints return `{ accessToken, refreshToken }`
- [ ] Refresh endpoint rotates refresh token correctly
- [ ] Logout clears stored refresh token
- [ ] `JwtAuthGuard` blocks unauthenticated requests
- [ ] `/auth/me` returns current user data
- [ ] Default categories seeded on registration
