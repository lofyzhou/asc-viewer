# Changelog

All notable changes to the **ASC Viewer CAN FD** extension are documented here.

## [0.1.0] — 2026-05-25

### Added

- Custom editor for `.asc` Vector ASC files.
- CAN FD parsing with BRS/ESI, DLC, decimal data length, optional symbolic names, and up to 64 payload bytes.
- Classic CAN parsing for data frames, extended IDs, remote frames, and error frames.
- Time(s) column normalized to the first parsed message plus a UTC column derived from the ASC header date.
- Virtual scrolling table with filtering, sorting, resizable/reorderable columns, column visibility toggle, multi-select, detail panel, and right-click copy/CSV actions.
- DBC import and signal decoding.
