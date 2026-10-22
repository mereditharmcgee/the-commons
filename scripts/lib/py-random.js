'use strict';
// Seeded shuffle that reproduces CPython's random module, so a draw made in
// Python (random.seed(N); random.shuffle(pool)) can be repeated here exactly.
// The September 2026 reception audit was drawn that way with seed 20261017.
//
// Scope: integer seeds only (CPython seeds an int by splitting abs(n) into
// 32-bit words and calling init_by_array), MT19937 output, getrandbits(k) for
// k <= 32, _randbelow_with_getrandbits and shuffle as in CPython 3.x
// (checked against Python 3.14; the algorithm has not changed since 3.2).

const N = 624;
const M = 397;

function bitLength(n) {
    return n === 0 ? 0 : 32 - Math.clz32(n);
}

class PyRandom {
    constructor(seed) {
        this.mt = new Uint32Array(N);
        this.mti = N + 1;
        this.seed(seed);
    }

    seed(seed) {
        let n;
        try {
            n = BigInt(seed);
        } catch {
            throw new TypeError('PyRandom seed must be an integer');
        }
        if (n < 0n) n = -n;
        const key = [];
        if (n === 0n) key.push(0);
        while (n > 0n) {
            key.push(Number(n & 0xffffffffn));
            n >>= 32n;
        }
        this.initByArray(key);
    }

    initGenrand(s) {
        const mt = this.mt;
        mt[0] = s >>> 0;
        for (let i = 1; i < N; i++) {
            const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
            mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
        }
        this.mti = N;
    }

    initByArray(key) {
        this.initGenrand(19650218);
        const mt = this.mt;
        let i = 1;
        let j = 0;
        for (let k = Math.max(N, key.length); k > 0; k--) {
            const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
            mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
            i++;
            j++;
            if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
            if (j >= key.length) j = 0;
        }
        for (let k = N - 1; k > 0; k--) {
            const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
            mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
            i++;
            if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
        }
        mt[0] = 0x80000000;
    }

    nextUint32() {
        const mt = this.mt;
        if (this.mti >= N) {
            let kk = 0;
            let y;
            for (; kk < N - M; kk++) {
                y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
                mt[kk] = mt[kk + M] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
            }
            for (; kk < N - 1; kk++) {
                y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff);
                mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
            }
            y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff);
            mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0);
            this.mti = 0;
        }
        let y = mt[this.mti++];
        y ^= (y >>> 11);
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= (y >>> 18);
        return y >>> 0;
    }

    getrandbits(k) {
        if (!Number.isInteger(k) || k < 1 || k > 32) {
            throw new RangeError('getrandbits supports 1..32 bits here');
        }
        return this.nextUint32() >>> (32 - k);
    }

    randbelow(n) {
        if (!Number.isInteger(n) || n < 1 || n > 0xffffffff) {
            throw new RangeError('randbelow needs 1 <= n < 2**32');
        }
        const k = bitLength(n);
        let r = this.getrandbits(k);
        while (r >= n) r = this.getrandbits(k);
        return r;
    }

    // In place, same swaps as CPython's Random.shuffle.
    shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = this.randbelow(i + 1);
            const t = list[i];
            list[i] = list[j];
            list[j] = t;
        }
        return list;
    }
}

module.exports = { PyRandom };
