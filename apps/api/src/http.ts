import type { ErrorRequestHandler, Response } from "express";
import multer from "multer";
import type { ApiError } from "@musicapp/shared";

/** Throw from a route to answer with this status and `{ error: message }`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function sendError(res: Response, status: number, message: string): void {
  res.status(status).json({ error: message } satisfies ApiError);
}

/**
 * Last middleware: every failure leaves as JSON the web app can show,
 * instead of Express's default HTML error page.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof HttpError) {
    sendError(res, err.status, err.message);
  } else if (err instanceof multer.MulterError) {
    sendError(res, err.code === "LIMIT_FILE_SIZE" ? 413 : 400, err.code === "LIMIT_FILE_SIZE" ? "That file is too large (200 MB max)" : err.message);
  } else if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
    // body-parser rejections (malformed JSON, body too large...)
    sendError(res, err.status, err.message);
  } else {
    console.error(err);
    sendError(res, 500, "Something went wrong");
  }
};
