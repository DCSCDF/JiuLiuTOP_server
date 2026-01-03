const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { logger } = require('../middleware/logger');
const { Feed } = require('feed');
const NodeCache = require('node-cache');
const feedCache = new NodeCache({ stdTTL: 3600 });
// 初始化日志
console.log('[FeedData] RSS Feed 路由模块初始化完成');

// 统一错误处理函数
function handleRouteError(error, req, res) {
    const requestId = req.headers['x-request-id'] || 'unknown';

    logger.error({
        message: 'Feed 路由处理错误',
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

// 获取Feed基础数据
async function getFeedBaseData() {
    try {
        const [feedData] = await query(`
            SELECT content, format 
            FROM fixed_data 
            WHERE data_key = 'rss_feed'
        `);

        if (!feedData) {
            const error = new Error('未找到Feed基础数据');
            error.statusCode = 404;
            throw error;
        }

        return JSON.parse(feedData.content);
    } catch (error) {
        throw error;
    }
}

// 获取博客文章数据
async function getBlogPosts(baseUrl) {
    try {
        // 查询不隐藏的文章，按创建时间降序排列，只获取最近的5篇
        const posts = await query(`
            SELECT id, title, content, create_time, img_url 
            FROM blog 
            WHERE is_hidden = 0 
            ORDER BY create_time DESC
            LIMIT 10
        `);

        return posts.map(post => ({
            title: post.title,
            link: `${baseUrl}/blog?id=${post.id}`,
            description: post.content.substring(0, 100) + '...',
            content: post.content,
            date: new Date(post.create_time),
            image: post.img_url
        }));
    } catch (error) {
        throw error;
    }
}

// 生成RSS Feed
async function generateRSS(req) {
    const requestId = req.headers['x-request-id'] || 'unknown';

    try {
        logger.info(`[${requestId}] 开始生成RSS Feed`);

        // 从数据库获取基础数据
        const feedBase = await getFeedBaseData();

        // 确保baseUrl以/结尾
        const baseUrl = feedBase.link.replace(/\/+$/, '');

        // 获取博客文章数据
        const blogPosts = await getBlogPosts(baseUrl);

        // 创建Feed实例
        const feed = new Feed({
            title: feedBase.title,
            description: feedBase.description,
            id: baseUrl,
            link: baseUrl,
            language: feedBase.language,
            image: feedBase.image,
            favicon: feedBase.favicon,
            updated: new Date(),
            feedLinks: {
                rss: `${baseUrl}/feed.xml`
            }
        });

        // 添加文章项
        blogPosts.forEach(item => {
            feed.addItem({
                title: item.title,
                id: item.link,
                link: item.link,
                description: item.description,
                content: item.content,
                date: item.date,
                image: item.image
            });
        });

        logger.info(`[${requestId}] RSS Feed生成成功，包含 ${blogPosts.length} 篇文章`);
        return feed.rss2();
    } catch (error) {
        logger.error(`[${requestId}] RSS Feed生成失败`, { error: error.message });
        throw error;
    }
}

// 定义路由
router.get('/feed.xml', async (req, res) => {
    try {
        const cacheKey = 'rss-feed';
        let rss = feedCache.get(cacheKey);

        if (!rss) {
            rss = await generateRSS(req);
            feedCache.set(cacheKey, rss);
        }

        // 使用 res.type() 自动设置 Content-Type
        res.type('application/rss+xml');

        // 手动设置响应头（效果相同）
        // res.set('Content-Type', 'application/rss+xml');

        res.send(rss);
    } catch (error) {
        handleRouteError(error, req, res);
    }
});
module.exports = router;