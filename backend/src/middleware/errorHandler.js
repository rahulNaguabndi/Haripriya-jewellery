// Centralized error handler. Controllers call next(err) on unexpected
// failures; validation errors are thrown as ApiError with a status code.
export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  if (statusCode === 500) {
    console.error(err);
  }
  res.status(statusCode).json({ error: err.message || 'Internal server error' });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}
