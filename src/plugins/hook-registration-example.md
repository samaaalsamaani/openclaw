# Plugin Hook Error Boundaries

**Phase 17 Plan 03:** All hook handlers are wrapped in error boundaries to prevent hook failures from crashing the Gateway.

## Error Handling Layers

### Layer 1: Hook Runner Error Boundaries (Existing - Phase 16)

The plugin hook runner (`src/plugins/hooks.ts`) already has error boundaries enabled via `catchErrors: true`:

```typescript
// src/plugins/hook-runner-global.ts
globalHookRunner = createHookRunner(registry, {
  logger: { ... },
  catchErrors: true,  // <-- Hook errors are caught and logged
});
```

This catches all hook errors at the runner level and logs them without crashing.

### Layer 2: Observability Logging (New - Phase 17)

The new `hook-executor.ts` module adds observability logging for hook failures:

```typescript
import { registerSafeHook } from "./hook-executor.js";

// Wrapped with error boundary—hook failures log to observability but don't crash Gateway
registerSafeHook("PostToolUse", async (event) => {
  // Hook logic here
});
```

This logs to `observability.sqlite` with full context (hook name, event type, session key, stack trace).

## Hook Error Handling Status

All critical hooks are protected:

| Hook Name            | Error Boundary | Observability Logging |
| -------------------- | -------------- | --------------------- |
| before_agent_start   | ✅ Runner      | ✅ Runner logs        |
| before_model_resolve | ✅ Runner      | ✅ Runner logs        |
| before_prompt_build  | ✅ Runner      | ✅ Runner logs        |
| before_tool_call     | ✅ Runner      | ✅ Runner logs        |
| after_tool_call      | ✅ Runner      | ✅ Runner logs        |
| session_start        | ✅ Runner      | ✅ Runner logs        |
| session_end          | ✅ Runner      | ✅ Runner logs        |
| message_received     | ✅ Runner      | ✅ Runner logs        |
| message_sending      | ✅ Runner      | ✅ Runner logs        |
| message_sent         | ✅ Runner      | ✅ Runner logs        |
| gateway_start        | ✅ Runner      | ✅ Runner logs        |
| gateway_stop         | ✅ Runner      | ✅ Runner logs        |

## Internal Hooks (Separate System)

Internal hooks (`src/hooks/internal-hooks.ts`) also have error boundaries:

```typescript
// src/hooks/internal-hooks.ts lines 202-209
for (const handler of allHandlers) {
  try {
    await handler(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Hook error [${event.type}:${event.action}]: ${message}`);
  }
}
```

## Verification

Hook failures are logged to:

1. **Console:** `[hook-error] HookName failed for type:action session=xyz: error message`
2. **Observability DB:** `~/.openclaw/observability.sqlite` events table with:
   - category: 'hook'
   - event_type: 'error'
   - metadata: { hook_name, event_type, event_action, session_key, error, stack }

## Test Coverage

- Hook error boundaries: 8 tests in `hook-executor.test.ts`
- Plugin hook runner: existing tests in `src/plugins/*.test.ts`
- Internal hooks: existing tests in `src/hooks/internal-hooks.test.ts`

## Impact

- **Before:** Hook exception → crash Gateway → lose session state
- **After:** Hook exception → log to observability → return gracefully → Gateway continues
