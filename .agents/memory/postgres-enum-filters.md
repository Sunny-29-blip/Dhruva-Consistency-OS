---
name: PostgreSQL enum filters
description: Binding optional filters against PostgreSQL enum columns in raw parameterized queries.
---

When filtering a PostgreSQL enum column with an optional bound value, cast the parameter to the matching enum type for both the null check and comparison. A text-typed parameter does not compare directly with a native enum.

**Why:** An ideation list filter failed at runtime because the nullable parameter was explicitly typed as text while the database column used a PostgreSQL enum.

**How to apply:** In raw `pg` queries, prefer `($n::enum_type IS NULL OR enum_column = $n::enum_type)` for nullable enum filters.
