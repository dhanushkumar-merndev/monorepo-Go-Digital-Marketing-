# Role Analytics Matrix

This matrix covers the 12 canonical roles in `canonical_role_code`. All drilldowns re-run backend
authorization. “Focused” means the mobile home shows up to four available metrics plus attention.

| Role                              | Overview / analytics                                                                                                         | Effective scope             | Drilldown                                | Mobile      | Status |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------- | ----------- | ------ |
| `AGENCY_ADMIN`                    | Client counts, active clients, client Leads/bookings/deliveries, conversion, users, branches, modules and integration health | agency client aggregates    | aggregate client comparison only         | web-focused | PASS   |
| `CLIENT_ADMIN`                    | Active users plus permitted Leads, funnel/source/trend, calls, rides, inventory, commercial, delivery and registration       | tenant                      | records permitted by module permission   | focused     | PASS   |
| `MANAGER`                         | Same domain set constrained by branch/team configuration; attention and comparisons                                          | authorized tenant/branch    | authorized records                       | focused     | PASS   |
| `SALES_MANAGER`                   | Pipeline, funnel, source, calls, rides, bookings, delivery and registration comparisons                                      | authorized branch/team      | authorized records                       | focused     | PASS   |
| `TEAM_MANAGER`                    | Leads, funnel/source, calls, rides, commercial and operations for managed teams                                              | managed teams               | managed-team records                     | focused     | PASS   |
| `TELECALLER`                      | own Leads, active pipeline, calls, connection rate, SLA/follow-up attention and Lead trend/funnel                            | own assignment              | own records                              | focused     | PASS   |
| `SALESPERSON`                     | own Leads/pipeline, rides, bookings, Lead-to-booking conversion and source/model trend                                       | own assignment              | own records                              | focused     | PASS   |
| `TEST_RIDE_EXECUTIVE`             | assigned rides, completion rate and status distribution                                                                      | assigned jobs               | assigned ride records                    | focused     | PASS   |
| `INVENTORY_EXECUTIVE`             | available stock and authorized inventory distribution                                                                        | branch inventory scope      | VIN/unit only with inventory permissions | focused     | PASS   |
| `BILLING_DOCUMENTATION_EXECUTIVE` | bookings, finance applications/approval, insurance issuance and registration backlog where permitted                         | authorized commercial scope | permission-filtered commercial records   | focused     | PASS   |
| `DELIVERY_EXECUTIVE`              | assigned delivered count, delivery status and exceptions                                                                     | assigned delivery jobs      | assigned jobs                            | focused     | PASS   |
| `RC_REGISTRATION_EXECUTIVE`       | registration backlog/status and reminder attention where permitted                                                           | assigned registration scope | assigned cases                           | focused     | PASS   |

The PRD names Business Owner, GM/Sales Head, Showroom Manager and specialized departments as product
personas. The current repository maps those capabilities to `CLIENT_ADMIN`, `MANAGER`,
`SALES_MANAGER`, `TEAM_MANAGER` or `BILLING_DOCUMENTATION_EXECUTIVE`; no unmodeled role code was
invented. Used-car/exchange, accessories and CRM/complaints get no fabricated dashboard because the
current schema does not provide complete canonical workflows.
