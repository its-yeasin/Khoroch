# Phase 4 — Core Expense Modules

## Goals

- CRUD for Categories, Expenses, Incomes, Budgets, and Tags
- All data scoped to the authenticated user
- Filtering, pagination, and sorting on list endpoints

---

## Module Overview

| Module | Responsibility |
|---|---|
| `categories` | Manage expense/income categories |
| `expenses` | Record and manage expenses |
| `incomes` | Record and manage income entries |
| `budgets` | Set spending limits per category/period |
| `tags` | Label expenses with custom tags |

All modules use `JwtAuthGuard` globally or per-controller.

---

## Step 4.1 — Categories Module

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/categories` | List user's categories (filter by type) |
| POST | `/categories` | Create a category |
| PATCH | `/categories/:id` | Update a category |
| DELETE | `/categories/:id` | Delete a category |

### Key Rules
- `isDefault` categories can be updated (name/icon/color) but not deleted
- `type` cannot be changed after creation
- Category `userId` must match request user (ownership check)

### DTOs

```typescript
// create-category.dto.ts
export class CreateCategoryDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsIn(['expense', 'income'])
  type: string;

  @IsOptional() @IsString()
  icon?: string;

  @IsOptional() @IsHexColor()
  color?: string;
}
```

---

## Step 4.2 — Expenses Module

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/expenses` | List expenses (paginated, filtered) |
| GET | `/expenses/:id` | Get single expense |
| POST | `/expenses` | Create expense |
| PATCH | `/expenses/:id` | Update expense |
| DELETE | `/expenses/:id` | Delete expense |

### Query Filters (GET `/expenses`)

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `categoryId` | uuid | Filter by category |
| `startDate` | date (YYYY-MM-DD) | Filter from date |
| `endDate` | date (YYYY-MM-DD) | Filter to date |
| `minAmount` | number | Minimum amount |
| `maxAmount` | number | Maximum amount |
| `search` | string | Search in description |
| `sortBy` | `date` \| `amount` | Sort field (default: `date`) |
| `sortOrder` | `asc` \| `desc` | Sort direction (default: `desc`) |

### DTOs

```typescript
// create-expense.dto.ts
export class CreateExpenseDto {
  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsNumber() @IsPositive()
  amount: number;

  @IsOptional() @IsString() @Length(3, 3)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsDateString()
  date: string;

  @IsOptional() @IsBoolean()
  isRecurring?: boolean;

  @IsOptional() @IsArray() @IsUUID(undefined, { each: true })
  tagIds?: string[];
}
```

### Service Logic

```
createExpense:
  1. Validate categoryId belongs to user (if provided)
  2. Validate tagIds all belong to user (if provided)
  3. Insert expense
  4. Insert expense_tags rows (if tagIds provided)
  5. Return expense with category and tags joined

listExpenses:
  1. Build WHERE clause from filters (userId + optional filters)
  2. Query with pagination (LIMIT/OFFSET)
  3. Return { data: Expense[], total: number, page, limit }
```

---

## Step 4.3 — Incomes Module

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/incomes` | List incomes (paginated, filtered) |
| GET | `/incomes/:id` | Get single income |
| POST | `/incomes` | Create income |
| PATCH | `/incomes/:id` | Update income |
| DELETE | `/incomes/:id` | Delete income |

### Query Filters
Same pattern as expenses: `page`, `limit`, `categoryId`, `startDate`, `endDate`, `sortBy`, `sortOrder`.

### DTOs

```typescript
// create-income.dto.ts
export class CreateIncomeDto {
  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsNumber() @IsPositive()
  amount: number;

  @IsOptional() @IsString() @Length(3, 3)
  currency?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsDateString()
  date: string;
}
```

---

## Step 4.4 — Budgets Module

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/budgets` | List budgets (filter by year/month) |
| GET | `/budgets/:id` | Get single budget with spent amount |
| POST | `/budgets` | Create budget |
| PATCH | `/budgets/:id` | Update budget amount |
| DELETE | `/budgets/:id` | Delete budget |

### DTOs

```typescript
// create-budget.dto.ts
export class CreateBudgetDto {
  @IsOptional() @IsUUID()
  categoryId?: string;   // null = overall budget

  @IsNumber() @IsPositive()
  amount: number;

  @IsIn(['monthly', 'yearly'])
  period: string;

  @IsOptional() @Min(1) @Max(12)
  month?: number;        // required if period = 'monthly'

  @IsInt() @Min(2000) @Max(2100)
  year: number;
}
```

### Budget Progress Calculation

When fetching a budget, calculate how much has been spent:

```sql
-- Drizzle equivalent
SELECT SUM(amount) FROM expenses
WHERE user_id = $userId
  AND category_id = $categoryId
  AND date >= $periodStart
  AND date <= $periodEnd
```

Return: `{ budget, spent, remaining, percentUsed }`

### Budget Alert Logic
- When an expense is created/updated, check if any budget for that category is exceeded
- Return a `budgetAlert` flag in the expense creation response if > 80% used

---

## Step 4.5 — Tags Module

### Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/tags` | List user's tags |
| POST | `/tags` | Create a tag |
| PATCH | `/tags/:id` | Rename a tag |
| DELETE | `/tags/:id` | Delete a tag (removes expense_tags rows) |

### DTOs

```typescript
// create-tag.dto.ts
export class CreateTagDto {
  @IsString() @MaxLength(50) @MinLength(1)
  name: string;
}
```

---

## Step 4.6 — Ownership Guard Pattern

Each service method must verify that the resource belongs to the requesting user. Use a consistent pattern:

```typescript
async findOneOrFail(id: string, userId: string): Promise<Expense> {
  const [expense] = await this.db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .limit(1);

  if (!expense) throw new NotFoundException('Expense not found');
  return expense;
}
```

Never query by `id` alone — always include `userId` in the WHERE clause.

---

## Step 4.7 — Pagination Utility

**`src/common/dto/pagination.dto.ts`**

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  get offset(): number {
    return (this.page - 1) * this.limit;
  }
}
```

**`src/common/utils/paginate.ts`**

```typescript
export function paginate<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
```

---

## Checklist

- [ ] `CategoriesModule` — CRUD + seed on registration
- [ ] `ExpensesModule` — CRUD + tag attachment + filtering
- [ ] `IncomesModule` — CRUD + filtering
- [ ] `BudgetsModule` — CRUD + spent/remaining calculation
- [ ] `TagsModule` — CRUD
- [ ] All routes protected with `JwtAuthGuard`
- [ ] All data scoped by `userId` (ownership enforced)
- [ ] Pagination and filters working on list endpoints
