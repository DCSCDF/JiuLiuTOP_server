const express = require('express');
const router = express.Router();
const { query, transaction } = require('../config/database');
const { genid } = require('../Dbutils');
const { authenticateJWT, checkRole } = require('../middleware/authMiddleware'); // 引入JWT验证中间件
const path = require('path');
const fs = require('fs').promises;

console.log('[BlogRouter] 博客路由模块初始化完成');

// 添加博客 - 需要管理员权限
router.post("/add", authenticateJWT, checkRole(['admin']), async (req, res) => {
    console.log(`[${new Date().toISOString()}] 收到添加博客请求`);

    try {
        // 解构请求体参数
        let { title, categoryId, content, img_url, is_hidden = false } = req.body;
        // 参数验证 - 修改为更灵活的验证
        if (!title || !content) {
            console.warn('[验证失败] 缺少必要参数');
            return res.status(400).json({
                code: 400,
                msg: "参数错误：缺少title或content"
            });
        }

        // 如果categoryId无效，设置为默认分类或null
        if (!categoryId || categoryId === "null") {
            categoryId = null; // 或者设置一个默认分类ID
            console.warn('[参数处理] categoryId无效，设置为null');
        }

        // 生成ID和时间戳
        let id = genid.NextId();
        let create_time = new Date().getTime();

        console.log('[数据准备]', {
            generatedId: id,
            titleLength: title.length,
            categoryId,
            contentLength: content.length,
            img_url: img_url || '无图片'
        });

        // 构建SQL语句和参数
        const insert_sql = "INSERT INTO `blog`(`id`,`title`,`category_id`,`content`,`create_time`,`img_url`,`is_hidden`) VALUES (?,?,?,?,?,?,?)";
        let params = [id, title, categoryId, content, create_time, img_url || null, is_hidden];

        // 执行SQL
        const result = await query(insert_sql, params);

        if (result.affectedRows === 1) {
            console.log('[操作成功] 博客添加成功');
            return res.status(200).json({
                code: 200,
                msg: "添加成功",
                blogId: id
            });
        } else {
            console.warn('[操作失败] 博客添加失败');
            return res.status(500).json({
                code: 500,
                msg: "添加失败",
                details: "未影响任何行"
            });
        }
    } catch (error) {
        console.error('[错误] 添加博客失败:', error.stack);

        // 针对Jimp错误的特殊处理
        if (error.message.includes('w and h cannot both be set to auto')) {
            console.error('[图片处理错误] 图片尺寸参数错误');
            return res.status(400).json({
                code: 400,
                msg: "图片处理失败",
                details: "图片尺寸参数无效"
            });
        }

        // 其他错误处理
        return res.status(500).json({
            code: 500,
            msg: "服务器内部错误",
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});

// 修改博客 - 需要管理员权限
router.put("/update", authenticateJWT, checkRole(['admin']), async (req, res) => {
    console.log(`[${new Date().toISOString()}] 收到更新博客请求`);
    console.log('请求体:', JSON.stringify({
        ...req.body,
        content: req.body.content ? `${req.body.content.substring(0, 30)}...` : '空内容'
    }, null, 2));

    try {
        let { id, title, categoryId, content, img_url, is_hidden } = req.body;

        console.log('[数据验证]', {
            blogId: id,
            titleLength: title.length,
            categoryId,
            contentLength: content.length,
            img_url: img_url || '无图片'
        });

        if (!id) {
            console.warn('[验证失败] 缺少博客ID');
            return res.status(400).send({
                code: 400,
                msg: "参数错误：缺少id"
            });
        }

        const update_sql = "UPDATE `blog` SET `title` = ?, `content` = ?, `category_id` = ?, `img_url` = ?, `is_hidden` = ? WHERE `id` = ?";
        let params = [title, content, categoryId, img_url, is_hidden, id];

        console.log('[SQL执行] 准备执行:', {
            sql: update_sql,
            params: params.map(p => typeof p === 'string' ? `${p.substring(0, 10)}...` : p)
        });

        const result = await query(update_sql, params);
        console.log('[SQL结果]', {
            affectedRows: result.affectedRows,
            changedRows: result.changedRows
        });

        if (result.affectedRows === 1) {
            console.log('[操作成功] 博客更新成功');
            res.send({
                code: 200,
                msg: "修改成功"
            });
        } else {
            console.warn('[操作失败] 博客更新失败');
            res.status(404).send({
                code: 404,
                msg: "未找到指定博客",
                details: result.info
            });
        }
    } catch (error) {
        console.error('[错误] 更新博客失败:', error.stack);
        console.error('[错误详情]', {
            errorCode: error.code,
            sqlState: error.sqlState
        });
        res.status(500).send({
            code: 500,
            error: "服务器内部错误",
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});

// 删除博客 - 需要管理员权限
router.delete("/delete", authenticateJWT, checkRole(['admin']), async (req, res) => {
    console.log(`[${new Date().toISOString()}] 收到删除博客请求`);
    console.log('查询参数:', req.query);

    try {
        let id = req.query.id;

        if (!id) {
            console.warn('[验证失败] 缺少博客ID');
            return res.status(400).send({
                code: 400,
                msg: "参数错误：缺少id"
            });
        }

        console.log('[数据验证] 准备删除博客ID:', id);

        // 先查询博客信息，获取图片路径
        const check_sql = "SELECT id, img_url FROM `blog` WHERE `id` = ?";
        const checkRows = await query(check_sql, [id]);

        if (checkRows.length === 0) {
            console.warn('[操作终止] 博客不存在');
            return res.status(404).send({
                code: 404,
                msg: "博客不存在"
            });
        }

        const blog = checkRows[0];
        let imgDeleted = false;

        // 如果有图片，先删除图片

        if (blog.img_url) {
            try {
                // 从URL中提取文件名
                const url = new URL(blog.img_url);
                const filename = path.basename(url.pathname); // 获取 "666428848255045.png"
                const filePath = path.join(process.cwd(), 'public', 'upload', filename);

                console.log('[图片删除] 准备删除文件:', filePath);

                // 检查文件是否存在
                try {
                    await fs.access(filePath);
                    // 文件存在，执行删除
                    await fs.unlink(filePath);
                    imgDeleted = true;
                    console.log('[图片删除] 成功删除图片:', filename);
                } catch (err) {
                    if (err.code === 'ENOENT') {
                        console.warn('[图片删除] 图片文件不存在:', filename);
                    } else {
                        console.error('[图片删除] 删除图片失败:', err.stack);
                    }
                }
            } catch (err) {
                console.error('[图片删除] 删除图片过程中出错:', err.stack);
            }
        }

        // 删除博客记录
        const delete_sql = "DELETE FROM `blog` WHERE `id` = ?";
        console.log('[SQL执行] 准备执行:', delete_sql);

        const result = await query(delete_sql, [id]);
        console.log('[SQL结果]', {
            affectedRows: result.affectedRows
        });

        if (result.affectedRows === 1) {
            console.log('[操作成功] 博客删除成功');
            res.send({
                code: 200,
                msg: "删除成功",
                imgDeleted: imgDeleted
            });
        } else {
            console.warn('[操作失败] 博客删除失败');
            res.status(500).send({
                code: 500,
                msg: "删除失败",
                details: "未影响任何行"
            });
        }
    } catch (error) {
        console.error('[错误] 删除博客失败:', error.stack);
        console.error('[错误详情]', {
            errorCode: error.code,
            sqlState: error.sqlState
        });
        res.status(500).send({
            code: 500,
            error: "服务器内部错误",
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});

router.get("/admin_search", authenticateJWT, checkRole(['admin']), async (req, res) => {
    console.log(`[${new Date().toISOString()}] 收到搜索博客请求`);
    console.log('查询参数:', req.query);

    try {
        let { keyword = '', categoryId = '0', page = '1', pageSize = '6' } = req.query;

        // 确保参数是数字类型 - 使用更严格的转换方式
        const pageNum = parseInt(page, 10);
        const pageSizeNum = parseInt(pageSize, 10);
        const categoryIdNum = parseInt(categoryId, 10);
        const offset = (pageNum - 1) * pageSizeNum;

        // 验证参数有效性
        if (isNaN(pageNum) || isNaN(pageSizeNum) || isNaN(categoryIdNum)) {
            return res.status(400).json({
                code: 400,
                msg: "参数必须是有效的数字"
            });
        }

        console.log('[参数处理]', {
            keyword,
            categoryId: categoryIdNum,
            page: pageNum,
            pageSize: pageSizeNum,
            offset
        });

        let params = [];
        let whereSqls = [];

        if (categoryIdNum !== 0) {
            whereSqls.push("`category_id` = ?");
            params.push(categoryIdNum);
        }

        if (keyword) {
            whereSqls.push("(`title` LIKE ? OR `content` LIKE ?)");
            params.push(`%${keyword}%`);
            params.push(`%${keyword}%`);
        }

        let whereSqlStr = whereSqls.length > 0 ? " WHERE " + whereSqls.join(" AND ") : "";

        // 修改SQL语句和参数传递方式
        const searchSql = `SELECT id, category_id, create_time, title, content, img_url, is_hidden 
                          FROM blog ${whereSqlStr} 
                          ORDER BY create_time DESC 
                          LIMIT ${pageSizeNum} OFFSET ${offset}`;

        const countSql = `SELECT COUNT(*) AS count FROM blog ${whereSqlStr}`;

        console.log('[SQL准备]', {
            searchSql,
            countSql,
            params
        });

        // 获取时间范围
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartTimestamp = todayStart.getTime();

        const now = new Date();
        const dayOfWeek = now.getDay();
        const diffDays = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - diffDays);
        monday.setHours(0, 0, 0, 0);
        const mondayTimestamp = monday.getTime();

        // 执行查询
        const [searchResult, countResult, todayResult, weekResult] = await Promise.all([
            query(searchSql, params),
            query(countSql, params),
            query("SELECT COUNT(*) AS count FROM blog WHERE create_time >= ?", [todayStartTimestamp]),
            query("SELECT COUNT(*) AS count FROM blog WHERE create_time >= ?", [mondayTimestamp])
        ]);

        // 处理结果
        const processedResult = searchResult.map(row => ({
            ...row,
            content: row.content.replace(/<[^>]*>/g, '').substring(0, 100)
        }));

        res.json({
            code: 200,
            data: {
                keyword,
                categoryId: categoryIdNum,
                page: pageNum,
                pageSize: pageSizeNum,
                rows: processedResult,
                count: countResult[0]?.count || 0,
                stats: {
                    todayAdded: todayResult[0]?.count || 0,
                    weekAdded: weekResult[0]?.count || 0
                }
            }
        });
    } catch (error) {
        console.error('[错误] 搜索博客失败:', error.stack);
        res.status(500).json({
            code: 500,
            msg: "服务器内部错误",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

router.get("/search", async (req, res) => {
    console.log(`[${new Date().toISOString()}] 收到搜索博客请求`);
    console.log('查询参数:', req.query);

    try {
        let { keyword = '', categoryId = '0', page = '1', pageSize = '6' } = req.query;

        // 确保参数是数字类型 - 使用更严格的转换方式
        const pageNum = parseInt(page, 10);
        const pageSizeNum = parseInt(pageSize, 10);
        const categoryIdNum = parseInt(categoryId, 10);
        const offset = (pageNum - 1) * pageSizeNum;

        // 验证参数有效性
        if (isNaN(pageNum) || isNaN(pageSizeNum) || isNaN(categoryIdNum)) {
            return res.status(400).json({
                code: 400,
                msg: "参数必须是有效的数字"
            });
        }

        console.log('[参数处理]', {
            keyword,
            categoryId: categoryIdNum,
            page: pageNum,
            pageSize: pageSizeNum,
            offset
        });
        let params = [];
        let whereSqls = ["`is_hidden` = 0"]; // 添加默认条件：只显示非隐藏文章

        if (categoryIdNum !== 0) {
            whereSqls.push("`category_id` = ?");
            params.push(categoryIdNum);
        }

        if (keyword) {
            whereSqls.push("(`title` LIKE ? OR `content` LIKE ?)");
            params.push(`%${keyword}%`);
            params.push(`%${keyword}%`);
        }

        let whereSqlStr = whereSqls.length > 0 ? " WHERE " + whereSqls.join(" AND ") : "";

        // 修改SQL语句和参数传递方式
        const searchSql = `SELECT id, category_id, create_time, title, content, img_url 
                          FROM blog ${whereSqlStr} 
                          ORDER BY create_time DESC 
                          LIMIT ${pageSizeNum} OFFSET ${offset}`;

        const countSql = `SELECT COUNT(*) AS count FROM blog ${whereSqlStr}`;

        console.log('[SQL准备]', {
            searchSql,
            countSql,
            params
        });

        // 获取时间范围
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartTimestamp = todayStart.getTime();

        const now = new Date();
        const dayOfWeek = now.getDay();
        const diffDays = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const monday = new Date(now);
        monday.setDate(now.getDate() - diffDays);
        monday.setHours(0, 0, 0, 0);
        const mondayTimestamp = monday.getTime();

        // 执行查询
        const [searchResult, countResult, todayResult, weekResult] = await Promise.all([
            query(searchSql, params),
            query(countSql, params),
            query("SELECT COUNT(*) AS count FROM blog WHERE create_time >= ?", [todayStartTimestamp]),
            query("SELECT COUNT(*) AS count FROM blog WHERE create_time >= ?", [mondayTimestamp])
        ]);

        // 处理结果
        const processedResult = searchResult.map(row => ({
            ...row,
            content: row.content.replace(/<[^>]*>/g, '').substring(0, 100)
        }));

        res.json({
            code: 200,
            data: {
                keyword,
                categoryId: categoryIdNum,
                page: pageNum,
                pageSize: pageSizeNum,
                rows: processedResult,
                count: countResult[0]?.count || 0,
                stats: {
                    todayAdded: todayResult[0]?.count || 0,
                    weekAdded: weekResult[0]?.count || 0
                }
            }
        });
    } catch (error) {
        console.error('[错误] 搜索博客失败:', error.stack);
        res.status(500).json({
            code: 500,
            msg: "服务器内部错误",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});


/**
 * 获取今日新增文章数 - 公开接口
 */
router.get("/today-count", async (req, res) => {
    console.log(`[${new Date().toISOString()}] 收到获取今日新增文章请求`);

    try {
        // 获取今天的开始时间（00:00:00）
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartTimestamp = todayStart.getTime();

        const sql = "SELECT COUNT(*) AS count FROM `blog` WHERE `create_time` >= ?";
        console.log('[SQL执行] 准备执行:', sql, todayStartTimestamp);

        const result = await query(sql, [todayStartTimestamp]);
        const count = result[0]?.count || 0;

        console.log('[查询结果] 今日新增文章数:', count);
        res.send({
            code: 200,
            msg: "查询成功",
            count
        });
    } catch (error) {
        console.error('[错误] 获取今日新增文章数失败:', error.stack);
        res.status(500).send({
            code: 500,
            error: "服务器内部错误",
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});

/**
 * 获取本周新增文章数 - 公开接口
 */
router.get("/week-count", async (req, res) => {
    console.log(`[${new Date().toISOString()}] 收到获取本周新增文章请求`);

    try {
        // 获取本周一的开始时间（00:00:00）
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0是周日，1是周一...
        const diffDays = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 如果是周日，减去6天到周一
        const monday = new Date(now);
        monday.setDate(now.getDate() - diffDays);
        monday.setHours(0, 0, 0, 0);
        const mondayTimestamp = monday.getTime();

        const sql = "SELECT COUNT(*) AS count FROM `blog` WHERE `create_time` >= ?";
        console.log('[SQL执行] 准备执行:', sql, mondayTimestamp);

        const result = await query(sql, [mondayTimestamp]);
        const count = result[0]?.count || 0;

        console.log('[查询结果] 本周新增文章数:', count);
        res.send({
            code: 200,
            msg: "查询成功",
            count
        });
    } catch (error) {
        console.error('[错误] 获取本周新增文章数失败:', error.stack);
        res.status(500).send({
            code: 500,
            error: "服务器内部错误",
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});

/**
 * 获取文章统计信息（总文章数、今日新增、本周新增） - 公开接口
 */
router.get("/stats", async (req, res) => {
    console.log(`[${new Date().toISOString()}] 收到获取文章统计信息请求`);

    try {
        // 获取今天的开始时间（00:00:00）
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayStartTimestamp = todayStart.getTime();

        // 获取本周一的开始时间（00:00:00）
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0是周日，1是周一...
        const diffDays = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 如果是周日，减去6天到周一
        const monday = new Date(now);
        monday.setDate(now.getDate() - diffDays);
        monday.setHours(0, 0, 0, 0);
        const mondayTimestamp = monday.getTime();

        // 使用事务确保数据一致性
        const [totalResult, todayResult, weekResult] = await Promise.all([
            query("SELECT COUNT(*) AS count FROM `blog` WHERE `is_hidden` = 0"),
            query("SELECT COUNT(*) AS count FROM `blog` WHERE `create_time` >= ? AND `is_hidden` = 0", [todayStartTimestamp]),
            query("SELECT COUNT(*) AS count FROM `blog` WHERE `create_time` >= ? AND `is_hidden` = 0", [mondayTimestamp])
        ]);

        const stats = {
            total: totalResult[0]?.count || 0,
            todayAdded: todayResult[0]?.count || 0,
            weekAdded: weekResult[0]?.count || 0
        };

        console.log('[查询结果] 文章统计信息:', stats);
        res.send({
            code: 200,
            msg: "查询成功",
            data: stats
        });
    } catch (error) {
        console.error('[错误] 获取文章统计信息失败:', error.stack);
        res.status(500).send({
            code: 500,
            error: "服务器内部错误",
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});
// 获取博客详情 - 公开接口，无需验证
router.get("/detail", async (req, res) => {
    console.log(`[${new Date().toISOString()}] 收到获取博客详情请求`);
    console.log('查询参数:', req.query);

    try {
        let { id, admin = false } = req.query; // 添加admin参数
        if (!id) {
            console.warn('[验证失败] 缺少博客ID');
            return res.status(400).send({
                code: 400,
                mes: "参数错误：缺少id"
            });
        }

        console.log('[数据准备] 查询博客ID:', id);

        let detail_sql = "SELECT * FROM `blog` WHERE `id` = ? AND `is_hidden` = 0";

        console.log('[SQL执行] 准备执行:', detail_sql);

        const rows = await query(detail_sql, [id]);
        console.log('[查询结果] 找到记录数:', rows.length);

        if (rows.length > 0) {
            console.log('[操作成功] 返回博客详情');
            res.send({
                code: 200,
                mes: "获取成功",
                data: rows[0]
            });
        } else {
            console.warn('[操作失败] 博客不存在');
            res.status(404).send({
                code: 404,
                mes: "文章不存在"
            });
        }
    } catch (error) {
        console.error('[错误] 获取博客详情失败:', error.stack);
        console.error('[错误详情]', {
            errorCode: error.code,
            sqlState: error.sqlState
        });
        res.status(500).send({
            code: 500,
            mes: "服务器内部错误",
            error: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});
router.put("/toggle-hidden", authenticateJWT, checkRole(['admin']), async (req, res) => {
    console.log(`[${new Date().toISOString()}] 收到切换博客隐藏状态请求`);

    try {
        let { id } = req.body;

        if (!id) {
            console.warn('[验证失败] 缺少博客ID');
            return res.status(400).send({
                code: 400,
                msg: "参数错误：缺少id"
            });
        }

        // 先获取当前状态
        const check_sql = "SELECT is_hidden FROM `blog` WHERE `id` = ?";
        const checkRows = await query(check_sql, [id]);

        if (checkRows.length === 0) {
            console.warn('[操作终止] 博客不存在');
            return res.status(404).send({
                code: 404,
                msg: "博客不存在"
            });
        }

        const currentState = checkRows[0].is_hidden;
        const newState = currentState ? 0 : 1;

        // 更新状态
        const update_sql = "UPDATE `blog` SET `is_hidden` = ? WHERE `id` = ?";
        const result = await query(update_sql, [newState, id]);

        if (result.affectedRows === 1) {
            console.log('[操作成功] 博客隐藏状态已更新');
            res.send({
                code: 200,
                msg: "操作成功",
                is_hidden: newState
            });
        } else {
            console.warn('[操作失败] 博客隐藏状态更新失败');
            res.status(500).send({
                code: 500,
                msg: "操作失败"
            });
        }
    } catch (error) {
        console.error('[错误] 切换博客隐藏状态失败:', error.stack);
        res.status(500).send({
            code: 500,
            error: "服务器内部错误",
            details: process.env.NODE_ENV === 'development' ? error.message : null
        });
    }
});
module.exports = router;