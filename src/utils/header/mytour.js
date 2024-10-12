/* eslint-disable  */

var blocks = [];
var OUTPUT_TYPES = ['hex', 'array', 'digest', 'arrayBuffer'];
var ERROR = 'input is invalid type';

function Sha256(e, t) {
	t
		? ((blocks[0] = blocks[16] = blocks[1] = blocks[2] = blocks[3] = blocks[4] = blocks[5] = blocks[6] = blocks[7] = blocks[8] = blocks[9] = blocks[10] = blocks[11] = blocks[12] = blocks[13] = blocks[14] = blocks[15] = 0),
		  (this.blocks = blocks))
		: (this.blocks = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
		e
			? ((this.h0 = 3238371032),
			  (this.h1 = 914150663),
			  (this.h2 = 812702999),
			  (this.h3 = 4144912697),
			  (this.h4 = 4290775857),
			  (this.h5 = 1750603025),
			  (this.h6 = 1694076839),
			  (this.h7 = 3204075428))
			: ((this.h0 = 1779033703),
			  (this.h1 = 3144134277),
			  (this.h2 = 1013904242),
			  (this.h3 = 2773480762),
			  (this.h4 = 1359893119),
			  (this.h5 = 2600822924),
			  (this.h6 = 528734635),
			  (this.h7 = 1541459225)),
		(this.block = this.start = this.bytes = this.hBytes = 0),
		(this.finalized = this.hashed = !1),
		(this.first = !0),
		(this.is224 = e);
}

Sha256.prototype.update = function (e) {
	if (!this.finalized) {
		var t,
			n = typeof e;
		if ('string' !== n) {
			if ('object' !== n) throw new Error(ERROR);
			if (null === e) throw new Error(ERROR);
			if (ARRAY_BUFFER && e.constructor === ArrayBuffer) e = new Uint8Array(e);
			else if (!Array.isArray(e) && (!ARRAY_BUFFER || !ArrayBuffer.isView(e))) throw new Error(ERROR);
			t = !0;
		}
		for (var r, i, o = 0, a = e.length, s = this.blocks; o < a; ) {
			if (
				(this.hashed &&
					((this.hashed = !1),
					(s[0] = this.block),
					(s[16] = s[1] = s[2] = s[3] = s[4] = s[5] = s[6] = s[7] = s[8] = s[9] = s[10] = s[11] = s[12] = s[13] = s[14] = s[15] = 0)),
				t)
			)
				for (i = this.start; o < a && i < 64; ++o) s[i >> 2] |= e[o] << SHIFT[3 & i++];
			else
				for (i = this.start; o < a && i < 64; ++o)
					(r = e.charCodeAt(o)) < 128
						? (s[i >> 2] |= r << SHIFT[3 & i++])
						: r < 2048
						? ((s[i >> 2] |= (192 | (r >> 6)) << SHIFT[3 & i++]),
						  (s[i >> 2] |= (128 | (63 & r)) << SHIFT[3 & i++]))
						: r < 55296 || r >= 57344
						? ((s[i >> 2] |= (224 | (r >> 12)) << SHIFT[3 & i++]),
						  (s[i >> 2] |= (128 | ((r >> 6) & 63)) << SHIFT[3 & i++]),
						  (s[i >> 2] |= (128 | (63 & r)) << SHIFT[3 & i++]))
						: ((r = 65536 + (((1023 & r) << 10) | (1023 & e.charCodeAt(++o)))),
						  (s[i >> 2] |= (240 | (r >> 18)) << SHIFT[3 & i++]),
						  (s[i >> 2] |= (128 | ((r >> 12) & 63)) << SHIFT[3 & i++]),
						  (s[i >> 2] |= (128 | ((r >> 6) & 63)) << SHIFT[3 & i++]),
						  (s[i >> 2] |= (128 | (63 & r)) << SHIFT[3 & i++]));
			(this.lastByteIndex = i),
				(this.bytes += i - this.start),
				i >= 64
					? ((this.block = s[16]), (this.start = i - 64), this.hash(), (this.hashed = !0))
					: (this.start = i);
		}
		return (
			this.bytes > 4294967295 &&
				((this.hBytes += (this.bytes / 4294967296) << 0), (this.bytes = this.bytes % 4294967296)),
			this
		);
	}
};
Sha256.prototype.finalize = function () {
	if (!this.finalized) {
		this.finalized = !0;
		var e = this.blocks,
			t = this.lastByteIndex;
		(e[16] = this.block),
			(e[t >> 2] |= EXTRA[3 & t]),
			(this.block = e[16]),
			t >= 56 &&
				(this.hashed || this.hash(),
				(e[0] = this.block),
				(e[16] = e[1] = e[2] = e[3] = e[4] = e[5] = e[6] = e[7] = e[8] = e[9] = e[10] = e[11] = e[12] = e[13] = e[14] = e[15] = 0)),
			(e[14] = (this.hBytes << 3) | (this.bytes >>> 29)),
			(e[15] = this.bytes << 3),
			this.hash();
	}
};
Sha256.prototype.hash = function () {
	var e,
		t,
		n,
		r,
		i,
		o,
		a,
		s,
		l,
		u = this.h0,
		c = this.h1,
		d = this.h2,
		p = this.h3,
		f = this.h4,
		h = this.h5,
		y = this.h6,
		g = this.h7,
		v = this.blocks;
	for (e = 16; e < 64; ++e)
		(t = (((i = v[e - 15]) >>> 7) | (i << 25)) ^ ((i >>> 18) | (i << 14)) ^ (i >>> 3)),
			(n = (((i = v[e - 2]) >>> 17) | (i << 15)) ^ ((i >>> 19) | (i << 13)) ^ (i >>> 10)),
			(v[e] = (v[e - 16] + t + v[e - 7] + n) << 0);
	for (l = c & d, e = 0; e < 64; e += 4)
		this.first
			? (this.is224
					? ((o = 300032), (g = ((i = v[0] - 1413257819) - 150054599) << 0), (p = (i + 24177077) << 0))
					: ((o = 704751109), (g = ((i = v[0] - 210244248) - 1521486534) << 0), (p = (i + 143694565) << 0)),
			  (this.first = !1))
			: ((t = ((u >>> 2) | (u << 30)) ^ ((u >>> 13) | (u << 19)) ^ ((u >>> 22) | (u << 10))),
			  (r = (o = u & c) ^ (u & d) ^ l),
			  (g =
					(p +
						(i =
							g +
							(n = ((f >>> 6) | (f << 26)) ^ ((f >>> 11) | (f << 21)) ^ ((f >>> 25) | (f << 7))) +
							((f & h) ^ (~f & y)) +
							K[e] +
							v[e])) <<
					0),
			  (p = (i + (t + r)) << 0)),
			(t = ((p >>> 2) | (p << 30)) ^ ((p >>> 13) | (p << 19)) ^ ((p >>> 22) | (p << 10))),
			(r = (a = p & u) ^ (p & c) ^ o),
			(y =
				(d +
					(i =
						y +
						(n = ((g >>> 6) | (g << 26)) ^ ((g >>> 11) | (g << 21)) ^ ((g >>> 25) | (g << 7))) +
						((g & f) ^ (~g & h)) +
						K[e + 1] +
						v[e + 1])) <<
				0),
			(t = (((d = (i + (t + r)) << 0) >>> 2) | (d << 30)) ^ ((d >>> 13) | (d << 19)) ^ ((d >>> 22) | (d << 10))),
			(r = (s = d & p) ^ (d & u) ^ a),
			(h =
				(c +
					(i =
						h +
						(n = ((y >>> 6) | (y << 26)) ^ ((y >>> 11) | (y << 21)) ^ ((y >>> 25) | (y << 7))) +
						((y & g) ^ (~y & f)) +
						K[e + 2] +
						v[e + 2])) <<
				0),
			(t = (((c = (i + (t + r)) << 0) >>> 2) | (c << 30)) ^ ((c >>> 13) | (c << 19)) ^ ((c >>> 22) | (c << 10))),
			(r = (l = c & d) ^ (c & p) ^ s),
			(f =
				(u +
					(i =
						f +
						(n = ((h >>> 6) | (h << 26)) ^ ((h >>> 11) | (h << 21)) ^ ((h >>> 25) | (h << 7))) +
						((h & y) ^ (~h & g)) +
						K[e + 3] +
						v[e + 3])) <<
				0),
			(u = (i + (t + r)) << 0);
	(this.h0 = (this.h0 + u) << 0),
		(this.h1 = (this.h1 + c) << 0),
		(this.h2 = (this.h2 + d) << 0),
		(this.h3 = (this.h3 + p) << 0),
		(this.h4 = (this.h4 + f) << 0),
		(this.h5 = (this.h5 + h) << 0),
		(this.h6 = (this.h6 + y) << 0),
		(this.h7 = (this.h7 + g) << 0);
};
Sha256.prototype.hex = function () {
	this.finalize();
	var e = this.h0,
		t = this.h1,
		n = this.h2,
		r = this.h3,
		i = this.h4,
		o = this.h5,
		a = this.h6,
		s = this.h7,
		l =
			HEX_CHARS[(e >> 28) & 15] +
			HEX_CHARS[(e >> 24) & 15] +
			HEX_CHARS[(e >> 20) & 15] +
			HEX_CHARS[(e >> 16) & 15] +
			HEX_CHARS[(e >> 12) & 15] +
			HEX_CHARS[(e >> 8) & 15] +
			HEX_CHARS[(e >> 4) & 15] +
			HEX_CHARS[15 & e] +
			HEX_CHARS[(t >> 28) & 15] +
			HEX_CHARS[(t >> 24) & 15] +
			HEX_CHARS[(t >> 20) & 15] +
			HEX_CHARS[(t >> 16) & 15] +
			HEX_CHARS[(t >> 12) & 15] +
			HEX_CHARS[(t >> 8) & 15] +
			HEX_CHARS[(t >> 4) & 15] +
			HEX_CHARS[15 & t] +
			HEX_CHARS[(n >> 28) & 15] +
			HEX_CHARS[(n >> 24) & 15] +
			HEX_CHARS[(n >> 20) & 15] +
			HEX_CHARS[(n >> 16) & 15] +
			HEX_CHARS[(n >> 12) & 15] +
			HEX_CHARS[(n >> 8) & 15] +
			HEX_CHARS[(n >> 4) & 15] +
			HEX_CHARS[15 & n] +
			HEX_CHARS[(r >> 28) & 15] +
			HEX_CHARS[(r >> 24) & 15] +
			HEX_CHARS[(r >> 20) & 15] +
			HEX_CHARS[(r >> 16) & 15] +
			HEX_CHARS[(r >> 12) & 15] +
			HEX_CHARS[(r >> 8) & 15] +
			HEX_CHARS[(r >> 4) & 15] +
			HEX_CHARS[15 & r] +
			HEX_CHARS[(i >> 28) & 15] +
			HEX_CHARS[(i >> 24) & 15] +
			HEX_CHARS[(i >> 20) & 15] +
			HEX_CHARS[(i >> 16) & 15] +
			HEX_CHARS[(i >> 12) & 15] +
			HEX_CHARS[(i >> 8) & 15] +
			HEX_CHARS[(i >> 4) & 15] +
			HEX_CHARS[15 & i] +
			HEX_CHARS[(o >> 28) & 15] +
			HEX_CHARS[(o >> 24) & 15] +
			HEX_CHARS[(o >> 20) & 15] +
			HEX_CHARS[(o >> 16) & 15] +
			HEX_CHARS[(o >> 12) & 15] +
			HEX_CHARS[(o >> 8) & 15] +
			HEX_CHARS[(o >> 4) & 15] +
			HEX_CHARS[15 & o] +
			HEX_CHARS[(a >> 28) & 15] +
			HEX_CHARS[(a >> 24) & 15] +
			HEX_CHARS[(a >> 20) & 15] +
			HEX_CHARS[(a >> 16) & 15] +
			HEX_CHARS[(a >> 12) & 15] +
			HEX_CHARS[(a >> 8) & 15] +
			HEX_CHARS[(a >> 4) & 15] +
			HEX_CHARS[15 & a];
	return (
		this.is224 ||
			(l +=
				HEX_CHARS[(s >> 28) & 15] +
				HEX_CHARS[(s >> 24) & 15] +
				HEX_CHARS[(s >> 20) & 15] +
				HEX_CHARS[(s >> 16) & 15] +
				HEX_CHARS[(s >> 12) & 15] +
				HEX_CHARS[(s >> 8) & 15] +
				HEX_CHARS[(s >> 4) & 15] +
				HEX_CHARS[15 & s]),
		l
	);
};
Sha256.prototype.toString = Sha256.prototype.hex;
Sha256.prototype.digest = function () {
	this.finalize();
	var e = this.h0,
		t = this.h1,
		n = this.h2,
		r = this.h3,
		i = this.h4,
		o = this.h5,
		a = this.h6,
		s = this.h7,
		l = [
			(e >> 24) & 255,
			(e >> 16) & 255,
			(e >> 8) & 255,
			255 & e,
			(t >> 24) & 255,
			(t >> 16) & 255,
			(t >> 8) & 255,
			255 & t,
			(n >> 24) & 255,
			(n >> 16) & 255,
			(n >> 8) & 255,
			255 & n,
			(r >> 24) & 255,
			(r >> 16) & 255,
			(r >> 8) & 255,
			255 & r,
			(i >> 24) & 255,
			(i >> 16) & 255,
			(i >> 8) & 255,
			255 & i,
			(o >> 24) & 255,
			(o >> 16) & 255,
			(o >> 8) & 255,
			255 & o,
			(a >> 24) & 255,
			(a >> 16) & 255,
			(a >> 8) & 255,
			255 & a,
		];
	return this.is224 || l.push((s >> 24) & 255, (s >> 16) & 255, (s >> 8) & 255, 255 & s), l;
};
Sha256.prototype.array = Sha256.prototype.digest;
Sha256.prototype.arrayBuffer = function () {
	this.finalize();
	var e = new ArrayBuffer(this.is224 ? 28 : 32),
		t = new DataView(e);
	return (
		t.setUint32(0, this.h0),
		t.setUint32(4, this.h1),
		t.setUint32(8, this.h2),
		t.setUint32(12, this.h3),
		t.setUint32(16, this.h4),
		t.setUint32(20, this.h5),
		t.setUint32(24, this.h6),
		this.is224 || t.setUint32(28, this.h7),
		e
	);
};

var createOutputMethod = function (e, t) {
	return function (n) {
		return new Sha256(t, !0).update(n)[e]();
	};
};

var nodeWrap = function (method, is224) {
	var crypto = eval("require('crypto')"),
		Buffer = eval("require('buffer').Buffer"),
		algorithm = is224 ? 'sha224' : 'sha256',
		nodeMethod = function (e) {
			if ('string' === typeof e) return crypto.createHash(algorithm).update(e, 'utf8').digest('hex');
			if (null === e || void 0 === e) throw new Error(ERROR);
			return (
				e.constructor === ArrayBuffer && (e = new Uint8Array(e)),
				Array.isArray(e) || ArrayBuffer.isView(e) || e.constructor === Buffer
					? crypto.createHash(algorithm).update(new Buffer(e)).digest('hex')
					: method(e)
			);
		};
	return nodeMethod;
};

var createMethod = function (e) {
	var t = createOutputMethod('hex', e);
	1 && (t = nodeWrap(t, e)),
		(t.create = function () {
			return new Sha256(e);
		}),
		(t.update = function (e) {
			return t.create().update(e);
		});
	for (var n = 0; n < OUTPUT_TYPES.length; ++n) {
		var r = OUTPUT_TYPES[n];
		t[r] = createOutputMethod(r, e);
	}
	return t;
};

const sha256 = createMethod();

function generateAppHash(g = new Date().getTime()) {
	var _ = g / 1e3 - ((g / 1e3) % 300);
	var dc = 'blablablablablablabla';

	return Buffer.from(Object(sha256)(''.concat(_, ':').concat(dc)), 'hex').toString('base64');
}

module.exports = {
	generateAppHash,
};
