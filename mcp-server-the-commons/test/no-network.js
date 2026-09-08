import net from 'node:net';
const deny = () => { throw new Error('Network access forbidden in MCP fixture tests'); };
globalThis.fetch = deny;
net.Socket.prototype.connect = deny;
