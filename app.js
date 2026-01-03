const express = require('express');
const path = require('path');
const { query } = require('./config/database');
const { logger, requestLogger } = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');
const security = require('./middleware/security');
const auth = require('./middleware/authMiddleware');

const app = express();

// 1. 安全中间件
console.log('[安全] 应用安全策略');
security.applySecurity(app);

// 2. 基础中间件
console.log('[中间件] 加载基础中间件');

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 3. 日志系统
console.log('[日志] 初始化请求日志记录器');
app.use(requestLogger);

// 静态文件服务配置
const staticPath = path.join(__dirname, 'public');
app.use('/upload', express.static(path.join(staticPath, 'upload'), {
    maxAge: '1y', // 图片长期缓存
    setHeaders: (res, filePath) => {
        // 设置跨域头
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Vary': 'Origin'
        });

        // 动态调整安全策略
        if (process.env.NODE_ENV === 'development') {
            res.set('Content-Security-Policy', "img-src 'self' data: *");
        }
    }
}));

// 其他静态资源（保持原配置）
app.use(express.static(staticPath, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

console.log(`[静态资源] 服务目录: ${staticPath}`);
console.log('[图片服务] 已启用跨域支持');

//  路由系统
console.log('[路由] 加载API路由');
const routers = [
    { path: '/admin', router: require('./routers/AdminRouter') },
    { path: '/category', router: require('./routers/CategoryRouter') },
    { path: '/blog', router: require('./routers/BlogRouter') },
    { path: '/upload', router: require('./routers/UploadRouter') },
    { path: '/settings', router: require('./routers/settings') },
    { path: '/links', router: require('./routers/link') },
    { path: '/', router: require('./routers/feed') }
];
routers.forEach(route => {
    app.use(route.path, route.router);
    console.log(`[路由] 已挂载: ${route.path}`);
});

// 7. 系统端点
console.log('[系统] 设置健康检查端点');
app.get('/health', (req, res) => {
    console.log(`[健康检查] 来自IP: ${req.ip}`);
    res.status(200).json({ status: 'healthy' });
});

console.log('[系统] 设置根路径端点');
app.get("/", (req, res) => res.status(200).json({
    code: 200,
    msg: "服务端启动成功",
    version: process.env.npm_package_version,
    environment: process.env.NODE_ENV || 'development'
}));

// 8. 错误处理
console.log('[错误处理] 配置全局错误处理器');
app.all('*', (req, res) => {
    console.warn(`[404] 未找到路径: ${req.originalUrl}`);
    res.status(404).json({ code: 404, msg: `无法找到 ${req.originalUrl} 资源` });
});

// 专门处理请求体过大错误
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        console.error(`[请求体过大] 接收到的 Content-Length: ${req.headers['content-length']}`);
        return res.status(413).json({
            code: 413,
            error: '请求体过大',
            message: '请求数据超过服务器限制(50MB)'
        });
    }
    next(err);
});

app.use(errorHandler);

console.log('[完成] 应用初始化完成\n');
module.exports = app;