const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticateJWT, checkRole } = require('../middleware/authMiddleware');
const { logger } = require('../middleware/logger');

// 初始化日志
console.log('[FixedData] 固定数据管理路由模块初始化完成');

// 统一错误处理函数
function handleRouteError(error, req, res) {
    const requestId = req.headers['x-request-id'] || 'unknown';

    logger.error({
        message: '固定数据路由处理错误',
        requestId,
        error: {
            message: error.message,
            stack: error.stack,
            statusCode: error.statusCode || 500
        },
        request: {
            method: req.method,
            url: req.originalUrl,
            params: req.params,
            body: req.body
        }
    });

    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({
        code: statusCode,
        msg: error.message || "服务器内部错误",
        requestId,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    });
}

// 根据key获取固定数据
router.get("/:key", async (req, res) => {
    const requestId = req.headers['x-request-id'] || 'unknown';
    const { key } = req.params;

    try {
        logger.info(`[${requestId}] 收到查询固定数据请求`, { key });

        const [row] = await query(`
            SELECT id, data_key, content, format, updated_at
            FROM fixed_data
            WHERE data_key = ?
        `, [key]);

        if (row) {
            logger.info(`[${requestId}] 查询成功`, { key });
            res.json({
                code: 200,
                msg: "查询成功",
                data: row,
                requestId
            });
        } else {
            const error = new Error('未找到对应数据');
            error.statusCode = 404;
            throw error;
        }
    } catch (error) {
        handleRouteError(error, req, res);
    }
});


// 修改固定数据
router.put("/:key", authenticateJWT, checkRole(['admin']), async (req, res) => {
    const requestId = req.headers['x-request-id'] || 'unknown';
    const { key } = req.params;

    try {
        logger.info(`[${requestId}] 收到修改固定数据请求`, {
            key,
            body: {
                ...req.body,
                content: req.body.content ? `${req.body.content.substring(0, 30)}...` : '空内容'
            }
        });

        const { content, format } = req.body;

        // 检查必填字段
        if (!content) {
            const error = new Error('缺少内容参数');
            error.statusCode = 400;
            throw error;
        }

        const result = await query(
            `UPDATE fixed_data SET content = ?, format = ? WHERE data_key = ?`,
            [content, format || 'text', key]
        );

        if (result.affectedRows === 1) {
            logger.info(`[${requestId}] 固定数据修改成功`, { key });

            // 获取更新后的数据
            const [updatedData] = await query(`
                SELECT id, data_key, content, format, updated_at
                FROM fixed_data
                WHERE data_key = ?
            `, [key]);

            res.json({
                code: 200,
                msg: "修改成功",
                data: updatedData,
                requestId
            });
        } else {
            const error = new Error('未找到对应数据');
            error.statusCode = 404;
            throw error;
        }
    } catch (error) {
        handleRouteError(error, req, res);
    }
});


module.exports = router;