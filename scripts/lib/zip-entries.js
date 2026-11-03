'use strict';
// Reads the text of every file inside a .zip, with no dependencies, so the key
// inventory can see into downloads/ (git grep skips binaries). Handles the two
// methods Compress-Archive writes: stored (0) and deflate (8).
const fs = require('node:fs');
const zlib = require('node:zlib');

function zipEntries(file) {
    const buf = fs.readFileSync(file);
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocd < 0) throw new Error(`${file} is not a zip`);
    const count = buf.readUInt16LE(eocd + 10);
    let at = buf.readUInt32LE(eocd + 16);
    const entries = [];
    for (let i = 0; i < count; i++) {
        if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`${file}: bad central directory`);
        const method = buf.readUInt16LE(at + 10);
        const size = buf.readUInt32LE(at + 20);
        const nameLen = buf.readUInt16LE(at + 28);
        const extraLen = buf.readUInt16LE(at + 30);
        const commentLen = buf.readUInt16LE(at + 32);
        const local = buf.readUInt32LE(at + 42);
        const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
        at += 46 + nameLen + extraLen + commentLen;
        if (name.endsWith('/')) continue;
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const raw = buf.subarray(start, start + size);
        if (method !== 0 && method !== 8) throw new Error(`${file}: ${name} uses unsupported method ${method}`);
        entries.push({ name, text: (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8') });
    }
    return entries;
}

module.exports = { zipEntries };
