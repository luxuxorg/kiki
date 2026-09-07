# Project Routing Update Preservation Design

## Goal

Make `kiki update` preserve project-specific agent model selections while incorporating any newly introduced default Kiki roles.

## Behavior

When updating a project, Kiki reads `.agentic/kiki/routing.json` and merges it over `DEFAULT_ROUTING_TABLE`.

- Default entries provide models for roles missing from the project table.
- Existing project agent entries take precedence over defaults.
- Project-only agent entries remain in the routing table. The existing `kiki routing` validation continues to report them when no corresponding generated agent exists.
- The routing sync that follows update uses the merged table, so regenerated agent frontmatter receives the project-selected models.

## Implementation

`update.ts` will load the project routing table, merge it with `DEFAULT_ROUTING_TABLE` through the existing `mergeRoutingTables` helper, and write the result to the project routing file. No changes are needed to the routing sync command.

## Testing

Add an update-command regression test that creates a project routing table with a custom agent model and a missing default agent role. After `update`, assert that the custom model remains and the missing role is populated from `DEFAULT_ROUTING_TABLE`.
