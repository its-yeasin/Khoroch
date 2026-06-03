# Phase 5 — Reports & Analytics

## Goals

- Aggregate expense and income data into useful summaries
- Monthly and yearly overviews
- Category-wise breakdowns
- Spending trends over time
- Budget vs. actual comparisons

---

## Step 5.1 — Reports Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/reports/summary` | Overall summary for a period |
| GET | `/reports/monthly` | Month-by-month breakdown for a year |
| GET | `/reports/by-category` | Spending grouped by category for a period |
| GET | `/reports/trends` | Daily/weekly spending trend for a period |
| GET | `/reports/budgets` | All budgets with spent vs. limit for a period |

All endpoints require `JwtAuthGuard`. All data is scoped to the authenticated user.

---

## Step 5.2 — Summary Report

**GET `/reports/summary`**

Query params:

| Param | Type | Required | Description |
|---|---|---|---|
| `startDate` | date | yes | Start of period |
| `endDate` | date | yes | End of period |

Response:

```json
{
  "period": { "startDate": "2026-01-01", "endDate": "2026-01-31" },
  "totalExpenses": "15000.00",
  "totalIncome": "50000.00",
  "netBalance": "35000.00",
  "expenseCount": 42,
  "incomeCount": 3,
  "topCategory": {
    "id": "...",
    "name": "Food & Dining",
    "total": "6000.00"
  }
}
```

### Query Logic

```typescript
// Total expenses in period
const totalExpenses = await db
  .select({ total: sum(expenses.amount) })
  .from(expenses)
  .where(and(
    eq(expenses.userId, userId),
    gte(expenses.date, startDate),
    lte(expenses.date, endDate),
  ));

// Total income in period — same pattern on incomes table
```

---

## Step 5.3 — Monthly Breakdown

**GET `/reports/monthly`**

Query params:

| Param | Type | Required | Description |
|---|---|---|---|
| `year` | number | yes | e.g. `2026` |

Response:

```json
{
  "year": 2026,
  "months": [
    { "month": 1, "label": "January", "expenses": "15000.00", "income": "50000.00", "net": "35000.00" },
    { "month": 2, "label": "February", "expenses": "12000.00", "income": "50000.00", "net": "38000.00" },
    ...
  ]
}
```

### Query Logic

Use `EXTRACT(MONTH FROM date)` to group by month within the year:

```typescript
import { sql, sum, eq, and, extract } from 'drizzle-orm';

const result = await db
  .select({
    month: sql<number>`EXTRACT(MONTH FROM ${expenses.date})::int`,
    total: sum(expenses.amount),
  })
  .from(expenses)
  .where(and(
    eq(expenses.userId, userId),
    sql`EXTRACT(YEAR FROM ${expenses.date}) = ${year}`,
  ))
  .groupBy(sql`EXTRACT(MONTH FROM ${expenses.date})`);
```

Fill in months with no data as `"0.00"` in the service layer.

---

## Step 5.4 — Category Breakdown

**GET `/reports/by-category`**

Query params: `startDate`, `endDate`, `type` (`expense` | `income`)

Response:

```json
{
  "period": { "startDate": "2026-01-01", "endDate": "2026-01-31" },
  "type": "expense",
  "totalAmount": "15000.00",
  "categories": [
    { "categoryId": "...", "name": "Food & Dining", "icon": "🍔", "total": "6000.00", "percentage": 40.0, "count": 18 },
    { "categoryId": "...", "name": "Transport",     "icon": "🚗", "total": "3000.00", "percentage": 20.0, "count": 10 },
    ...
  ]
}
```

### Query Logic

```typescript
const result = await db
  .select({
    categoryId: expenses.categoryId,
    name:       categories.name,
    icon:       categories.icon,
    total:      sum(expenses.amount),
    count:      count(),
  })
  .from(expenses)
  .leftJoin(categories, eq(expenses.categoryId, categories.id))
  .where(and(
    eq(expenses.userId, userId),
    gte(expenses.date, startDate),
    lte(expenses.date, endDate),
  ))
  .groupBy(expenses.categoryId, categories.name, categories.icon)
  .orderBy(desc(sum(expenses.amount)));
```

---

## Step 5.5 — Spending Trend

**GET `/reports/trends`**

Query params: `startDate`, `endDate`, `groupBy` (`day` | `week` | `month`)

Response:

```json
{
  "groupBy": "day",
  "data": [
    { "label": "2026-01-01", "expenses": "500.00", "income": "0.00" },
    { "label": "2026-01-02", "expenses": "1200.00", "income": "0.00" },
    ...
  ]
}
```

### Query Logic by `groupBy`

- **day**: `DATE(date)` → group by date string
- **week**: `DATE_TRUNC('week', date)` → group by week start
- **month**: `DATE_TRUNC('month', date)` → group by month start

Fill missing dates/weeks in the service layer for a complete time series.

---

## Step 5.6 — Budget vs. Actual Report

**GET `/reports/budgets`**

Query params: `year`, `month` (optional — if omitted returns yearly)

Response:

```json
{
  "period": "2026-01",
  "budgets": [
    {
      "categoryId": "...",
      "name": "Food & Dining",
      "budgetAmount": "8000.00",
      "spentAmount": "6000.00",
      "remaining": "2000.00",
      "percentUsed": 75.0,
      "status": "on_track"   // "on_track" | "warning" (>80%) | "exceeded" (>100%)
    },
    ...
  ],
  "overall": {
    "totalBudget": "30000.00",
    "totalSpent": "15000.00",
    "remaining": "15000.00",
    "percentUsed": 50.0
  }
}
```

### Status Logic

```typescript
function getBudgetStatus(percentUsed: number): string {
  if (percentUsed > 100) return 'exceeded';
  if (percentUsed > 80)  return 'warning';
  return 'on_track';
}
```

---

## Step 5.7 — Reports Module Structure

```
src/reports/
├── reports.module.ts
├── reports.controller.ts
├── reports.service.ts
└── dto/
    ├── period-query.dto.ts
    ├── monthly-query.dto.ts
    └── trend-query.dto.ts
```

**`period-query.dto.ts`**

```typescript
export class PeriodQueryDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}
```

**`monthly-query.dto.ts`**

```typescript
export class MonthlyQueryDto {
  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year: number;
}
```

---

## Checklist

- [ ] `ReportsModule` created and imported in `AppModule`
- [ ] Summary endpoint returns correct totals
- [ ] Monthly report returns all 12 months (zeros for empty months)
- [ ] Category breakdown returns percentage of total
- [ ] Trends endpoint supports day/week/month grouping
- [ ] Budget vs. actual includes status flags
- [ ] All queries scoped to `userId`
- [ ] Date range validation prevents invalid queries
