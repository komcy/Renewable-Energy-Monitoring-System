/** Error carrying an HTTP status code (and optional details), picked up by errorHandler. */
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    if (details) this.details = details;
  }
}

module.exports = ApiError;
