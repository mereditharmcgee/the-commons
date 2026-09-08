// Preload for offline checks. No production calls, including accidental RPC probes.
const net = require('node:net');
const deny = () => { throw new Error('Network access is forbidden in offline discovery tests'); };
globalThis.fetch = deny;
net.Socket.prototype.connect = deny;
