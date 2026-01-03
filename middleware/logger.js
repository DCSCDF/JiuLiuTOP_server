// server/middleware/logger.js
const { createLogger, format, transports } = require('winston');

const logger = createLogger({
    level: 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'logs/error.log', level: 'error' }),
        new transports.File({ filename: 'logs/combined.log' })
    ]
});

const requestLogger = (req, res, next) => {
    logger.info({
        message: 'Request received',
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        headers: req.headers
    });
    next();
};

module.exports = { logger, requestLogger };