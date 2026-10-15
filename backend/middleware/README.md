# Middleware

Shared middleware lives here. Current files provide async error forwarding, 404 handling and centralized error responses.

Before production, add and test authentication/session validation, role/permission authorization, request validation, rate limiting for login/reset endpoints, and request/audit correlation. Never trust a table number or user role supplied by a client without server-side validation.
