import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const habitTypeEnum = pgEnum("habit_type", ["binary", "quantitative", "duration"]);
export const habitFrequencyEnum = pgEnum("habit_frequency", ["daily", "weekdays", "custom_days", "times_per_week"]);
export const timeAnchorEnum = pgEnum("time_anchor", ["morning", "midday", "evening", "anytime"]);
export const difficultyEnum = pgEnum("difficulty_level", ["starter", "standard", "stretch"]);
export const goalStatusEnum = pgEnum("goal_status", ["active", "paused", "achieved", "abandoned"]);
export const todoStatusEnum = pgEnum("todo_status", ["open", "completed", "cancelled"]);
export const todoPriorityEnum = pgEnum("todo_priority", ["p1", "p2", "p3"]);
export const coachingToneEnum = pgEnum("coaching_tone", ["encouraging", "direct", "analytical"]);
export const recommendationStatusEnum = pgEnum("rec_status", ["open", "accepted", "dismissed", "expired"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  timezone: text("timezone").default("UTC").notNull(),
  weekStartsOn: integer("week_starts_on").default(1).notNull(),
  wakeTime: time("wake_time").default("07:00").notNull(),
  sleepTime: time("sleep_time").default("23:00").notNull(),
  minutesWeekday: integer("minutes_weekday").default(60).notNull(),
  minutesWeekend: integer("minutes_weekend").default(90).notNull(),
  consistencyKiller: text("consistency_killer"),
  coachingTone: coachingToneEnum("coaching_tone").default("encouraging").notNull(),
  northStar: text("north_star"),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  notificationHour: integer("notification_hour").default(8).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const domains = pgTable("domains", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").default("circle").notNull(),
  hue: text("hue").default("hue-craft").notNull(),
  isSystem: boolean("is_system").default(true).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
}, (table) => ({ userKey: unique("domains_user_key").on(table.userId, table.key) }));

export const goals = pgTable("goals", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id").notNull().references(() => domains.id),
  title: text("title").notNull(),
  description: text("description"),
  targetDate: date("target_date"),
  status: goalStatusEnum("status").default("active").notNull(),
  successCriteria: text("success_criteria"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const habits = pgTable("habits", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id").notNull().references(() => domains.id),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  notes: text("notes"),
  type: habitTypeEnum("type").default("binary").notNull(),
  targetValue: real("target_value"),
  unit: text("unit"),
  frequency: habitFrequencyEnum("frequency").default("daily").notNull(),
  customDays: integer("custom_days").array(),
  timesPerWeek: integer("times_per_week"),
  timeOfDay: timeAnchorEnum("time_of_day").default("anytime").notNull(),
  difficulty: difficultyEnum("difficulty").default("starter").notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const todos = pgTable("todos", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  domainId: uuid("domain_id").references(() => domains.id, { onDelete: "set null" }),
  goalId: uuid("goal_id").references(() => goals.id, { onDelete: "set null" }),
  habitId: uuid("habit_id").references(() => habits.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  notes: text("notes"),
  dueDate: date("due_date"),
  dueTime: time("due_time"),
  priority: todoPriorityEnum("priority").default("p2").notNull(),
  status: todoStatusEnum("status").default("open").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  sortOrder: integer("sort_order").default(0).notNull(),
  isRitual: boolean("is_ritual").default(false).notNull(),
});

export const checkins = pgTable("checkins", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  habitId: uuid("habit_id").notNull().references(() => habits.id, { onDelete: "cascade" }),
  checkinDate: date("checkin_date").notNull(),
  value: real("value").default(1).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({ habitDate: unique("checkins_habit_date").on(table.habitId, table.checkinDate) }));

export const moodLogs = pgTable("mood_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  logDate: date("log_date").notNull(),
  mood: integer("mood").notNull(),
  energy: integer("energy").notNull(),
  note: text("note"),
}, (table) => ({ userDate: unique("mood_logs_user_date").on(table.userId, table.logDate) }));

export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  source: text("source").notNull(),
  result: text("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recommendations = pgTable("ai_recommendations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  rationale: text("rationale").notNull(),
  status: recommendationStatusEnum("status").default("open").notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable("session", {
  sid: text("sid").primaryKey(),
  sess: text("sess").notNull(),
  expire: timestamp("expire").notNull(),
});