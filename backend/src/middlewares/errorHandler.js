function parseUniqueViolationDetail(detail) {
  if (!detail) {
    return null;
  }

  const match = /Key \(([^)]+)\)=\(([^)]+)\) already exists\./.exec(detail);
  if (!match) {
    return null;
  }

  return {
    field: match[1],
    value: match[2]
  };
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (error.name === 'ZodError') {
    return res.status(400).json({
      message: 'Validation failed.',
      issues: error.issues
    });
  }

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      message: error.message || 'Request failed.'
    });
  }

  if (error.code === '23505') {
    const knownConstraintFieldMap = {
      users_phone_key: 'phone',
      users_email_key: 'email'
    };

    const parsed = parseUniqueViolationDetail(error.detail);
    const field = knownConstraintFieldMap[error.constraint] || parsed?.field || null;
    const message = field
      ? `An account with this ${field} already exists.`
      : 'Conflict: duplicate value for unique field.';

    return res.status(409).json({
      message,
      field,
      detail: process.env.NODE_ENV === 'production' ? undefined : error.detail
    });
  }

  console.error(error);
  return res.status(500).json({ message: 'Internal server error.' });
}

module.exports = { errorHandler };
