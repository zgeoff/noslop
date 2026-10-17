# Security and input trust

- Trigger: any of the `security` slice's 5 parts, or a risk class that forces it
- Input: the hunks; the `security` slice; request-path middleware and headers
- Call: B, alone

## Prompt

Read the change as an attacker. Find a way for untrusted input to do something its sender is not
allowed to do.

Look for:

1. An allow-or-deny check that fails open: an error, an empty value, an unknown case or a parse
   failure that ends in allow.
2. An untrusted value that reaches a sink: a shell command, a SQL string, a file path, a redirect or
   callback URL, or text placed into a model's trusted instructions.
3. A request path that skips the access gate: a new route without it, a header or method override
   that changes what the gate checked, middleware in the wrong order.
4. A query on a resource the actor owns, with no condition on the actor.
5. A response or log that exposes a column, a secret or internal detail the caller must not see.
6. A permission, scope or grant made wider than the task needs.
7. A read of a credential, token or `.env` path.

Check each candidate:

1. Name the input, who controls it, and the line where it reaches the sink or passes the gate.
2. Read the gate and the middleware on the path before you claim a bypass.
3. Rate the unsafe case: when the finding is safe only if an unchecked fact holds, report it as
   PLAUSIBLE and name the fact.

Do not report:

1. Input that only the repo's owner or its own config controls, unless it crosses to another user.

Severity: every security finding is P1.
