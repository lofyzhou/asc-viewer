import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { ASCReader, canFdDlcToLength, parseAscDate } from '../asc-parser';
import { toWire } from '../asc-host';
import { decodeSignal, DbcSignal } from '../dbc-parser';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

suite('ASC parser', () => {
	test('parses ASC header date with lowercase pm and milliseconds', () => {
		const ts = parseAscDate('date Fri May 22 04:37:30.702 pm 2026');
		const expected = new Date(2026, 4, 22, 16, 37, 30, 702).getTime() / 1000;
		assert.strictEqual(ts, expected);
	});

	test('maps CAN FD DLC values to payload lengths', () => {
		const expected = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 16, 20, 24, 32, 48, 64];
		expected.forEach((length, dlc) => assert.strictEqual(canFdDlcToLength(dlc), length));
	});

	test('parses CAN FD rows with and without symbolic names', async () => {
		const messages = await parseAscFixture([
			'date Fri May 22 04:37:30.702 pm 2026',
			'base hex  timestamps absolute',
			'internal events logged',
			'1206.390138 CANFD   2 Rx        205                                   1 0 8  8 00 00 00 00 00 00 00 00   107056  140   303000',
			'1206.400173 CANFD   2 Rx        2fa                                   1 0 a 16 00 00 00 00 00 00 00 00 1e 07 03 20 1e 07 00 20   145048  216   303000',
			'1206.415391 CANFD   2 Rx        4bb  FLZCU_26                         1 0 d 32 00 00 fe fe fe fe fe 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 40 00 00 00 00 00 00 00 00 00   220552',
			'1206.455720 CANFD   2 Rx        4f4                                   1 0 e 48 00 00 04 34 30 00 00 00 00 00 00 00 02 02 02 02 00 00 f8 3e 00 00 00 00 00 00 00 00 10 00 00 00 00 00 00 27 4f 27 4f 00 00 00 00 66 00 00 00 00',
			'1206.400668 CANFD   2 Rx        397  FLZCU_16                         1 0 f 64 00 00 00 00 00 00 00 00 00 00 00 fe 00 00 00 00 00 00 00 00 00 ff f8 00 00 00 ff f8 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 4e 20 4e 20 00',
		]);

		assert.strictEqual(messages.length, 5);
		assert.strictEqual(messages[0].relativeTimestamp.toFixed(7), '0.0000000');
		assert.strictEqual(messages[1].relativeTimestamp.toFixed(7), '0.0100350');
		assert.strictEqual(messages[0].data.length, 8);
		assert.strictEqual(messages[1].data.length, 16);
		assert.strictEqual(messages[2].data.length, 32);
		assert.strictEqual(messages[3].data.length, 48);
		assert.strictEqual(messages[4].data.length, 64);
		assert.strictEqual(toWire(messages[1], 1).data, '00 00 00 00 00 00 00 00 1E 07 03 20 1E 07 00 20');
	});

	test('parses classic CAN rows, extended IDs, remote frames, and error frames', async () => {
		const messages = await parseAscFixture([
			'date Fri May 22 04:37:30.702 pm 2026',
			'base hex  timestamps absolute',
			'0.100000 1 123 Rx d 8 11 22 33 44 55 66 77 88',
			'0.200000 2 1abcdefx Tx d 2 aa bb',
			'0.300000 1 456 Rx r 8',
			'0.400000 1 789 Rx ErrorFrame',
		]);

		assert.strictEqual(messages.length, 4);
		assert.strictEqual(messages[0].arbitrationId, 0x123);
		assert.strictEqual(messages[1].arbitrationId, 0x1abcdef);
		assert.strictEqual(messages[1].isExtendedId, true);
		assert.strictEqual(messages[1].isRx, false);
		assert.strictEqual(messages[2].isRemoteFrame, true);
		assert.strictEqual(messages[3].isErrorFrame, true);
	});

	test('keeps ASC data as Buffer for DBC decoding', async () => {
		const [message] = await parseAscFixture([
			'base hex  timestamps absolute',
			'0.000000 CANFD 1 Rx 100 1 0 8 8 34 12 00 00 00 00 00 00',
		]);
		const signal: DbcSignal = {
			name: 'Speed',
			startBit: 0,
			bitLength: 16,
			byteOrder: 'intel',
			signed: false,
			factor: 1,
			offset: 0,
			unit: '',
		};

		const decoded = decodeSignal(message.data, signal);
		assert.strictEqual(decoded.raw, 0x1234);
	});
});

async function parseAscFixture(lines: string[]) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asc-viewer-test-'));
	const file = path.join(dir, 'trace.asc');
	fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
	try {
		const reader = new ASCReader(file);
		return await reader.parse();
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
}
