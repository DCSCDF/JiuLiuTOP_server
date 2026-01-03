const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { genid } = require('../Dbutils');
const { authenticateJWT, checkRole } = require('../middleware/authMiddleware');
const { logger } = require('../middleware/logger'); // 导入logger

// 初始化日志
console.log('[Links] 友链管理路由模块初始化完成');

// 统一错误处理函数（使用logger替代console.error）
function handleRouteError(error, req, res) {
    const requestId = req.headers['x-request-id'] || 'unknown';

    logger.error({
        message: '路由处理错误',
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

// 查询友链   
router.get("/search", async (req, res) => {
    const requestId = req.headers['x-request-id'] || 'unknown';

    try {
        logger.info(`[${requestId}] 收到查询友链请求`);

        // 查询总数据量
        const [countResult] = await query("SELECT COUNT(*) AS total FROM `links`");
        const totalCount = countResult.total;

        // 查询所有数据
        const rows = await query(`
            SELECT id, title, content, url, img_url, create_time
            FROM links
        `);

        logger.info(`[${requestId}] 查询成功，共 ${rows.length} 条记录`);

        res.json({
            code: 200,
            msg: "查询成功",
            data: rows,
            count: totalCount,
            requestId
        });

    } catch (error) {
        handleRouteError(error, req, res);
    }
});

// 添加友链
router.post("/add", authenticateJWT, checkRole(['admin']), async (req, res) => {
    const requestId = req.headers['x-request-id'] || 'unknown';

    try {
        logger.info(`[${requestId}] 收到添加友链请求`, {
            body: {
                ...req.body,
                content: req.body.content ? `${req.body.content.substring(0, 30)}...` : '空内容'
            }
        });

        const { title, content, url, img_url } = req.body;
        const id = genid.NextId();
        const create_time = new Date().getTime();

        const result = await query(
            `INSERT INTO links (id, title, content, url, img_url, create_time) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, title, content, url, img_url, create_time]
        );

        if (result.affectedRows === 1) {
            logger.info(`[${requestId}] 友链添加成功`, { id, title });

            res.json({
                code: 200,
                msg: "添加成功",
                data: { id, title, content, url, img_url, create_time },
                requestId
            });
        } else {
            const error = new Error('添加友链失败');
            error.statusCode = 500;
            throw error;
        }
    } catch (error) {
        handleRouteError(error, req, res);
    }
});

// 修改友链
router.put("/update", authenticateJWT, checkRole(['admin']), async (req, res) => {
    const requestId = req.headers['x-request-id'] || 'unknown';

    try {
        logger.info(`[${requestId}] 收到修改友链请求`, {
            body: {
                ...req.body,
                content: req.body.content ? `${req.body.content.substring(0, 30)}...` : '空内容'
            }
        });

        const { id, title, content, url, img_url } = req.body;

        const result = await query(
            `UPDATE links SET title = ?, content = ?, url = ?, img_url = ? WHERE id = ?`,
            [title, content, url, img_url, id]
        );

        if (result.affectedRows === 1) {
            logger.info(`[${requestId}] 友链修改成功`, { id, title });

            res.json({
                code: 200,
                msg: "修改成功",
                data: { id, title, content, url, img_url },
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

// 删除友链
router.delete("/delete", authenticateJWT, checkRole(['admin']), async (req, res) => {
    const requestId = req.headers['x-request-id'] || 'unknown';

    try {
        logger.info(`[${requestId}] 收到删除友链请求`, { query: req.query });

        const { id } = req.query;

        if (!id) {
            const error = new Error('缺少友链ID参数');
            error.statusCode = 400;
            throw error;
        }

        const result = await query("DELETE FROM links WHERE id = ?", [id]);

        if (result.affectedRows === 1) {
            logger.info(`[${requestId}] 友链删除成功`, { id });

            res.json({
                code: 200,
                msg: "删除成功",
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