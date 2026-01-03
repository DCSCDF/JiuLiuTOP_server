const { logger } = require('./logger');

// 定义 logError 函数
function logError(err) {
    logger.error({
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
    });
}

module.exports = function (err, req, res, next) {
    logError(err); // 使用 logError 记录错误

    res.status(500).json({
        code: 500,
        msg: '服务器内部错误',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
};