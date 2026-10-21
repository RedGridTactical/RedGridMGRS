# Report worksheet references

Checked 17 October 2026. A worksheet is a user-entered draft; copying it does not
transmit, approve or file a report. Current agency/unit procedures govern use.

- **9-line MEDEVAC:** Army ATP 4-02.2, 12 July 2019, Appendix C, Table C-1,
  printed pages C-1–C-3. [Official Army PDF](https://armypubs.army.mil/epubs/DR_pubs/DR_a/pdf/web/ARN17834_ATP%204-02x2%20FINAL%20WEB.pdf).
  The app identifies this specific edition, without claiming it is the newest
  edition or an approved local protocol. Lines 6 and 9 use separate peacetime and
  wartime fields. Enter priority as assessed by qualified personnel; the app
  does not assign clinical precedence. References stay visible beside fields
  rather than being clipped inside placeholders. Values from the other context
  are retained in the local draft but excluded from the selected export.
- **ICS 201 adapted summary:** [FEMA ICS 201 v3](https://training.fema.gov/EMIWeb/IS/ICSResource/assets/ICS%20Forms/ICS%20Form%20201,%20Incident%20Briefing%20%28v3%29.pdf).
  The existing compact summary omits official blocks, including the map/sketch,
  organization and detailed resource/action tables. It is labeled an adaptation
  in the screen and copied output. Inserted time includes the device's local UTC
  offset; it is a reference, not an assertion of the incident time.
- **SPOT simplified note:** the existing five-field note does not reproduce the
  full Army SPOTREP S055 shown in ATP 6-01.1, 11 March 2024, Appendix A, Figure A-2.
  [Official Army PDF](https://rdl.train.army.mil/catalog-ws/view/100.ATSC/1FEAA5E9-777C-4AFE-9A7C-F6BFCEB437F0-1425991453004/ATP6_01x1.pdf).
- **CASEVAC working note:** distinct from a patient handover or approved casualty
  care record. [JTS Joint En Route Care Guidelines FY26](https://jts.health.mil/assets/docs/cpgs/CoERCCC%20Guidelines%20FY26.pdf).
- **Custom worksheets:** no source-format parity is asserted for the existing
  ANGUS/CFF worksheet. Its operational fields were not expanded by this correction.

- **ICS 214 activity log:** [FEMA ICS 214 v3.1](https://training.fema.gov/EMIWeb/IS/ICSResource/assets/ICS%20Forms/ICS%20Form%20214,%20Activity%20Log%20%28v3.1%29.pdf).
  The incident workspace maps the eight form blocks and assigned resources to
  a local activity log. Observed event time has an explicit UTC offset; entry
  and correction timestamps remain separate. Exports are unsigned worksheets,
  with blank signature/preparation-time fields and a separate Red Grid annex
  for location provenance and correction history. This is not the official
  fillable PDF, agency acceptance, certified evidence storage or submission.

Report drafts and unfinished incident editors save in on-device SQLite with
transactional writes, checksums and an explicit previous-save recovery path.
Wait for Saved on this device before closing. A failed save is visible; a
portable incident backup also preserves the current unfinished editor. Unknown
or unreadable records are never silently replaced with empty defaults. Local
checksums detect corruption, not malicious alteration or evidentiary validity.
Back up important records before uninstalling or clearing app data.

Incident creation/editing requires Pro. Saved records, correction history and
exports remain accessible after Pro expires. JSON import makes a new local copy;
it does not merge, synchronize or send data to another user. PDF exports have an
explicit size limit; a full JSON backup is available without truncation.

No new network service or agency-system integration is included. A device fix
records the device's location, datum, timestamp and available accuracy; it does
not establish the subject/pickup location. Map/manual references have unverified
accuracy. Typed worksheet edits remove device-source annotation. Shared files
contain local incident data; users choose a destination in the system share
sheet. Files may remain in the OS-managed export cache.

Before a professional-use release, a qualified reviewer should confirm medical
terminology, source currency and the intended unit protocol. Software regression
tests and translations are not clinical or agency certification.
