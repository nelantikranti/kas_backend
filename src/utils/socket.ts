// Use require to avoid TypeScript type errors when socket.io types are not installed
// eslint-disable-next-line @typescript-eslint/no-var-requires
const IOServer = require("socket.io").Server;
type IOServerType = any;

let ioInstance: IOServerType | null = null;

export function setIo(io: IOServerType) {
  ioInstance = io;
}

export function getIo(): IOServerType | null {
  return ioInstance;
}



