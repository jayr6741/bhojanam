export function errorHandler(err, _req, res, _next) {
  const status = Number(err.statusCode || err.status || 500);
  if (status >= 500) console.error(err);
  res.status(status).json({
    success: false,
    message: status >= 500 ? 'Internal server error' : err.message || 'Request failed'
  });
}
