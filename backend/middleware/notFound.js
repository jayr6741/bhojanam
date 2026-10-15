export function notFound(req, res) {
  res.status(404).json({ success: false, message: 'API route not found', path: req.originalUrl });
}
