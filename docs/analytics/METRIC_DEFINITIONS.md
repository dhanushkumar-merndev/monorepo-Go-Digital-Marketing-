# Analytics Metric Definitions

All date cohorts use inclusive `from`/`to` calendar dates converted to half-open UTC bounds in the
client organization's IANA timezone. Counts are server aggregates over records visible to the
effective authorization context. A current-period count is not a lifetime snapshot unless its
definition explicitly says so.

| Code                        | Definition                                                                       | Time field           | Unit          | Direction | Drilldown          |
| --------------------------- | -------------------------------------------------------------------------------- | -------------------- | ------------- | --------- | ------------------ |
| `lead_count`                | Distinct Lead opportunities captured in the period                               | `captured_at`        | count         | neutral   | authorized records |
| `active_pipeline`           | Period Lead cohort currently in a non-terminal sales state                       | `captured_at`        | count         | neutral   | authorized records |
| `booking_count`             | Bookings created and visible in the period                                       | `created_at`         | count         | higher    | authorized records |
| `lead_to_booking_rate`      | Period bookings / period Leads × 100; emitted only when both facts are permitted | mixed cohort         | percent       | higher    | authorized records |
| `delivered_count`           | Delivery jobs in `DELIVERED`, scheduled in the period                            | `scheduled_for`      | count         | higher    | authorized records |
| `call_count`                | Canonical calls created in the period                                            | `created_at`         | count         | neutral   | authorized records |
| `call_connection_rate`      | `COMPLETED` calls / all calls × 100                                              | `created_at`         | percent       | higher    | authorized records |
| `test_ride_count`           | Test-ride jobs scheduled in the period                                           | `scheduled_start_at` | count         | neutral   | authorized records |
| `test_ride_completion_rate` | Completed rides / all scheduled rides × 100                                      | `scheduled_start_at` | percent       | higher    | authorized records |
| `available_inventory`       | Current physical units in `AVAILABLE`                                            | current snapshot     | count         | neutral   | authorized records |
| `registration_backlog`      | Period registration cases not closed                                             | `created_at`         | count         | lower     | authorized records |
| `finance_applications`      | Finance cases created and permitted in the period                                | `created_at`         | count         | neutral   | authorized records |
| `finance_approval_rate`     | Approved or disbursed finance cases / applications × 100                         | `created_at`         | percent       | higher    | authorized records |
| `insurance_cases`           | Insurance cases created and permitted in the period                              | `created_at`         | count         | neutral   | authorized records |
| `insurance_issuance_rate`   | Policy-generated cases / insurance cases × 100                                   | `created_at`         | percent       | higher    | authorized records |
| `active_users`              | Active client memberships at response generation                                 | current snapshot     | count         | neutral   | none               |
| `platform_*`                | Agency aggregates grouped by client with no customer/Lead row payload            | domain time field    | count/percent | stated    | aggregate only     |

Count comparisons are `(current - prior) / prior × 100`; a zero prior denominator yields an explicit
unavailable comparison. Rate comparisons are current minus prior percentage points. Funnels are
status composition of the selected Lead cohort, not proof every Lead traversed each status. Revenue,
ROAS/CPL, NPS, targets, complaints, accessories, used-car valuation and quotation conversion remain
unavailable until canonical source facts and attribution exist; they are never inferred.
