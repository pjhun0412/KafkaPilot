import { createWriteStream } from "node:fs";
import type {
  ConsumeOffsetRequest,
  ConsumeOffsetResult,
  OffsetMessageExportRequest
} from "../../shared/types.js";
import {
  formatExportMessage,
  formatMessageCsvHeader,
  formatMessageCsvLine,
  formatMessageLogLine
} from "./messageExportFormatters.js";

type WriteOffsetMessageExportParams = {
  filePath: string;
  request: OffsetMessageExportRequest;
  consumeOffsetBatch: (request: ConsumeOffsetRequest) => Promise<ConsumeOffsetResult>;
  nextOffset: (offset: string) => string;
};

export async function writeOffsetMessageExport({
  filePath,
  request,
  consumeOffsetBatch,
  nextOffset
}: WriteOffsetMessageExportParams) {
  const stream = createWriteStream(filePath, { encoding: "utf8" });
  const write = (chunk: string) => new Promise<void>((resolve, reject) => {
    stream.write(chunk, (error) => error ? reject(error) : resolve());
  });
  const totalLimit = Math.max(1, Number(request.limit) || 10);
  const pageSize = 5000;
  let remaining = totalLimit;
  let cursor = request.offset;
  let endOffsetExclusive = request.endOffsetExclusive;
  let count = 0;
  let jsonFirst = true;

  try {
    if (request.format === "csv") {
      await write(formatMessageCsvHeader(request.payloadOptions) + "\n");
    } else if (request.format === "json") {
      await write(`{\n  "exportedAt": ${JSON.stringify(new Date().toISOString())},\n  "topic": ${JSON.stringify(request.topic)},\n  "messages": [\n`);
    }

    while (remaining > 0) {
      const batchLimit = Math.min(pageSize, remaining);
      const batch = await consumeOffsetBatch({ ...request, offset: cursor, endOffsetExclusive, limit: batchLimit });
      const messages = request.order === "desc" ? [...batch.messages].reverse() : batch.messages;
      if (messages.length === 0) break;

      for (const message of messages) {
        const exportMessage = formatExportMessage(message, request.payloadOptions);
        if (request.format === "csv") {
          await write(formatMessageCsvLine(message, request.payloadOptions) + "\n");
        } else if (request.format === "log") {
          await write(formatMessageLogLine(message, request.template, request.payloadOptions) + "\n");
        } else {
          await write(`${jsonFirst ? "" : ",\n"}    ${JSON.stringify(exportMessage)}`);
          jsonFirst = false;
        }
      }

      count += messages.length;
      remaining -= messages.length;
      if (messages.length < batchLimit) break;
      cursor = request.order === "desc"
        ? messages[messages.length - 1].offset
        : nextOffset(messages[messages.length - 1].offset);
      // The initial "0" means latest; a subsequent low-offset cursor is an
      // actual boundary and must not wrap back to the latest records.
      if (request.order === "desc") endOffsetExclusive = cursor;
    }

    if (request.format === "json") {
      await write(`\n  ],\n  "count": ${count}\n}\n`);
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      stream.end((error?: Error | null) => error ? reject(error) : resolve());
    });
  }
}
