# ASC Viewer CAN FD

View and analyze **Vector ASC** CAN and CAN FD log files directly in VS Code.

ASC Viewer CAN FD opens `.asc` files as a structured, filterable table with virtual scrolling, UTC timestamps, DBC signal decoding, detail inspection, and copy/export actions.

## Features

### Automatic file association

Opening any `.asc` file in VS Code launches the viewer automatically.

### Large file support

The extension parses ASC files on the extension host and renders only visible rows in the webview. This keeps scrolling responsive for large traces.

### CAN and CAN FD parsing

Supported Vector ASC rows include:

- CAN FD rows with BRS/ESI flags, DLC, data length, and up to 64 data bytes
- CAN FD rows with or without symbolic message names
- Classic CAN data frames
- Classic CAN extended IDs with `x` suffix
- Classic CAN remote frames
- Error frames

Non-CAN/CAN FD ASC lines are ignored and summarized as parse warnings.

### Time columns

- **Time(s)** starts at `0.0000000` for the first parsed message.
- **UTC** is calculated from the ASC header `date` line interpreted in the local timezone plus the raw ASC timestamp.

### DBC signal decoding

Click the **⊕ DBC** button to import a `.dbc` file. Matching rows show the DBC message name, and the detail panel shows decoded signals with raw values, physical values, units, comments, and value-table labels.

### Filtering and sorting

Filter by arbitration ID, direction, message type, and channel. Sort by index, Time(s), UTC, Arbitration ID, Type, Direction, Channel, or DLC.

### Columns and selection

Resize, reorder, show, or hide columns from the **⊞ Columns** menu. Multi-select rows with Ctrl/Cmd+Click or Shift+Click.

### Right-click context menu

Right-click any row to add its ID to the filter, open details, colorize rows, group rows, copy one row, copy the arbitration ID, copy data bytes, or copy the selection as CSV.

### Detail panel

The detail panel shows message metadata, UTC time, byte grid, hex/decimal/binary byte table, flags, and decoded DBC signals.

---

## Requirements

- VS Code **1.109.0** or later
- No native modules

---

## Usage

1. Open a `.asc` file via **File → Open File** or by double-clicking it in the Explorer.
2. ASC Viewer opens automatically as a custom editor.
3. Use filters and sorting to inspect messages.
4. Click a row to inspect bytes and decoded DBC signals.
5. Right-click rows for copy, filter, colorize, and CSV actions.

You can also open a file explicitly from the Command Palette:

```text
ASC: Open File
```

---

## Release Notes

### 0.1.0

Initial release. Vector ASC CAN/CAN FD viewer with virtual scrolling, filtering, sorting, UTC timestamp column, DBC signal decoding, detail panel, and CSV/copy actions.

---

## About ASC

ASC is a text log format commonly produced by Vector CANalyzer, CANoe, and related automotive network tools. This extension focuses on CAN and CAN FD message rows.

---

## License

MIT
