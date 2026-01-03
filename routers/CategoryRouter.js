const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { genid } = require('../Dbutils');
const { authenticateJWT, checkRole } = require('../middleware/authMiddleware');

console.log('[CategoryRouter] 分类路由模块初始化完成');

// 获取分类列表 (公开接口)
router.get("/list", async (req, res) => {
    const requestId = req.headers['x-request-id'] || 'unknown';
    console.log(`[请求ID: ${requestId}] 收到获取分类列表请求`);

    try {
        //添加文章数量和格式化创建时间
        const search_sql = `
            SELECT 
                c.*,
                COUNT(b.id) AS blog_count,
                DATE_FORMAT(FROM_UNIXTIME(c.create_time/1000), '%Y-%m-%d %H:%i:%s') AS formatted_create_time
            FROM 
                \`category\` c
            LEFT JOIN 
                \`blog\` b ON c.id = b.category_id
            GROUP BY 
                c.id
            ORDER BY 
                c.create_time DESC
        `;

        console.log(`[请求ID: ${requestId}] [SQL查询] 准备执行:`, search_sql);

        const rows = await query(search_sql);
        console.log(`[请求ID: ${requestId}] [查询结果] 获取到分类数量:`, rows.length);

        // 处理结果，确保所有分类都有blog_count属性
        const processedRows = rows.map(row => ({
            ...row,
            blog_count: row.blog_count || 0,
            create_time: row.create_time, // 保留原始时间戳
            formatted_create_time: row.formatted_create_time // 添加格式化时间
        }));

        res.send({
            code: 200,
            msg: "查询成功",
            data: processedRows,
            total: processedRows.length,
            requestId
        });
        console.log(`[请求ID: ${requestId}] [响应] 已发送分类列表`);

    } catch (error) {
        console.error(`[请求ID: ${requestId}] [错误] 获取分类列表失败:`, error.stack);
        console.error(`[请求ID: ${requestId}] [错误详情]`, {
            errorCode: error.code,
            sqlState: error.sqlState
        });
        res.status(500).send({
            code: 500,
            error: "数据库操作失败",
            details: process.env.NODE_ENV === 'development' ? error.message : null,
            requestId
        });
    }
});

// 删除分类 (需要管理员权限)
router.delete("/delete",
    authenticateJWT,
    checkRole(['admin']),
    async (req, res) => {
        const requestId = req.headers['x-request-id'] || 'unknown';
        console.log(`[请求ID: ${requestId}] 收到删除分类请求`);
        console.log(`[请求ID: ${requestId}] 查询参数:`, req.query);
        console.log(`[请求ID: ${requestId}] 操作用户:`, req.user.id);

        try {
            let id = req.query.id;

            if (!id) {
                console.warn(`[请求ID: ${requestId}] [验证失败] 缺少分类ID`);
                return res.status(400).send({
                    code: 400,
                    msg: "参数错误：缺少 id",
                    requestId
                });
            }

            console.log(`[请求ID: ${requestId}] [数据验证] 准备删除分类ID:`, id);

            // 先检查分类是否存在
            const check_sql = "SELECT id FROM `category` WHERE `id` = ?";
            const checkRows = await query(check_sql, [id]);

            if (checkRows.length === 0) {
                console.warn(`[请求ID: ${requestId}] [操作终止] 分类不存在`);
                return res.status(404).send({
                    code: 404,
                    msg: "分类不存在",
                    requestId
                });
            }

            // 检查分类下是否有文章
            const blogCheckSql = "SELECT COUNT(*) AS blog_count FROM `blog` WHERE `category_id` = ?";
            const blogCheckResult = await query(blogCheckSql, [id]);

            if (blogCheckResult[0].blog_count > 0) {
                console.warn(`[请求ID: ${requestId}] [操作终止] 分类下有文章`);
                return res.status(400).send({
                    code: 400,
                    msg: "该分类下有文章，请先处理文章后再删除分类",
                    blog_count: blogCheckResult[0].blog_count,
                    requestId
                });
            }

            const delete_sql = "DELETE FROM `category` WHERE `id` = ?";
            console.log(`[请求ID: ${requestId}] [SQL执行] 准备执行:`, delete_sql);

            const result = await query(delete_sql, [id]);
            console.log(`[请求ID: ${requestId}] [SQL结果]`, {
                affectedRows: result.affectedRows
            });

            if (result.affectedRows === 1) {
                console.log(`[请求ID: ${requestId}] [操作成功] 分类删除成功`);
                res.send({
                    code: 200,
                    msg: "删除成功",
                    requestId
                });
            } else {
                console.warn(`[请求ID: ${requestId}] [操作失败] 分类删除失败`);
                res.status(500).send({
                    code: 500,
                    msg: "删除失败：未找到匹配的记录",
                    requestId
                });
            }
        } catch (error) {
            console.error(`[请求ID: ${requestId}] [错误] 删除分类失败:`, error.stack);
            console.error(`[请求ID: ${requestId}] [错误详情]`, {
                errorCode: error.code,
                sqlState: error.sqlState
            });
            res.status(500).send({
                code: 500,
                error: "服务器内部错误",
                details: process.env.NODE_ENV === 'development' ? error.message : null,
                requestId
            });
        }
    }
);

// 修改分类 (需要管理员权限)
router.put("/update",
    authenticateJWT,
    checkRole(['admin']),
    async (req, res) => {
        const requestId = req.headers['x-request-id'] || 'unknown';
        console.log(`[请求ID: ${requestId}] 收到修改分类请求`);
        console.log(`[请求ID: ${requestId}] 请求体:`, req.body);
        console.log(`[请求ID: ${requestId}] 操作用户:`, req.user.id);

        try {
            let { id, name } = req.body;

            if (!id || !name) {
                console.warn(`[请求ID: ${requestId}] [验证失败] 缺少必要参数:`, { id, name });
                return res.status(400).send({
                    code: 400,
                    msg: "缺少必要的参数 id 或 name",
                    requestId
                });
            }

            console.log(`[请求ID: ${requestId}] [数据验证] 准备更新分类:`, { id, name });

            // 先检查分类是否存在
            const check_sql = "SELECT id FROM `category` WHERE `id` = ?";
            const checkRows = await query(check_sql, [id]);

            if (checkRows.length === 0) {
                console.warn(`[请求ID: ${requestId}] [操作终止] 分类不存在`);
                return res.status(404).send({
                    code: 404,
                    msg: "分类不存在",
                    requestId
                });
            }

            const update_sql = "UPDATE `category` SET `name` = ? WHERE `id` = ?";
            console.log(`[请求ID: ${requestId}] [SQL执行] 准备执行:`, update_sql);

            const result = await query(update_sql, [name, id]);
            console.log(`[请求ID: ${requestId}] [SQL结果]`, {
                affectedRows: result.affectedRows,
                changedRows: result.changedRows
            });

            if (result.affectedRows === 1) {
                console.log(`[请求ID: ${requestId}] [操作成功] 分类更新成功`);
                res.send({
                    code: 200,
                    msg: "修改成功",
                    requestId
                });
            } else {
                console.warn(`[请求ID: ${requestId}] [操作失败] 分类更新失败`);
                res.send({
                    code: 500,
                    msg: "修改失败",
                    requestId
                });
            }
        } catch (error) {
            console.error(`[请求ID: ${requestId}] [错误] 更新分类失败:`, error.stack);
            console.error(`[请求ID: ${requestId}] [错误详情]`, {
                errorCode: error.code,
                sqlState: error.sqlState
            });
            res.status(500).send({
                code: 500,
                error: "服务器内部错误",
                details: process.env.NODE_ENV === 'development' ? error.message : null,
                requestId
            });
        }
    }
);

// 添加分类 (需要管理员权限)
router.post("/add",
    authenticateJWT,
    checkRole(['admin']),
    async (req, res) => {
        const requestId = req.headers['x-request-id'] || 'unknown';
        console.log(`[请求ID: ${requestId}] 收到添加分类请求`);
        console.log(`[请求ID: ${requestId}] 请求体:`, req.body);
        console.log(`[请求ID: ${requestId}] 操作用户:`, req.user.id);

        try {
            let { name } = req.body;

            if (!name) {
                console.warn(`[请求ID: ${requestId}] [验证失败] 缺少分类名称`);
                return res.status(400).send({
                    code: 400,
                    msg: "缺少分类名称",
                    requestId
                });
            }

            const id = genid.NextId();
            const create_time = new Date().getTime(); // 添加创建时间
            console.log(`[请求ID: ${requestId}] [ID生成] 新分类ID:`, id);

            const insert_sql = "INSERT INTO `category` (`id`, `name`, `create_time`) VALUES (?, ?, ?)";
            console.log(`[请求ID: ${requestId}] [SQL执行] 准备执行:`, insert_sql);

            const result = await query(insert_sql, [id, name, create_time]);
            console.log(`[请求ID: ${requestId}] [SQL结果]`, {
                affectedRows: result.affectedRows,
                insertId: result.insertId
            });

            if (result.affectedRows === 1) {
                console.log(`[请求ID: ${requestId}] [操作成功] 分类添加成功`);
                res.send({
                    code: 200,
                    msg: "添加成功",
                    categoryId: id,
                    create_time: create_time,
                    requestId
                });
            } else {
                console.warn(`[请求ID: ${requestId}] [操作失败] 分类添加失败`);
                res.send({
                    code: 500,
                    msg: "添加失败",
                    requestId
                });
            }
        } catch (error) {
            console.error(`[请求ID: ${requestId}] [错误] 添加分类失败:`, error.stack);
            console.error(`[请求ID: ${requestId}] [错误详情]`, {
                errorCode: error.code,
                sqlState: error.sqlState,
                duplicateEntry: error.code === 'ER_DUP_ENTRY'
            });
            res.status(500).send({
                code: 500,
                error: "服务器内部错误",
                details: process.env.NODE_ENV === 'development' ? error.message : null,
                requestId
            });
        }
    }
);

module.exports = router;