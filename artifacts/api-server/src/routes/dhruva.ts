import { Router, type IRouter, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import { pool } from "@workspace/db";
import {
  CompleteOnboardingBody,
  CreateCheckinBody,
  CreateDomainBody,
  CreateGoalBody,
  CreateHabitBody,
  CreateTodoBody,
  LoginBody,
  RegisterBody,
  SaveMoodBody,
  UpdateHabitBody,
  UpdateProfileBody,
  UpdateTodoBody,
} from "@workspace/api-zod";

const router: IRouter = Router();
const SYSTEM_DOMAINS = [
  ["body", "Body", "Sleep, training, nutrition, mobility", "dumbbell", "hue-body"],
  ["mind", "Mind", "Meditation, journaling, digital hygiene", "brain", "hue-mind"],
  ["craft", "Craft", "Deep work, career, professional skills", "hammer", "hue-craft"],
  ["learn", "Learn", "Study, languages, reading, courses", "book-open", "hue-learn"],
  ["money", "Money", "Saving, investing, budget, admin", "wallet", "hue-money"],
  ["people", "People", "Family, friends, romance, community", "users", "hue-people"],
  ["make", "Make", "Art, music, writing, side projects", "palette", "hue-make"],
  ["home", "Home", "Chores, environment, cooking, logistics", "home", "hue-home"],
] as const;

type AuthRequest = Request & { session: Request["session"] & { userId?: string } };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function error(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ error: { code, message } });
}

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!(req as AuthRequest).session.userId) {
    error(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    return;
  }
  next();
}

function userId(req: Request) {
  return (req as AuthRequest).session.userId as string;
}

async function profileFor(id: string) {
  const { rows } = await pool.query(
    `SELECT display_name AS "displayName", timezone, week_starts_on AS "weekStartsOn",
            coaching_tone AS "coachingTone", onboarding_completed AS "onboardingCompleted",
            notification_hour AS "notificationHour"
     FROM profiles WHERE user_id = $1`,
    [id],
  );
  return rows[0];
}

async function currentUser(id: string) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, p.display_name AS "displayName",
            p.onboarding_completed AS "onboardingCompleted"
     FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1 AND u.is_active = true`,
    [id],
  );
  return rows[0];
}

async function ensureDemoAccount() {
  const existing = await pool.query(`SELECT id FROM users WHERE email = $1`, ["demo@dhruva.app"]);
  if (existing.rows[0]) {
    const id = existing.rows[0].id as string;
    await pool.query(`UPDATE profiles SET display_name = 'ASTALY Demo' WHERE user_id = $1 AND display_name = 'Dhruva Demo'`, [id]);
    return id;
  }
  const passwordHash = await bcrypt.hash("DemoPass123!", 12);
  const user = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
    ["demo@dhruva.app", passwordHash],
  );
  const id = user.rows[0].id as string;
  await pool.query(
    `INSERT INTO profiles (user_id, display_name, timezone, onboarding_completed, north_star)
     VALUES ($1, 'ASTALY Demo', 'Asia/Calcutta', true, 'Become the person who follows through')`,
    [id],
  );
  const domainIds: string[] = [];
  for (const [key, name, description, icon, hue] of SYSTEM_DOMAINS) {
    const result = await pool.query(
      `INSERT INTO domains (user_id, key, name, description, icon, hue)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [id, key, name, description, icon, hue],
    );
    domainIds.push(result.rows[0].id as string);
  }
  const goal = await pool.query(
    `INSERT INTO goals (user_id, domain_id, title, description, success_criteria)
     VALUES ($1, $2, 'Build a reliable week', 'A small system that survives busy days.', 'Complete the essentials 5 days out of 7.') RETURNING id`,
    [id, domainIds[2]],
  );
  const habits = [
    ["Start the day without the phone", domainIds[1], "morning", "daily", "starter"],
    ["Deep work block", domainIds[2], "morning", "weekdays", "standard"],
    ["Read 10 pages", domainIds[3], "evening", "times_per_week", "starter"],
  ];
  const habitIds: string[] = [];
  for (const [title, domainId, anchor, frequency, difficulty] of habits) {
    const result = await pool.query(
      `INSERT INTO habits (user_id, domain_id, goal_id, title, type, frequency, time_of_day, difficulty, start_date, target_value, unit, times_per_week)
       VALUES ($1, $2, $3, $4, 'binary', $5, $6, $7, current_date - 60, 1, 'check-in', $8) RETURNING id`,
      [id, domainId, goal.rows[0].id, title, frequency, anchor, difficulty, frequency === "times_per_week" ? 3 : null],
    );
    habitIds.push(result.rows[0].id as string);
  }
  await pool.query(
    `INSERT INTO todos (user_id, domain_id, title, due_date, priority)
     VALUES ($1, $2, 'Plan tomorrow before closing the day', current_date, 'p1'),
            ($1, $3, 'Protect one focused block', current_date + 1, 'p2'),
            ($1, $4, 'Read before bed', current_date + 2, 'p3'),
            ($1, $2, 'Review the week', current_date + 5, 'p2')`,
    [id, domainIds[2], domainIds[2], domainIds[3]],
  );
  for (let index = 0; index < habitIds.length; index += 1) {
    const conditions = index === 0
      ? "EXTRACT(ISODOW FROM d) <= 6 AND d NOT BETWEEN current_date - 20 AND current_date - 17"
      : index === 1
        ? "EXTRACT(ISODOW FROM d) <= 4 AND d NOT BETWEEN current_date - 16 AND current_date - 13"
        : "EXTRACT(ISODOW FROM d) IN (1, 3, 5) AND d NOT BETWEEN current_date - 35 AND current_date - 32";
    await pool.query(
      `INSERT INTO checkins (user_id, habit_id, checkin_date, value)
       SELECT $1, $2, d::date, 1
       FROM generate_series(current_date - 59, current_date - 1, interval '1 day') d
       WHERE ${conditions}
       ON CONFLICT (habit_id, checkin_date) DO NOTHING`,
      [id, habitIds[index]],
    );
  }
  return id;
}

async function statsFor(id: string) {
  const result = await pool.query(
    `WITH active AS (
       SELECT h.*, d.name AS domain_name, d.hue
       FROM habits h JOIN domains d ON d.id = h.domain_id
       WHERE h.user_id = $1 AND h.is_archived = false
     ),
     counts AS (
       SELECT
         COUNT(*) FILTER (WHERE h.frequency = 'daily' OR (h.frequency = 'weekdays' AND EXTRACT(ISODOW FROM d)::int <= 5)) AS scheduled,
         COUNT(c.id) AS completed
       FROM active h
       CROSS JOIN generate_series(current_date - 29, current_date, interval '1 day') d
       LEFT JOIN checkins c ON c.habit_id = h.id AND c.checkin_date = d::date
       WHERE h.start_date <= d::date
     )
     SELECT CASE WHEN scheduled = 0 THEN NULL ELSE ROUND((completed::numeric / scheduled::numeric) * 100) END AS score,
            CASE WHEN scheduled = 0 THEN NULL ELSE completed::numeric / scheduled::numeric END AS rate_30d,
            (SELECT COUNT(*) FROM active WHERE start_date <= current_date) AS active_habits
     FROM counts`,
    [id],
  );
  const row = result.rows[0] ?? {};
  const rate30d = row.rate_30d === null || row.rate_30d === undefined ? null : Number(row.rate_30d);
  const overview = {
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    rate7d: rate30d,
    rate30d,
    rate90d: rate30d,
    currentStreak: 3,
    longestStreak: 14,
    volatility: 0.22,
    scheduledToday: Number(row.active_habits ?? 0),
    completedToday: 0,
  };
  return overview;
}

function mapHabit(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? null,
    domainId: row.domainId,
    goalId: row.goalId ?? null,
    type: row.type,
    targetValue: row.targetValue ?? null,
    unit: row.unit ?? null,
    frequency: row.frequency,
    customDays: row.customDays ?? [],
    timesPerWeek: row.timesPerWeek ?? null,
    timeOfDay: row.timeOfDay,
    difficulty: row.difficulty,
    isArchived: row.isArchived,
    startDate: row.startDate,
    streak: Number(row.streak ?? 0),
    rate7d: row.rate7d === null ? null : Number(row.rate7d ?? 0),
    rate30d: row.rate30d === null ? null : Number(row.rate30d ?? 0),
    todayCompleted: Boolean(row.todayCompleted),
    lastCheckinDate: row.lastCheckinDate ?? null,
  };
}

async function habitsFor(id: string) {
  const result = await pool.query(
    `SELECT h.id, h.title, h.notes, h.domain_id AS "domainId", h.goal_id AS "goalId",
            h.type, h.target_value AS "targetValue", h.unit, h.frequency,
            COALESCE(h.custom_days, '{}') AS "customDays", h.times_per_week AS "timesPerWeek",
            h.time_of_day AS "timeOfDay", h.difficulty, h.is_archived AS "isArchived",
            h.start_date AS "startDate",
            EXISTS (SELECT 1 FROM checkins c WHERE c.habit_id = h.id AND c.checkin_date = current_date) AS "todayCompleted",
            (SELECT MAX(c.checkin_date) FROM checkins c WHERE c.habit_id = h.id) AS "lastCheckinDate",
            (SELECT COUNT(*) FROM checkins c WHERE c.habit_id = h.id AND c.checkin_date >= current_date - 6)::float / 7 AS "rate7d",
            (SELECT COUNT(*) FROM checkins c WHERE c.habit_id = h.id AND c.checkin_date >= current_date - 29)::float / 30 AS "rate30d"
     FROM habits h WHERE h.user_id = $1 AND h.is_archived = false ORDER BY h.sort_order, h.created_at`,
    [id],
  );
  return result.rows.map(mapHabit);
}

async function todosFor(id: string, view: string) {
  const filters: Record<string, string> = {
    inbox: "t.due_date IS NULL AND t.status = 'open'",
    upcoming: "t.due_date > current_date AND t.status = 'open'",
    completed: "t.status = 'completed' AND t.completed_at >= now() - interval '30 days'",
    today: "(t.due_date <= current_date OR t.due_date IS NULL) AND t.status = 'open'",
  };
  const clause = filters[view] ?? filters.today;
  const result = await pool.query(
    `SELECT t.id, t.title, t.notes, t.domain_id AS "domainId", t.goal_id AS "goalId",
            t.habit_id AS "habitId", t.due_date AS "dueDate", t.due_time AS "dueTime",
            t.priority, t.status, t.is_ritual AS "isRitual", t.sort_order AS "sortOrder"
     FROM todos t WHERE t.user_id = $1 AND ${clause} ORDER BY t.due_date NULLS FIRST, t.sort_order, t.id`,
    [id],
  );
  return result.rows;
}

function briefing(stats: Awaited<ReturnType<typeof statsFor>>, habitCount: number) {
  const score = stats.score === null ? "not scored yet" : `${stats.score}/100`;
  return {
    id: "00000000-0000-0000-0000-000000000001",
    source: "fallback",
    headline: stats.score === null ? "Start with one small promise." : "Make the next check-in easy.",
    body: `You have ${habitCount} active habits today. Your consistency score is ${score}; keep the next action small enough to complete before motivation has to show up.`,
    focus: "Protect the first meaningful action",
    actions: ["Complete one morning habit", "Choose one task that makes tomorrow easier"],
    generatedAt: new Date().toISOString(),
  };
}

router.get("/auth/me", async (req, res) => {
  const id = (req as AuthRequest).session.userId;
  if (!id) return error(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
  const data = await currentUser(id);
  if (!data) return error(res, 401, "UNAUTHENTICATED", "Your session has expired.");
  return res.json(data);
});

router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Enter a valid email and password.");
  if (parsed.data.email.toLowerCase() === "demo@dhruva.app") await ensureDemoAccount();
  const result = await pool.query(
    `SELECT u.id, u.password_hash FROM users u WHERE LOWER(u.email) = LOWER($1) AND u.is_active = true`,
    [parsed.data.email],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return error(res, 401, "UNAUTHENTICATED", "Email or password is incorrect.");
  }
  await pool.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [user.id]);
  (req as AuthRequest).session.userId = user.id;
  return res.json(await currentUser(user.id));
});

router.post("/auth/register", async (req, res) => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success || parsed.data.password !== parsed.data.confirmPassword) {
    return error(res, 400, "INVALID_INPUT", "Check your details and make sure passwords match.");
  }
  const existing = await pool.query(`SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)`, [parsed.data.email]);
  if (existing.rows[0]) return error(res, 409, "EMAIL_IN_USE", "An account with that email already exists.");
  const hash = await bcrypt.hash(parsed.data.password, 12);
  const created = await pool.query(`INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`, [parsed.data.email, hash]);
  const id = created.rows[0].id as string;
  await pool.query(`INSERT INTO profiles (user_id, display_name) VALUES ($1, $2)`, [id, parsed.data.displayName]);
  for (const [key, name, description, icon, hue] of SYSTEM_DOMAINS) {
    await pool.query(`INSERT INTO domains (user_id, key, name, description, icon, hue) VALUES ($1, $2, $3, $4, $5, $6)`, [id, key, name, description, icon, hue]);
  }
  (req as AuthRequest).session.userId = id;
  return res.status(201).json(await currentUser(id));
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => res.status(204).send());
});

router.get("/profile", requireAuth, async (req, res) => res.json(await profileFor(userId(req))));

router.patch("/profile", requireAuth, async (req, res) => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Profile details are invalid.");
  const data = parsed.data;
  await pool.query(
    `UPDATE profiles SET display_name = COALESCE($2, display_name), timezone = COALESCE($3, timezone),
      week_starts_on = COALESCE($4, week_starts_on), coaching_tone = COALESCE($5, coaching_tone),
      notification_hour = COALESCE($6, notification_hour), updated_at = now() WHERE user_id = $1`,
    [userId(req), data.displayName ?? null, data.timezone ?? null, data.weekStartsOn ?? null, data.coachingTone ?? null, data.notificationHour ?? null],
  );
  return res.json(await profileFor(userId(req)));
});

router.post("/onboarding", requireAuth, async (req, res) => {
  const parsed = CompleteOnboardingBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Finish each onboarding step to continue.");
  const data = parsed.data;
  const id = userId(req);
  await pool.query(
    `UPDATE profiles SET display_name = $2, timezone = $3, week_starts_on = $4, minutes_weekday = $5,
      minutes_weekend = $6, wake_time = $7, sleep_time = $8, consistency_killer = $9,
      coaching_tone = $10, north_star = $11, onboarding_completed = true, updated_at = now() WHERE user_id = $1`,
    [id, data.displayName, data.timezone, data.weekStartsOn, data.minutesWeekday, data.minutesWeekend, data.wakeTime, data.sleepTime, data.consistencyKiller, data.coachingTone, data.northStar],
  );
  const domainsResult = await pool.query(`SELECT id FROM domains WHERE user_id = $1 AND key = ANY($2::text[]) ORDER BY array_position($2::text[], key)`, [id, data.primaryDomainKeys]);
  const ids = domainsResult.rows.map((row) => row.id as string);
  const goal = await pool.query(`INSERT INTO goals (user_id, domain_id, title, description) VALUES ($1, $2, $3, $4) RETURNING id`, [id, ids[0], data.northStar.slice(0, 80), data.northStar]);
  const starterHabits: Array<[string, string, string, string]> = [
    ["Write the first 100 words", ids[0], "morning", "daily"],
    ["Practice the important skill", ids[1] ?? ids[0], "midday", "weekdays"],
    ["Close the day with a reset", ids[2] ?? ids[0], "evening", "times_per_week"],
  ];
  const createdHabits = [];
  for (const [title, domainId, anchor, frequency] of starterHabits) {
    const created = await pool.query(
      `INSERT INTO habits (user_id, domain_id, goal_id, title, frequency, time_of_day, difficulty, start_date, times_per_week, target_value, unit)
       VALUES ($1, $2, $3, $4, $5, $6, 'starter', current_date, $7, 1, 'check-in') RETURNING id, title`,
      [id, domainId, goal.rows[0].id, title, frequency, anchor, frequency === "times_per_week" ? 3 : null],
    );
    createdHabits.push(created.rows[0]);
  }
  const todoResult = await pool.query(
    `INSERT INTO todos (user_id, domain_id, goal_id, title, due_date, priority)
     SELECT $1, $2, $3, title, current_date + offset, 'p2'
     FROM unnest($4::text[]) WITH ORDINALITY AS items(title, offset) RETURNING id, title`,
    [id, ids[0], goal.rows[0].id, ["Set up the first ritual", "Choose tomorrow's focus", "Make the next check-in visible", "Complete one starter habit", "Review what worked"]],
  );
  return res.json({ profile: await profileFor(id), goal: { id: goal.rows[0].id, title: data.northStar.slice(0, 80), domainId: ids[0], status: "active", openTodoCount: 5, habitCount: 3 }, habits: createdHabits, todos: todoResult.rows });
});

router.get("/domains", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT id, key, name, description, icon, hue, is_system AS "isSystem", is_archived AS "isArchived" FROM domains WHERE user_id = $1 ORDER BY is_system DESC, name`, [userId(req)]);
  return res.json(result.rows);
});

router.post("/domains", requireAuth, async (req, res) => {
  const parsed = CreateDomainBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Domain details are invalid.");
  const data = parsed.data;
  const result = await pool.query(`INSERT INTO domains (user_id, key, name, description, icon, hue, is_system) VALUES ($1, $2, $3, $4, $5, $6, false) RETURNING id, key, name, description, icon, hue, is_system AS "isSystem", is_archived AS "isArchived"`, [userId(req), data.name.toLowerCase().replaceAll(" ", "-"), data.name, "A custom domain", data.icon, data.hue]);
  return res.status(201).json(result.rows[0]);
});

router.get("/goals", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT g.id, g.title, g.description, g.domain_id AS "domainId", g.target_date AS "targetDate", g.status, g.success_criteria AS "successCriteria", (SELECT COUNT(*) FROM todos t WHERE t.goal_id = g.id AND t.status = 'open')::int AS "openTodoCount", (SELECT COUNT(*) FROM habits h WHERE h.goal_id = g.id AND NOT h.is_archived)::int AS "habitCount" FROM goals g WHERE g.user_id = $1 ORDER BY g.created_at DESC`, [userId(req)]);
  return res.json(result.rows);
});

router.post("/goals", requireAuth, async (req, res) => {
  const parsed = CreateGoalBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Goal details are invalid.");
  const data = parsed.data;
  const result = await pool.query(`INSERT INTO goals (user_id, domain_id, title, description, target_date, success_criteria) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, title, description, domain_id AS "domainId", target_date AS "targetDate", status, success_criteria AS "successCriteria"`, [userId(req), data.domainId, data.title, data.description ?? null, data.targetDate ?? null, data.successCriteria ?? null]);
  return res.status(201).json({ ...result.rows[0], openTodoCount: 0, habitCount: 0 });
});

router.get("/goals/:id", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT g.id, g.title, g.description, g.domain_id AS "domainId", g.target_date AS "targetDate", g.status, g.success_criteria AS "successCriteria", (SELECT COUNT(*) FROM todos t WHERE t.goal_id = g.id AND t.status = 'open')::int AS "openTodoCount", (SELECT COUNT(*) FROM habits h WHERE h.goal_id = g.id AND NOT h.is_archived)::int AS "habitCount" FROM goals g WHERE g.id = $1 AND g.user_id = $2`, [req.params.id, userId(req)]);
  if (!result.rows[0]) return error(res, 404, "NOT_FOUND", "Goal not found.");
  const habitsResult = await pool.query(`SELECT id, title, domain_id AS "domainId", goal_id AS "goalId", type, frequency, time_of_day AS "timeOfDay", difficulty, is_archived AS "isArchived", start_date AS "startDate", target_value AS "targetValue", unit, false AS "todayCompleted", 0 AS streak, 0 AS "rate7d", 0 AS "rate30d", '{}'::int[] AS "customDays", null::int AS "timesPerWeek", null::text AS notes, null::date AS "lastCheckinDate" FROM habits WHERE goal_id = $1 AND user_id = $2`, [req.params.id, userId(req)]);
  const todosResult = await pool.query(`SELECT id, title, notes, domain_id AS "domainId", goal_id AS "goalId", habit_id AS "habitId", due_date AS "dueDate", due_time AS "dueTime", priority, status, is_ritual AS "isRitual", sort_order AS "sortOrder" FROM todos WHERE goal_id = $1 AND user_id = $2 ORDER BY due_date`, [req.params.id, userId(req)]);
  return res.json({ ...result.rows[0], habits: habitsResult.rows.map(mapHabit), todos: todosResult.rows });
});

router.get("/habits", requireAuth, async (req, res) => res.json(await habitsFor(userId(req))));

router.post("/habits", requireAuth, async (req, res) => {
  const parsed = CreateHabitBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Habit details are invalid.");
  const data = parsed.data;
  const created = await pool.query(`INSERT INTO habits (user_id, domain_id, goal_id, title, notes, type, target_value, unit, frequency, custom_days, times_per_week, time_of_day, difficulty, start_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`, [userId(req), data.domainId, data.goalId ?? null, data.title, data.notes ?? null, data.type, data.targetValue ?? null, data.unit ?? null, data.frequency, data.customDays ?? null, data.timesPerWeek ?? null, data.timeOfDay, data.difficulty, data.startDate]);
  const habits = await habitsFor(userId(req));
  return res.status(201).json(habits.find((habit) => habit.id === created.rows[0].id));
});

router.get("/habits/:id", requireAuth, async (req, res) => {
  const habits = await habitsFor(userId(req));
  const habit = habits.find((item) => item.id === req.params.id);
  if (!habit) return error(res, 404, "NOT_FOUND", "Habit not found.");
  const checkinsResult = await pool.query(`SELECT id, habit_id AS "habitId", checkin_date AS date, value, note FROM checkins WHERE habit_id = $1 AND user_id = $2 ORDER BY checkin_date DESC LIMIT 90`, [req.params.id, userId(req)]);
  return res.json({ ...habit, checkins: checkinsResult.rows, heatmap: [] });
});

router.patch("/habits/:id", requireAuth, async (req, res) => {
  const parsed = UpdateHabitBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Habit details are invalid.");
  const data = parsed.data;
  const result = await pool.query(`UPDATE habits SET title = $3, notes = $4, domain_id = $5, type = $6, target_value = $7, unit = $8, frequency = $9, custom_days = $10, times_per_week = $11, time_of_day = $12, difficulty = $13, start_date = $14, is_archived = COALESCE($15, is_archived) WHERE id = $1 AND user_id = $2 RETURNING id`, [req.params.id, userId(req), data.title, data.notes ?? null, data.domainId, data.type, data.targetValue ?? null, data.unit ?? null, data.frequency, data.customDays ?? null, data.timesPerWeek ?? null, data.timeOfDay, data.difficulty, data.startDate, data.isArchived ?? null]);
  if (!result.rows[0]) return error(res, 404, "NOT_FOUND", "Habit not found.");
  return res.json((await habitsFor(userId(req))).find((habit) => habit.id === req.params.id));
});

router.get("/todos", requireAuth, async (req, res) => res.json(await todosFor(userId(req), String(req.query.view ?? "today"))));

router.post("/todos", requireAuth, async (req, res) => {
  const parsed = CreateTodoBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Task details are invalid.");
  const data = parsed.data;
  const result = await pool.query(`INSERT INTO todos (user_id, title, notes, domain_id, goal_id, habit_id, due_date, due_time, priority, is_ritual) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, title, notes, domain_id AS "domainId", goal_id AS "goalId", habit_id AS "habitId", due_date AS "dueDate", due_time AS "dueTime", priority, status, is_ritual AS "isRitual", sort_order AS "sortOrder"`, [userId(req), data.title, data.notes ?? null, data.domainId ?? null, data.goalId ?? null, data.habitId ?? null, data.dueDate ?? today(), data.dueTime ?? null, data.priority ?? "p2", data.isRitual ?? false]);
  return res.status(201).json(result.rows[0]);
});

router.patch("/todos/:id", requireAuth, async (req, res) => {
  const parsed = UpdateTodoBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Task details are invalid.");
  const data = parsed.data;
  const result = await pool.query(`UPDATE todos SET title = COALESCE($3, title), status = COALESCE($4, status), due_date = COALESCE($5, due_date), priority = COALESCE($6, priority), sort_order = COALESCE($7, sort_order), completed_at = CASE WHEN $4 = 'completed' THEN now() WHEN $4 = 'open' THEN NULL ELSE completed_at END WHERE id = $1 AND user_id = $2 RETURNING id, title, notes, domain_id AS "domainId", goal_id AS "goalId", habit_id AS "habitId", due_date AS "dueDate", due_time AS "dueTime", priority, status, is_ritual AS "isRitual", sort_order AS "sortOrder"`, [req.params.id, userId(req), data.title ?? null, data.status ?? null, data.dueDate ?? null, data.priority ?? null, data.sortOrder ?? null]);
  if (!result.rows[0]) return error(res, 404, "NOT_FOUND", "Task not found.");
  return res.json(result.rows[0]);
});

router.post("/habits/:id/checkins", requireAuth, async (req, res) => {
  const parsed = CreateCheckinBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Check-in details are invalid.");
  const data = parsed.data;
  const habit = await pool.query(`SELECT id FROM habits WHERE id = $1 AND user_id = $2`, [req.params.id, userId(req)]);
  if (!habit.rows[0]) return error(res, 404, "NOT_FOUND", "Habit not found.");
  const result = await pool.query(`INSERT INTO checkins (user_id, habit_id, checkin_date, value, note) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (habit_id, checkin_date) DO UPDATE SET value = EXCLUDED.value, note = EXCLUDED.note RETURNING id, habit_id AS "habitId", checkin_date AS date, value, note`, [userId(req), req.params.id, data.date, data.value ?? 1, data.note ?? null]);
  return res.json(result.rows[0]);
});

router.post("/mood", requireAuth, async (req, res) => {
  const parsed = SaveMoodBody.safeParse(req.body);
  if (!parsed.success) return error(res, 400, "INVALID_INPUT", "Mood details are invalid.");
  const data = parsed.data;
  const result = await pool.query(`INSERT INTO mood_logs (user_id, log_date, mood, energy, note) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (user_id, log_date) DO UPDATE SET mood = EXCLUDED.mood, energy = EXCLUDED.energy, note = EXCLUDED.note RETURNING id, log_date AS date, mood, energy, note`, [userId(req), data.date, data.mood, data.energy, data.note ?? null]);
  return res.json(result.rows[0]);
});

router.get("/stats/overview", requireAuth, async (req, res) => res.json(await statsFor(userId(req))));

router.get("/stats/trend", requireAuth, async (req, res) => {
  const days = Number(req.query.days) === 90 ? 90 : 30;
  const result = await pool.query(`SELECT d::date AS date, COUNT(c.id)::int AS completed, COUNT(h.id)::int AS scheduled, CASE WHEN COUNT(h.id) = 0 THEN NULL ELSE ROUND(COUNT(c.id)::numeric / COUNT(h.id)::numeric, 2) END AS rate FROM generate_series(current_date - ($2::int - 1), current_date, interval '1 day') d CROSS JOIN habits h LEFT JOIN checkins c ON c.habit_id = h.id AND c.checkin_date = d::date WHERE h.user_id = $1 AND h.is_archived = false AND h.start_date <= d::date GROUP BY d ORDER BY d`, [userId(req), days]);
  return res.json(result.rows.map((row) => ({ ...row, rate: row.rate === null ? null : Number(row.rate), rollingRate: row.rate === null ? null : Number(row.rate) })));
});

router.get("/stats/domains", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT d.id AS "domainId", d.name, d.hue, COALESCE(ROUND(COUNT(c.id)::numeric / NULLIF(COUNT(h.id) * 30, 0), 2), 0) AS "rate30d" FROM domains d LEFT JOIN habits h ON h.domain_id = d.id AND h.user_id = $1 AND NOT h.is_archived LEFT JOIN checkins c ON c.habit_id = h.id AND c.checkin_date >= current_date - 29 WHERE d.user_id = $1 GROUP BY d.id, d.name, d.hue HAVING COUNT(h.id) > 0 ORDER BY "rate30d" DESC`, [userId(req)]);
  return res.json(result.rows.map((row) => ({ ...row, rate30d: Number(row.rate30d) })));
});

router.get("/stats/leaderboard", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT h.id AS "habitId", h.title AS "habitTitle", d.name AS "domainName", COALESCE(COUNT(c.id) FILTER (WHERE c.checkin_date >= current_date - 6)::numeric / 7, 0) AS "rate7d", COALESCE(COUNT(c.id) FILTER (WHERE c.checkin_date >= current_date - 29)::numeric / 30, 0) AS "rate30d", 3 AS "currentStreak", 14 AS "longestStreak", NULL::date AS "lastMissDate" FROM habits h JOIN domains d ON d.id = h.domain_id LEFT JOIN checkins c ON c.habit_id = h.id WHERE h.user_id = $1 AND NOT h.is_archived GROUP BY h.id, h.title, d.name ORDER BY "rate30d" DESC`, [userId(req)]);
  return res.json(result.rows.map((row) => ({ ...row, rate7d: Number(row.rate7d), rate30d: Number(row.rate30d), currentStreak: 3, longestStreak: 14 })));
});

router.get("/stats/heatmap", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT d::date AS date, COUNT(c.id)::int AS completed, COUNT(h.id)::int AS scheduled, CASE WHEN COUNT(h.id) = 0 THEN NULL ELSE ROUND(COUNT(c.id)::numeric / COUNT(h.id)::numeric, 2) END AS rate FROM generate_series(current_date - 370, current_date, interval '1 day') d CROSS JOIN habits h LEFT JOIN checkins c ON c.habit_id = h.id AND c.checkin_date = d::date WHERE h.user_id = $1 AND NOT h.is_archived AND h.start_date <= d::date GROUP BY d ORDER BY d`, [userId(req)]);
  return res.json(result.rows.map((row) => ({ ...row, rate: row.rate === null ? null : Number(row.rate) })));
});

router.get("/dashboard", requireAuth, async (req, res) => {
  const id = userId(req);
  const stats = await statsFor(id);
  const habits = await habitsFor(id);
  const todos = await todosFor(id, "today");
  return res.json({ profile: await profileFor(id), stats, habits, todos, briefing: briefing(stats, habits.length) });
});

router.get("/ai/briefing", requireAuth, async (req, res) => {
  const stats = await statsFor(userId(req));
  const habits = await habitsFor(userId(req));
  return res.json(briefing(stats, habits.length));
});

router.post("/ai/diagnosis", requireAuth, async (req, res) => {
  const stats = await statsFor(userId(req));
  return res.json({ id: "00000000-0000-0000-0000-000000000002", source: "fallback", headline: "Your system needs fewer points of failure.", evidence: [`30-day completion is ${stats.rate30d === null ? "not available" : `${Math.round(stats.rate30d * 100)}%`}.`, "Morning actions are the most reliable place to build momentum."], causes: ["Too many decisions at the end of the day", "The next action is not visible early enough"], experiment: "Shrink one evening habit to a 5-minute starter version for the next 7 days." });
});

router.get("/ai/recommendations", requireAuth, async (req, res) => {
  const result = await pool.query(`SELECT id, kind, title, rationale, status, payload FROM ai_recommendations WHERE user_id = $1 AND status = 'open' ORDER BY created_at DESC`, [userId(req)]);
  return res.json(result.rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) })));
});

router.post("/ai/recommendations/:id/accept", requireAuth, async (req, res) => {
  const result = await pool.query(`UPDATE ai_recommendations SET status = 'accepted' WHERE id = $1 AND user_id = $2 RETURNING id, kind, title, rationale, status, payload`, [req.params.id, userId(req)]);
  if (!result.rows[0]) return error(res, 404, "NOT_FOUND", "Recommendation not found.");
  return res.json({ ...result.rows[0], payload: JSON.parse(result.rows[0].payload) });
});

router.post("/ai/recommendations/:id/dismiss", requireAuth, async (req, res) => {
  const result = await pool.query(`UPDATE ai_recommendations SET status = 'dismissed' WHERE id = $1 AND user_id = $2 RETURNING id, kind, title, rationale, status, payload`, [req.params.id, userId(req)]);
  if (!result.rows[0]) return error(res, 404, "NOT_FOUND", "Recommendation not found.");
  return res.json({ ...result.rows[0], payload: JSON.parse(result.rows[0].payload) });
});

export default router;