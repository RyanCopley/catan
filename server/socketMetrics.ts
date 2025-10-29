import { Socket } from 'socket.io';
import { recordSocketBytes, recordSocketEvent } from './adminRoutes';

type SanitizeContext = {
  seen: Set<any>;
  binaryBytes: number;
};

function sanitizeForSerialization(value: any, context: SanitizeContext): any {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof value === 'function') {
    return '[Function]';
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    const byteLength = value.length;
    context.binaryBytes += byteLength;
    return { __type: 'Buffer', length: byteLength };
  }

  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const byteLength = view.byteLength;
    context.binaryBytes += byteLength;
    const typeName = value.constructor?.name ?? 'TypedArray';
    return { __type: typeName, length: byteLength };
  }

  if (value instanceof ArrayBuffer) {
    const byteLength = value.byteLength;
    context.binaryBytes += byteLength;
    return { __type: 'ArrayBuffer', length: byteLength };
  }

  if (value instanceof Map) {
    return Array.from(value.entries()).map(([key, val]) => [
      sanitizeForSerialization(key, context),
      sanitizeForSerialization(val, context)
    ]);
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map(entry => sanitizeForSerialization(entry, context));
  }

  if (typeof value === 'object') {
    if (context.seen.has(value)) {
      return '[Circular]';
    }

    context.seen.add(value);
    try {
      if (Array.isArray(value)) {
        return value.map(item => sanitizeForSerialization(item, context));
      }

      const output: Record<string, any> = {};
      for (const [key, entry] of Object.entries(value)) {
        output[key] = sanitizeForSerialization(entry, context);
      }
      return output;
    } finally {
      context.seen.delete(value);
    }
  }

  return value;
}

function filterTransmittedArgs(args: any[]): any[] {
  if (!args.length) {
    return [];
  }

  return args.filter(arg => typeof arg !== 'function');
}

export function estimateSocketPayloadBytes(eventName: string | symbol, args: any[]): number {
  const nameBytes = typeof eventName === 'string' ? Buffer.byteLength(eventName, 'utf8') : 0;
  if (!args.length) {
    return nameBytes;
  }

  const context: SanitizeContext = {
    seen: new Set<any>(),
    binaryBytes: 0
  };

  try {
    const sanitizedArgs = args.map(arg => sanitizeForSerialization(arg, context));
    const serialized = JSON.stringify(sanitizedArgs);
    const payloadBytes = serialized ? Buffer.byteLength(serialized, 'utf8') : 0;
    return nameBytes + context.binaryBytes + payloadBytes;
  } catch {
    return nameBytes + context.binaryBytes;
  }
}

export function attachSocketMetrics(socket: Socket): void {
  socket.onAny((eventName, ...args) => {
    recordSocketEvent(eventName);

    const payloadArgs = filterTransmittedArgs(args);
    if (!payloadArgs.length && typeof eventName !== 'string') {
      return;
    }

    const byteCount = estimateSocketPayloadBytes(eventName, payloadArgs);
    if (byteCount > 0) {
      recordSocketBytes('inbound', eventName, byteCount);
    }
  });

  socket.onAnyOutgoing((eventName, ...args) => {
    const payloadArgs = filterTransmittedArgs(args);
    if (!payloadArgs.length && typeof eventName !== 'string') {
      return;
    }

    const byteCount = estimateSocketPayloadBytes(eventName, payloadArgs);
    if (byteCount > 0) {
      recordSocketBytes('outbound', eventName, byteCount);
    }
  });
}
