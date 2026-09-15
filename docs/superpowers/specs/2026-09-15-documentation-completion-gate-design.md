# Documentation Completion Gate Design

## Goal

Prevent the orchestrator from silently completing a task before it has resolved whether project documentation needs updating.

## Scope

This change updates generated Kiki agent and workflow templates. It does not add runtime enforcement to the OpenCode plugin or migrate existing task registry entries.

## Registry Contract

Every new task registry entry includes a `documentation` object:

```json
{
  "documentation": {
    "status": "pending | not_required | completed",
    "reason": "Concrete explanation of the decision",
    "updatedFiles": ["README.md", "CHANGELOG.md"]
  }
}
```

`pending` is the initial state. `not_required` requires a concrete reason explaining why the change affects no user-facing, operational, or project documentation. `completed` means the historian was dispatched and records the files it updated, or explicitly records that it reviewed the task and no update was necessary.

## Orchestrator Behavior

The dispatch rules explicitly route documentation decisions to `kiki-historian`. Before setting a task to `completed`, the orchestrator must resolve `documentation.status`; it must never complete a task while the status is `pending`.

For clearly local, internal changes, the orchestrator can record `not_required` without dispatching the historian. All other changes dispatch the historian and record `completed` only after its result.

## Workflow Documentation

The generated workflow repeats the registry contract and the completion gate so the operational documentation matches the orchestrator instructions.

## Testing

Template-generation tests assert that newly scaffolded orchestrator and workflow files contain the documentation route, the three registry states, and the prohibition on completing tasks with pending documentation.
