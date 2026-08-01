# Requirements-to-Evidence Matrix

This is the traceability source for requirements in `02_REQUIREMENTS.md`.
The first table closes the GOAL_07 baseline; the later GOAL_08 table records
accepted but not-yet-implemented quality requirements. Rows group requirements
only when they share the same implementation owner and verification surface.
Every requirement ID remains explicit so omissions can be checked mechanically.

Status meanings:

- **Automated**: implementation and regression evidence are checked by the suite.
- **Automated + observed**: automation is supplemented by recorded browser,
  installed-runtime, or live-boundary observation.
- **Manual pending**: implementation and automation exist, but a requirement-
  linked manual scenario remains open.
- **Planned**: requirement and proof owner are accepted, but no implementation
  pass is claimed.

| Requirement IDs | Owner / implementation evidence | Verification evidence | Status |
| --- | --- | --- | --- |
| FR-REG-001, FR-REG-002, FR-REG-003, FR-REG-004, FR-REG-005, FR-REG-006, FR-REG-007, FR-REG-008, FR-REG-009, FR-REG-010 | Project registry/store, workspace store, migration v3 | project-registry, workspace-association, managed-restart tests | Automated |
| FR-DISC-001, FR-DISC-002, FR-DISC-003, FR-DISC-004, FR-DISC-005, FR-DISC-006, FR-DISC-007, FR-DISC-008 | Project discovery, local project routes, folder picker | project-discovery, folder-picker, admin-server tests | Automated |
| FR-UI-001, FR-UI-002, FR-UI-003, FR-UI-004, FR-UI-005, FR-UI-006, FR-UI-007, FR-UI-008, FR-UI-009 | Admin server, dashboard API/screens, CLI | admin/dashboard/CLI tests; GOAL_02/06 browser records | Automated + observed |
| FR-MCP-001, FR-MCP-002, FR-MCP-003, FR-MCP-004, FR-MCP-005, FR-MCP-006, FR-MCP-007, FR-MCP-008, FR-MCP-009, FR-MCP-010, FR-MCP-011 | Project MCP handlers, server, project actions, workspace app | project-mcp/server/action tests; MWU-07.01/07.05/07.07 | Automated + observed |
| FR-POL-001, FR-POL-002, FR-POL-003, FR-POL-004, FR-POL-005, FR-POL-006, FR-POL-007, FR-POL-008, FR-POL-009, FR-POL-010, FR-POL-011 | Central project policy and file/patch/artifact/shell/agent guards | `npm run test:policy`; GOAL_04 record | Automated |
| FR-AGT-001, FR-AGT-002, FR-AGT-003, FR-AGT-004, FR-AGT-005, FR-AGT-006, FR-AGT-007, FR-AGT-008, FR-AGT-009, FR-AGT-010, FR-AGT-011, FR-AGT-012 | LocalAgentService, MCP/CLI adapters, runtime/store/handoff, review checkpoints | local-agent suites; real Codex task/continuation record; MWU-07.08 signed-in host handoff/result/repository review | Automated + observed |
| FR-OPS-001, FR-OPS-002, FR-OPS-003, FR-OPS-004, FR-OPS-005, FR-OPS-006, FR-OPS-007, FR-OPS-008 | Operation contracts/store/run service and projectors | operation contract/store/run/projector tests | Automated |
| FR-OPS-009, FR-OPS-010, FR-OPS-011, FR-OPS-012, FR-OPS-013, FR-OPS-014, FR-OPS-015, FR-OPS-016 | Operation routes, Runs UI, canonical stop, reconciliation | route/stop/admin/dashboard tests; MWU-07.02–07.04 and MWU-07.10–07.12 | Automated + observed |
| FR-VIS-001, FR-VIS-002, FR-VIS-003, FR-VIS-004, FR-VIS-005, FR-VIS-006, FR-VIS-007, FR-VIS-008, FR-VIS-009, FR-VIS-010, FR-VIS-011, FR-VIS-012 | Dashboard shell and four screens on React/Vite/CSS | dashboard screen/shell tests; MWU-07.15/07.16 production-browser walkthroughs | Automated + observed |
| FR-CLI-001, FR-CLI-002, FR-CLI-003, FR-CLI-004, FR-CLI-005, FR-CLI-006 | CLI, config, user-config migration/defaulting | CLI/config tests; MWU-07.05 | Automated |
| FR-UPD-001, FR-UPD-002, FR-UPD-003, FR-UPD-004, FR-UPD-005, FR-UPD-006, FR-UPD-007, FR-UPD-008, NFR-REL-007, NFR-UX-007 | canonical Windows setup Update mode; injected MCP system-update controller; bounded sanitized status | system-update MCP/controller tests; Windows Git/dirty/branch/preflight-order/rollback fault tests; installed no-console update/status and health observation | Automated + observed |
| NFR-SEC-001, NFR-SEC-002, NFR-SEC-003, NFR-SEC-004, NFR-SEC-005, NFR-SEC-006, NFR-SEC-007 | Split listeners, dashboard auth/CSRF, path validation, redaction | admin/server/security/policy tests; MWU-07.02/07.03 and fixed Cloudflare ingress boundary proof | Automated + observed |
| NFR-COMP-001, NFR-COMP-002 | Additive MCP results and optional Apps metadata | project-mcp-server test; MWU-07.01/07.05 | Automated |
| NFR-REL-001, NFR-REL-002, NFR-REL-003, NFR-REL-004, NFR-REL-005, NFR-REL-006 | Migrations, bounded discovery/events/SSE, isolated projectors, reconciliation | migration/discovery/operation/admin tests; MWU-07.04 restart proof and MWU-07.10 reconnect observation | Automated + observed |
| NFR-PERF-001, NFR-PERF-002, NFR-PERF-003, NFR-PERF-004 | SQLite listing, bounded store/output, lazy diff/detail routes | registry/store/projector/diff/dashboard API tests | Automated |
| NFR-UX-001, NFR-UX-002, NFR-UX-003, NFR-UX-004, NFR-UX-005, NFR-UX-006 | Project picker/cards and semantic dashboard states | action/card/screen tests; MWU-07.07, MWU-07.12, MWU-07.15, and MWU-07.16 observations | Automated + observed |
| NFR-TEST-001, NFR-TEST-002 | Dependency-injected services plus explicit manual surfaces | isolated suite; MWU-07.08/07.10 real Codex records; MWU-07.11 Windows process-tree stop | Automated + observed |
| NFR-MAINT-001, NFR-MAINT-002 | Focused modules, pure shared display helpers, separate UI roots | typecheck, build, diff review, architecture decisions | Automated |

## GOAL_07 acceptance status

This matrix closes AC-07.1 at the requirement-to-implementation/evidence level.
All 124 requirement IDs retain an owner and evidence surface, and no
requirement row remains manual-pending after the MWU-07.07 through MWU-07.16
observations. MWU-07.18 additionally records direct completion of release-level
manual scenarios A, B, D, and E. Final convergence confirms all 17 acceptance
criteria and mandatory release gates pass; GOAL_07 is DONE under
`07_TEST_AND_ACCEPTANCE_PLAN.md` and `09_PROJECT_STATE.md`.

The additive FR-UPD/NFR rows are post-GOAL_07 operational maintenance and do
not change the historical 124-ID closure count.

## GOAL_08 planned traceability

GOAL_08 is not included in the closed 124-ID GOAL_07 count. The following
additive IDs have accepted implementation and proof owners but remain Planned
until the corresponding Micro Work Units execute.

| Requirement IDs | Planned owner / implementation surface | Required evidence | Status |
| --- | --- | --- | --- |
| FR-PAR-001, FR-PAR-002, FR-PAR-003, FR-PAR-004, NFR-PAR-008, NFR-PAR-010 | parity manifests/results; explicit local-agent profiles; server/tool metadata | P01-P08 current baseline and same-snapshot candidate comparison | Planned |
| FR-PAR-005, FR-PAR-006, FR-PAR-007, NFR-PAR-002, NFR-PAR-004, NFR-PAR-005 | workspace result serialization; repository-diff/review fingerprint helper; bounded root manifest reader | clean/dirty/detached/non-Git/missing/oversized fixtures and no-mutation proof | Planned |
| FR-PAR-008, FR-PAR-009, FR-PAR-010, FR-PAR-011, FR-PAR-012, NFR-PAR-003, NFR-PAR-006, NFR-PAR-007, NFR-PAR-009 | review checkpoints, `show_changes`, process verification projector, operation evidence/store | model-visible bounds, same-workspace rejection, legacy unknown, fresh/edit/stale/reverify/fresh | Planned |
| FR-PAR-013, FR-PAR-014, FR-PAR-015, NFR-PAR-005, NFR-PAR-006, NFR-PAR-009 | Codex SDK runtime, LocalAgentService/store, local-agent operation/MCP/dashboard projections | structured completed/question/error, persistence, restart, same-thread continuation, provider compatibility | Planned |
| FR-PAR-016, FR-PAR-017, FR-PAR-018, NFR-PAR-001, NFR-PAR-005, NFR-PAR-009 | existing status MCP tool and `LocalAgentService.waitForStatus` | immediate/terminal/question/error/stop/timeout/plain-MCP and no-duplicate-worker proof | Planned |
