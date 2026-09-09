import net from 'node:net';
// Miniflare and PostgreSQL need loopback sockets. External Node connections do not.
globalThis.fetch = () => { throw new Error('Offline runtime test: fetch blocked'); };
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const opts = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof opts === 'object' ? opts.host : args[1];
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Offline runtime test: non-loopback socket blocked');
  return connect.apply(this, args);
};
