import * as fs from 'fs';
import * as readline from 'readline';

export interface FileHeader {
  signature: string;
  headerSize: number;
  fileSize: number;
  uncompressedSize: number;
  objectCount: number;
  startTimestamp: number;
  stopTimestamp: number;
}

export interface CANMessage {
  relativeTimestamp: number;
  absoluteTimestamp: number;
  arbitrationId: number;
  isExtendedId: boolean;
  isRemoteFrame: boolean;
  isRx: boolean;
  dlc: number;
  isErrorFrame?: boolean;
  data: Buffer;
  channel: number;
  isFd?: boolean;
  bitrateSwitch?: boolean;
  errorStateIndicator?: boolean;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const HEX_BYTE_RE = /^[0-9a-fA-F]{1,2}$/;

export function canFdDlcToLength(dlc: number): number {
  const map = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64];
  return map[dlc & 0x0f] ?? 0;
}

export function parseAscDate(line: string): number | null {
  const m = line.match(
    /^date\s+\w+\s+(\w+)\s+(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?\s+(am|pm)\s+(\d{4})$/i
  );
  if (!m) return null;

  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;

  let hour = parseInt(m[3], 10);
  const ampm = m[7].toLowerCase();
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;

  const millisecond = parseInt((m[6] ?? '0').padEnd(3, '0'), 10);
  return new Date(
    parseInt(m[8], 10),
    month,
    parseInt(m[2], 10),
    hour,
    parseInt(m[4], 10),
    parseInt(m[5], 10),
    millisecond
  ).getTime() / 1000;
}

interface ParseContext {
  base: 'hex' | 'dec';
  measurementStart: number;
  firstRawTimestamp?: number;
}

export class ASCReader {
  private header: FileHeader | null = null;
  private messages: CANMessage[] = [];
  private parseErrors: string[] = [];
  private ignoredLines = 0;

  constructor(private readonly filePath: string) {}

  async parse(): Promise<CANMessage[]> {
    const stat = fs.statSync(this.filePath);
    const ctx: ParseContext = {
      base: 'hex',
      measurementStart: 0,
    };

    const rl = readline.createInterface({
      input: fs.createReadStream(this.filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      this.parseLine(line, ctx);
    }

    if (this.ignoredLines > 0) {
      this.parseErrors.push(`Ignored ${this.ignoredLines.toLocaleString()} non-CAN/CAN FD ASC line(s)`);
    }

    const start = this.messages[0]?.absoluteTimestamp ?? ctx.measurementStart;
    const stop = this.messages.at(-1)?.absoluteTimestamp ?? start;
    this.header = {
      signature: 'ASC',
      headerSize: 0,
      fileSize: stat.size,
      uncompressedSize: stat.size,
      objectCount: this.messages.length,
      startTimestamp: start,
      stopTimestamp: stop,
    };

    return this.messages;
  }

  private parseLine(line: string, ctx: ParseContext): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.startsWith('//')) return;

    if (/^date\s+/i.test(trimmed)) {
      const parsed = parseAscDate(trimmed);
      if (parsed !== null) ctx.measurementStart = parsed;
      return;
    }

    if (/^base\s+/i.test(trimmed)) {
      const parts = trimmed.toLowerCase().split(/\s+/);
      if (parts[1] === 'dec') ctx.base = 'dec';
      else if (parts[1] === 'hex') ctx.base = 'hex';
      return;
    }

    if (/^(internal events logged|begin triggerblock|end triggerblock)/i.test(trimmed)) return;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 2 || !/^\d+(?:\.\d+)?$/.test(parts[0])) {
      this.ignoredLines += 1;
      return;
    }

    const rawTimestamp = parseFloat(parts[0]);

    const msg = parts[1].toUpperCase() === 'CANFD'
      ? parseCanFdParts(parts, ctx, rawTimestamp)
      : parseClassicCanParts(parts, ctx, rawTimestamp);

    if (msg) this.messages.push(msg);
    else this.ignoredLines += 1;
  }

  getHeader(): FileHeader | null {
    return this.header;
  }

  getMessages(): CANMessage[] {
    return this.messages;
  }

  getErrors(): string[] {
    return this.parseErrors;
  }
}

function parseCanFdParts(parts: string[], ctx: ParseContext, rawTimestamp: number): CANMessage | null {
  if (parts.length < 10) return null;

  const channel = parseInt(parts[2], 10);
  const dir = parts[3];
  const id = parseArbitrationId(parts[4], ctx.base);
  if (!Number.isFinite(channel) || !dir || id === null) return null;

  let idx = 5;
  while (idx < parts.length - 4 && !isBit(parts[idx])) idx += 1;
  if (idx + 4 > parts.length) return null;

  const brs = parts[idx] === '1';
  const esi = parts[idx + 1] === '1';
  const dlc = parseDlc(parts[idx + 2]);
  const dataLength = parseInt(parts[idx + 3], 10);
  if (!Number.isFinite(dlc) || !Number.isFinite(dataLength)) return null;

  const dataStart = idx + 4;
  const fallbackLength = canFdDlcToLength(dlc);
  const requestedLength = dataLength > 0 ? dataLength : fallbackLength;
  const bytes = readDataBytes(parts, dataStart, Math.min(requestedLength, 64));

  return makeMessage(ctx, rawTimestamp, {
    arbitrationId: id.id,
    isExtendedId: id.extended,
    isRemoteFrame: false,
    isRx: dir.toUpperCase() !== 'TX',
    dlc,
    data: bytes,
    channel: channel > 0 ? channel - 1 : 0,
    isFd: true,
    bitrateSwitch: brs,
    errorStateIndicator: esi,
  });
}

function parseClassicCanParts(parts: string[], ctx: ParseContext, rawTimestamp: number): CANMessage | null {
  if (parts.length < 5) return null;

  const channel = parseInt(parts[1], 10);
  const id = parseArbitrationId(parts[2], ctx.base);
  const dir = parts[3];
  if (!Number.isFinite(channel) || id === null) return null;

  const type = parts[4].toLowerCase();
  if (type === 'errorframe') {
    return makeMessage(ctx, rawTimestamp, {
      arbitrationId: id.id,
      isExtendedId: id.extended,
      isRemoteFrame: false,
      isRx: dir.toUpperCase() !== 'TX',
      dlc: 0,
      data: Buffer.alloc(0),
      channel: channel > 0 ? channel - 1 : 0,
      isErrorFrame: true,
    });
  }

  if (type !== 'd' && type !== 'r') return null;

  const dlc = parseInt(parts[5] ?? '0', ctx.base === 'hex' ? 16 : 10);
  if (!Number.isFinite(dlc)) return null;

  return makeMessage(ctx, rawTimestamp, {
    arbitrationId: id.id,
    isExtendedId: id.extended,
    isRemoteFrame: type === 'r',
    isRx: dir.toUpperCase() !== 'TX',
    dlc,
    data: type === 'r' ? Buffer.alloc(0) : readDataBytes(parts, 6, Math.min(dlc, 8)),
    channel: channel > 0 ? channel - 1 : 0,
  });
}

function makeMessage(ctx: ParseContext, rawTimestamp: number, msg: Omit<CANMessage, 'relativeTimestamp' | 'absoluteTimestamp'>): CANMessage {
  if (ctx.firstRawTimestamp === undefined) ctx.firstRawTimestamp = rawTimestamp;
  const firstRaw = ctx.firstRawTimestamp;
  return {
    relativeTimestamp: rawTimestamp - firstRaw,
    absoluteTimestamp: ctx.measurementStart + rawTimestamp,
    ...msg,
  };
}

function parseArbitrationId(raw: string, base: 'hex' | 'dec'): { id: number; extended: boolean } | null {
  const extended = /x$/i.test(raw);
  const clean = raw.replace(/x$/i, '');
  const id = parseInt(clean, base === 'hex' ? 16 : 10);
  if (!Number.isFinite(id)) return null;
  return { id: id & 0x1fffffff, extended };
}

function parseDlc(raw: string): number {
  return parseInt(raw, 16);
}

function isBit(raw: string): boolean {
  return raw === '0' || raw === '1';
}

function readDataBytes(parts: string[], start: number, count: number): Buffer {
  const values: number[] = [];
  for (let i = start; i < parts.length && values.length < count; i++) {
    if (!HEX_BYTE_RE.test(parts[i])) break;
    values.push(parseInt(parts[i], 16) & 0xff);
  }
  return Buffer.from(values);
}
