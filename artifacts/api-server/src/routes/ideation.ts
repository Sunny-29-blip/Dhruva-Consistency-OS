import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import {
  ArchiveNoteParams,
  ArchiveNoteResponse,
  CreateNoteBody,
  CreateNoteResponse,
  CreateNotebookBody,
  CreateNotebookResponse,
  GetNoteParams,
  GetNoteResponse,
  ListNotesQueryParams,
  ListNotesResponse,
  ListNotebooksResponse,
  UpdateNoteBody,
  UpdateNoteParams,
  UpdateNoteResponse,
  UpdateNotebookBody,
  UpdateNotebookParams,
  UpdateNotebookResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type AuthRequest = Request & {
  session: Request["session"] & { userId?: string };
};

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
): void {
  res.status(status).json({ error: { code, message } });
}

function requireAuth(req: Request, res: Response, next: () => void): void {
  if (!(req as AuthRequest).session.userId) {
    sendError(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    return;
  }
  next();
}

function userId(req: Request): string {
  return (req as AuthRequest).session.userId as string;
}

const notebookSelect = `
  SELECT b.id, b.title, b.description, b.icon, b.color, b.category,
         b.visibility, b.is_archived AS "isArchived",
         (SELECT COUNT(*)::int FROM ideation_items i
          WHERE i.notebook_id = b.id AND i.user_id = b.user_id
            AND NOT i.is_archived) AS "notesCount",
         b.created_at AS "createdAt", b.updated_at AS "updatedAt"
  FROM ideation_notebooks b
`;

const itemSelect = `
  SELECT i.id, i.notebook_id AS "notebookId", n.title AS "notebookTitle",
         i.title, i.content, i.kind, i.tags, i.category, i.status,
         i.problem, i.audience, i.proposed_solution AS "proposedSolution",
         i.potential_value AS "potentialValue",
         i.open_questions AS "openQuestions", i.next_actions AS "nextActions",
         i.visibility, i.pinned, i.is_archived AS "isArchived",
         i.published_at AS "publishedAt",
         i.created_at AS "createdAt", i.updated_at AS "updatedAt"
  FROM ideation_items i
  INNER JOIN ideation_notebooks n
    ON n.id = i.notebook_id AND n.user_id = i.user_id
`;

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function serializeRow<
  T extends {
    createdAt: Date | string;
    updatedAt: Date | string;
    publishedAt?: Date | string | null;
  },
>(row: T) {
  return {
    ...row,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    ...("publishedAt" in row
      ? { publishedAt: iso(row.publishedAt ?? null) }
      : {}),
  };
}

async function findNotebook(id: string, ownerId: string) {
  const { rows } = await pool.query(
    `${notebookSelect}
     WHERE b.id = $1 AND b.user_id = $2`,
    [id, ownerId],
  );
  return rows[0] ? serializeRow(rows[0]) : undefined;
}

async function findItem(id: string, ownerId: string) {
  const { rows } = await pool.query(
    `${itemSelect}
     WHERE i.id = $1 AND i.user_id = $2`,
    [id, ownerId],
  );
  return rows[0] ? serializeRow(rows[0]) : undefined;
}

function normalizeTags(tags: string[] | undefined): string[] {
  const unique = new Map<string, string>();
  for (const tag of tags ?? []) {
    const normalized = tag.trim();
    if (normalized) unique.set(normalized.toLocaleLowerCase(), normalized);
  }
  return [...unique.values()].slice(0, 12);
}

router.get("/notebooks", requireAuth, async (req, res): Promise<void> => {
  const ownerId = userId(req);
  const { rows } = await pool.query(
    `${notebookSelect}
     WHERE b.user_id = $1
     ORDER BY b.is_archived ASC, b.updated_at DESC`,
    [ownerId],
  );
  res.json(ListNotebooksResponse.parse(rows.map(serializeRow)));
});

router.post("/notebooks", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateNotebookBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "INVALID_NOTEBOOK", parsed.error.message);
    return;
  }

  const data = parsed.data;
  const { rows } = await pool.query(
    `INSERT INTO ideation_notebooks
       (user_id, title, description, icon, color, category)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      userId(req),
      data.title.trim(),
      data.description ?? null,
      data.icon ?? "book",
      data.color ?? null,
      data.category ?? null,
    ],
  );
  const notebook = await findNotebook(rows[0].id, userId(req));
  if (!notebook) {
    sendError(res, 500, "NOTEBOOK_CREATE_FAILED", "Notebook could not be created.");
    return;
  }
  res.status(201).json(CreateNotebookResponse.parse(notebook));
});

router.patch(
  "/notebooks/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateNotebookParams.safeParse(req.params);
    if (!params.success) {
      sendError(res, 400, "INVALID_NOTEBOOK_ID", params.error.message);
      return;
    }
    const parsed = UpdateNotebookBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "INVALID_NOTEBOOK", parsed.error.message);
      return;
    }
    const data = parsed.data;
    const columns: Record<string, string> = {
      title: "title",
      description: "description",
      icon: "icon",
      color: "color",
      category: "category",
      isArchived: "is_archived",
    };
    const assignments: string[] = [];
    const values: (string | boolean | null)[] = [];
    for (const [field, column] of Object.entries(columns)) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        const value = (data as Record<string, string | boolean | null>)[field];
        if (field === "title" && typeof value === "string" && !value.trim()) {
          sendError(res, 400, "INVALID_NOTEBOOK", "Notebook title is required.");
          return;
        }
        values.push(field === "title" && typeof value === "string" ? value.trim() : value);
        assignments.push(`${column} = $${values.length + 2}`);
      }
    }
    if (!assignments.length) {
      sendError(res, 400, "EMPTY_UPDATE", "Provide at least one notebook field.");
      return;
    }
    assignments.push("updated_at = now()");
    const ownerId = userId(req);
    const result = await pool.query(
      `UPDATE ideation_notebooks
       SET ${assignments.join(", ")}
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [params.data.id, ownerId, ...values],
    );
    if (!result.rowCount) {
      sendError(res, 404, "NOTEBOOK_NOT_FOUND", "Notebook not found.");
      return;
    }
    const notebook = await findNotebook(params.data.id, ownerId);
    if (!notebook) {
      sendError(res, 404, "NOTEBOOK_NOT_FOUND", "Notebook not found.");
      return;
    }
    res.json(UpdateNotebookResponse.parse(notebook));
  },
);

router.get("/notes", requireAuth, async (req, res): Promise<void> => {
  const includeArchivedRaw = req.query.includeArchived;
  const normalizedQuery = {
    ...req.query,
    includeArchived:
      includeArchivedRaw === "true" ||
      (Array.isArray(includeArchivedRaw) && includeArchivedRaw[0] === "true"),
  };
  const parsed = ListNotesQueryParams.safeParse(normalizedQuery);
  if (!parsed.success) {
    sendError(res, 400, "INVALID_NOTE_FILTER", parsed.error.message);
    return;
  }

  const { notebookId, kind, search, includeArchived } = parsed.data;
  const { rows } = await pool.query(
    `${itemSelect}
     WHERE i.user_id = $1
       AND ($2::uuid IS NULL OR i.notebook_id = $2)
       AND ($3::ideation_kind IS NULL OR i.kind = $3::ideation_kind)
       AND ($4::text IS NULL OR
            concat_ws(' ', i.title, i.content, i.category, array_to_string(i.tags, ' '),
                      i.problem, i.audience, i.proposed_solution, i.potential_value,
                      i.open_questions, i.next_actions)
              ILIKE '%' || $4 || '%')
       AND ($5::boolean OR (NOT i.is_archived AND NOT n.is_archived))
     ORDER BY i.pinned DESC, i.updated_at DESC`,
    [userId(req), notebookId ?? null, kind ?? null, search?.trim() || null, includeArchived],
  );
  res.json(ListNotesResponse.parse(rows.map(serializeRow)));
});

router.post("/notes", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateNoteBody.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "INVALID_IDEATION_ITEM", parsed.error.message);
    return;
  }
  const data = parsed.data;
  const ownerId = userId(req);
  const notebook = await pool.query(
    `SELECT id FROM ideation_notebooks
     WHERE id = $1 AND user_id = $2 AND NOT is_archived`,
    [data.notebookId, ownerId],
  );
  if (!notebook.rowCount) {
    sendError(res, 404, "NOTEBOOK_NOT_FOUND", "Choose an active notebook you own.");
    return;
  }

  const { rows } = await pool.query(
    `INSERT INTO ideation_items
       (user_id, notebook_id, title, content, kind, tags, category, status,
        problem, audience, proposed_solution, potential_value, open_questions, next_actions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [
      ownerId,
      data.notebookId,
      data.title.trim(),
      data.content ?? null,
      data.kind,
      normalizeTags(data.tags),
      data.category ?? null,
      data.kind === "idea" ? data.status ?? "captured" : "captured",
      data.kind === "idea" ? data.problem ?? null : null,
      data.kind === "idea" ? data.audience ?? null : null,
      data.kind === "idea" ? data.proposedSolution ?? null : null,
      data.kind === "idea" ? data.potentialValue ?? null : null,
      data.kind === "idea" ? data.openQuestions ?? null : null,
      data.kind === "idea" ? data.nextActions ?? null : null,
    ],
  );
  const item = await findItem(rows[0].id, ownerId);
  if (!item) {
    sendError(res, 500, "IDEATION_ITEM_CREATE_FAILED", "Thought could not be created.");
    return;
  }
  res.status(201).json(CreateNoteResponse.parse(item));
});

router.get("/notes/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetNoteParams.safeParse(req.params);
  if (!params.success) {
    sendError(res, 400, "INVALID_IDEATION_ITEM_ID", params.error.message);
    return;
  }
  const item = await findItem(params.data.id, userId(req));
  if (!item) {
    sendError(res, 404, "IDEATION_ITEM_NOT_FOUND", "Thought not found.");
    return;
  }
  res.json(GetNoteResponse.parse(item));
});

router.patch(
  "/notes/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateNoteParams.safeParse(req.params);
    if (!params.success) {
      sendError(res, 400, "INVALID_IDEATION_ITEM_ID", params.error.message);
      return;
    }
    const parsed = UpdateNoteBody.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "INVALID_IDEATION_ITEM", parsed.error.message);
      return;
    }
    const data = parsed.data;
    const ownerId = userId(req);
    if (data.notebookId) {
      const notebook = await pool.query(
        `SELECT id FROM ideation_notebooks
         WHERE id = $1 AND user_id = $2 AND NOT is_archived`,
        [data.notebookId, ownerId],
      );
      if (!notebook.rowCount) {
        sendError(res, 404, "NOTEBOOK_NOT_FOUND", "Choose an active notebook you own.");
        return;
      }
    }

    const columns: Record<string, string> = {
      notebookId: "notebook_id",
      title: "title",
      content: "content",
      tags: "tags",
      category: "category",
      status: "status",
      problem: "problem",
      audience: "audience",
      proposedSolution: "proposed_solution",
      potentialValue: "potential_value",
      openQuestions: "open_questions",
      nextActions: "next_actions",
      pinned: "pinned",
      isArchived: "is_archived",
    };
    const assignments: string[] = [];
    const values: (string | boolean | string[] | null)[] = [];
    for (const [field, column] of Object.entries(columns)) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        let value = (data as Record<string, string | boolean | string[] | null>)[field];
        if (field === "title" && typeof value === "string") {
          value = value.trim();
          if (!value) {
            sendError(res, 400, "INVALID_IDEATION_ITEM", "Thought title is required.");
            return;
          }
        }
        if (field === "tags" && Array.isArray(value)) value = normalizeTags(value);
        values.push(value);
        assignments.push(`${column} = $${values.length + 2}`);
      }
    }
    if (!assignments.length) {
      sendError(res, 400, "EMPTY_UPDATE", "Provide at least one thought field.");
      return;
    }
    assignments.push("updated_at = now()");
    const result = await pool.query(
      `UPDATE ideation_items
       SET ${assignments.join(", ")}
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [params.data.id, ownerId, ...values],
    );
    if (!result.rowCount) {
      sendError(res, 404, "IDEATION_ITEM_NOT_FOUND", "Thought not found.");
      return;
    }
    const item = await findItem(params.data.id, ownerId);
    if (!item) {
      sendError(res, 404, "IDEATION_ITEM_NOT_FOUND", "Thought not found.");
      return;
    }
    res.json(UpdateNoteResponse.parse(item));
  },
);

router.post(
  "/notes/:id/archive",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = ArchiveNoteParams.safeParse(req.params);
    if (!params.success) {
      sendError(res, 400, "INVALID_IDEATION_ITEM_ID", params.error.message);
      return;
    }
    const result = await pool.query(
      `UPDATE ideation_items
       SET is_archived = true, updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [params.data.id, userId(req)],
    );
    if (!result.rowCount) {
      sendError(res, 404, "IDEATION_ITEM_NOT_FOUND", "Thought not found.");
      return;
    }
    const item = await findItem(params.data.id, userId(req));
    if (!item) {
      sendError(res, 404, "IDEATION_ITEM_NOT_FOUND", "Thought not found.");
      return;
    }
    res.json(ArchiveNoteResponse.parse(item));
  },
);

export default router;
