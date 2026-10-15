# Congressional event-catalog category audit

The congressional source was read using a transaction marked read-only. The import
script targets only the new provincial project and inserts 412 events as Pending.
No source rows, results, or accounts are changed.

Most source rows place the event type (Individual/Team) in `sport_category`
and Boys/Girls/Mixed in `event_category`. The provincial schema expects the
opposite, so the import normalizes those 384 rows. Eight Weightlifting rows
already use the provincial order and are kept as-is.

For the 20 rows below, both source fields contain Boys/Girls; the source has no
event type to copy. The proposed type is inferred from the title/sport: relay
and Sepak Takraw are Team; walkathon and hurdles are Individual.

| Source ID | Event title | Sport | Provincial category | Proposed type |
| ---: | --- | --- | --- | --- |
| 40 | Walkathon (Boys) | Athletics | Boys | Individual |
| 53 | 400m Hurdles (Boys) | Athletics | Boys | Individual |
| 80 | 4x400m Relay (Boys) | Athletics | Boys | Team |
| 86 | Walkathon (Girls) | Athletics | Girls | Individual |
| 87 | 4x100m Relay (Girls) | Athletics | Girls | Team |
| 88 | 4x100m Relay (Girls) | Athletics | Girls | Team |
| 89 | 4x400m Relay (Boys) | Athletics | Boys | Team |
| 90 | 400m Hurdles (Girls) | Athletics | Girls | Individual |
| 91 | 4x400m Relay (Girls) | Athletics | Girls | Team |
| 92 | 4x100m Relay (Boys) | Athletics | Boys | Team |
| 93 | 400m Hurdles (Girls) | Athletics | Girls | Individual |
| 95 | 400m Hurdles (Boys) | Athletics | Boys | Individual |
| 96 | 4x100m Relay (Boys) | Athletics | Boys | Team |
| 99 | 100m Hurdles (Girls) | Athletics | Girls | Individual |
| 100 | 110m Hurdles (Boys) | Athletics | Boys | Individual |
| 101 | 110m Hurdles (Boys) | Athletics | Boys | Individual |
| 102 | 4x400m Relay (Girls) | Athletics | Girls | Team |
| 103 | 100m Hurdles (Girls) | Athletics | Girls | Individual |
| 180 | Sepak Takraw Boys | Sepak Takraw | Boys | Team |
| 181 | Sepak Takraw Girls | Sepak Takraw | Girls | Team |

The following titles say “Team Event,” while their source type is Individual.
The import preserves the source type rather than silently changing it; review
these after import if needed.

| Source ID | Event title | Sport | Preserved type |
| ---: | --- | --- | --- |
| 348 | Team Event 70m (Girls) | Archery | Individual |
| 354 | Team Event 70m (Boys) | Archery | Individual |
| 355 | Mixed Team Event (70m) | Archery | Individual |
| 360 | Team Event 70m (Girls) | Archery | Individual |
| 365 | Team Event 70m (Boys) | Archery | Individual |
| 366 | Mixed Team Event | Archery | Individual |

Four source titles say “Men's Artistic Gymnastics” but are categorized Girls
(source IDs 166, 415, 416, and 417). The import preserves the source category;
correct these in the provincial Events screen if the congressional data was
wrong. No congressional record is changed.

