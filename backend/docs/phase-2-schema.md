# Phase 2 — Database Schema Design

## Goals

- Design all tables using Drizzle ORM schema definitions
- Define relationships, indexes, and constraints
- Generate and run initial migration

---

## Entity Overview

```
users
  └── categories (owned by user)
  └── expenses   (owned by user, belongs to category)
  └── incomes    (owned by user)
  └── budgets    (owned by user, per category per period)
  └── tags       (owned by user)
  └── expense_tags (junction: expense <-> tag)
```

---

## Step 2.1 — Users Schema

**`src/database/schema/users.schema.ts`**

```typescript
import { pgTable, uuid, varchar, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id:           uuid('id').defaultRandom().primaryKey(),
  name:         varchar('name', { length: 100 }).notNull(),
  email:        varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  currency:     varchar('currency', { length: 3 }).notNull().default('BDT'),
  isVerified:   boolean('is_verified').notNull().default(false),
  refreshToken: text('refresh_token'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
});

export type User    = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

---

## Step 2.2 — Categories Schema

**`src/database/schema/categories.schema.ts`**

```typescript
import { pgTable, uuid, varchar, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const categoryTypeEnum = ['expense', 'income'] as const;

export const categories = pgTable('categories', {
  id:        uuid('id').defaultRandom().primaryKey(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:      varchar('name', { length: 100 }).notNull(),
  type:      varchar('type', { length: 10 }).notNull().default('expense'), // 'expense' | 'income'
  icon:      varchar('icon', { length: 50 }),
  color:     varchar('color', { length: 7 }),   // hex color e.g. #FF5733
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Category    = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
```

**Default categories** (seeded on user registration):

| Name | Type | Icon |
|---|---|---|
| Food & Dining | expense | 🍔 |
| Transport | expense | 🚗 |
| Shopping | expense | 🛍️ |
| Bills & Utilities | expense | 💡 |
| Health | expense | 🏥 |
| Entertainment | expense | 🎬 |
| Salary | income | 💼 |
| Freelance | income | 💻 |
| Other | expense | 📦 |

---

## Step 2.3 — Expenses Schema

**`src/database/schema/expenses.schema.ts`**

```typescript
import { pgTable, uuid, varchar, text, numeric, date, timestamp, boolean } from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { categories } from './categories.schema';

export const expenses = pgTable('expenses', {
  id:          uuid('id').defaultRandom().primaryKey(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId:  uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  amount:      numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency:    varchar('currency', { length: 3 }).notNull().default('BDT'),
  description: text('description'),
  date:        date('date').notNull(),
  isRecurring: boolean('is_recurring').notNull().default(false),
  recurringId: uuid('recurring_id'),               // links to a recurring_expenses table (future)
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

export type Expense    = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
```

---

## Step 2.4 — Incomes Schema

**`src/database/schema/incomes.schema.ts`**

```typescript
import { pgTable, uuid, varchar, text, numeric, date, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { categories } from './categories.schema';

export const incomes = pgTable('incomes', {
  id:          uuid('id').defaultRandom().primaryKey(),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId:  uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  amount:      numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency:    varchar('currency', { length: 3 }).notNull().default('BDT'),
  description: text('description'),
  date:        date('date').notNull(),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

export type Income    = typeof incomes.$inferSelect;
export type NewIncome = typeof incomes.$inferInsert;
```

---

## Step 2.5 — Budgets Schema

**`src/database/schema/budgets.schema.ts`**

```typescript
import { pgTable, uuid, numeric, integer, varchar, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { categories } from './categories.schema';

export const budgets = pgTable('budgets', {
  id:         uuid('id').defaultRandom().primaryKey(),
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'cascade' }),
  amount:     numeric('amount', { precision: 12, scale: 2 }).notNull(),
  period:     varchar('period', { length: 10 }).notNull().default('monthly'), // 'monthly' | 'yearly'
  month:      integer('month'),   // 1-12, null if yearly
  year:       integer('year').notNull(),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
  updatedAt:  timestamp('updated_at').notNull().defaultNow(),
});

export type Budget    = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
```

---

## Step 2.6 — Tags Schema

**`src/database/schema/tags.schema.ts`**

```typescript
import { pgTable, uuid, varchar, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.schema';
import { expenses } from './expenses.schema';

export const tags = pgTable('tags', {
  id:        uuid('id').defaultRandom().primaryKey(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:      varchar('name', { length: 50 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const expenseTags = pgTable('expense_tags', {
  expenseId: uuid('expense_id').notNull().references(() => expenses.id, { onDelete: 'cascade' }),
  tagId:     uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.expenseId, table.tagId] }),
}));

export type Tag         = typeof tags.$inferSelect;
export type ExpenseTag  = typeof expenseTags.$inferSelect;
```

---

## Step 2.7 — Schema Index

**`src/database/schema/index.ts`**

```typescript
export * from './users.schema';
export * from './categories.schema';
export * from './expenses.schema';
export * from './incomes.schema';
export * from './budgets.schema';
export * from './tags.schema';
```

---

## Step 2.8 — Generate & Run Migration

```bash
# Generate migration from schema
yarn db:generate

# Apply migration to the database
yarn db:migrate

# (Optional) Open Drizzle Studio to inspect data
yarn db:studio
```

---

## ER Diagram (simplified)

```
users
  id (PK)
  email (UNIQUE)
  password_hash
  currency
  refresh_token

categories
  id (PK)
  user_id (FK → users)
  name, type, icon, color

expenses
  id (PK)
  user_id (FK → users)
  category_id (FK → categories)
  amount, currency, date, description

incomes
  id (PK)
  user_id (FK → users)
  category_id (FK → categories)
  amount, currency, date, description

budgets
  id (PK)
  user_id (FK → users)
  category_id (FK → categories)
  amount, period, month, year

tags
  id (PK)
  user_id (FK → users)
  name

expense_tags
  expense_id (FK → expenses) ─┐
  tag_id     (FK → tags)     ─┘ composite PK
```

---

## Checklist

- [ ] All schema files created under `src/database/schema/`
- [ ] `index.ts` exports all schemas
- [ ] `drizzle.config.ts` points to schema index
- [ ] Migration generated and applied
- [ ] Tables visible in Drizzle Studio or psql
