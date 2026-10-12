import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./dhruva";

export const notebookVisibilityEnum = pgEnum("notebook_visibility", [
  "private",
  "public",
]);
export const ideationKindEnum = pgEnum("ideation_kind", ["note", "idea"]);
export const ideationStatusEnum = pgEnum("ideation_status", [
  "captured",
  "exploring",
  "validating",
  "in_progress",
  "archived",
]);
export const ideationVisibilityEnum = pgEnum("ideation_visibility", [
  "private",
  "public",
]);

export const notebooksTable = pgTable(
  "ideation_notebooks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    icon: text("icon").default("book").notNull(),
    color: text("color"),
    category: text("category"),
    visibility: notebookVisibilityEnum("visibility").default("private").notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userUpdated: index("ideation_notebooks_user_updated_idx").on(
      table.userId,
      table.updatedAt,
    ),
  }),
);

export const ideationItemsTable = pgTable(
  "ideation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooksTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content"),
    kind: ideationKindEnum("kind").notNull(),
    tags: text("tags").array().notNull().default([]),
    category: text("category"),
    status: ideationStatusEnum("status").default("captured").notNull(),
    problem: text("problem"),
    audience: text("audience"),
    proposedSolution: text("proposed_solution"),
    potentialValue: text("potential_value"),
    openQuestions: text("open_questions"),
    nextActions: text("next_actions"),
    visibility: ideationVisibilityEnum("visibility").default("private").notNull(),
    pinned: boolean("pinned").default(false).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    userUpdated: index("ideation_items_user_updated_idx").on(
      table.userId,
      table.updatedAt,
    ),
    notebookUpdated: index("ideation_items_notebook_updated_idx").on(
      table.notebookId,
      table.updatedAt,
    ),
  }),
);

export const insertNotebookSchema = createInsertSchema(notebooksTable).omit({
  id: true,
  userId: true,
  visibility: true,
  isArchived: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertNotebook = z.infer<typeof insertNotebookSchema>;
export type Notebook = typeof notebooksTable.$inferSelect;

export const insertIdeationItemSchema = createInsertSchema(
  ideationItemsTable,
).omit({
  id: true,
  userId: true,
  visibility: true,
  pinned: true,
  isArchived: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertIdeationItem = z.infer<typeof insertIdeationItemSchema>;
export type IdeationItem = typeof ideationItemsTable.$inferSelect;
