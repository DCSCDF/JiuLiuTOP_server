
//     * MySQL数据库连接配置模块
//     * 使用mysql2 / promise提供Promise接口
//     * 包含连接池管理、查询执行和事务处理功能
//         * 添加了详细的日志输出和性能监控

const mysql = require('mysql2/promise'); // 引入mysql2的Promise版本
const { performance } = require('perf_hooks'); // 用于性能监控
const config = require('./dbconfig'); // 引入配置文件

// 打印初始化日志
console.log('[数据库] 初始化MySQL连接池配置...');

const pool = mysql.createPool({
    host: config.host,           // 数据库主机地址
    port: config.port,           // 数据库端口
    user: config.user,           // 数据库用户名
    password: config.password,   // 数据库密码
    database: config.database,   // 数据库名称

    // 连接池配置
    waitForConnections: config.waitForConnections, // 当无可用连接时等待
    connectionLimit: config.connectionLimit,       // 连接池最大连接数
    queueLimit: config.queueLimit,                 // 等待队列的最大请求数

    // SSL配置（生产环境启用）
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: true, // 拒绝未经授权的证书
        ca: process.env.DB_SSL_CA, // CA证书
        cert: process.env.DB_SSL_CERT, // 客户端证书
        key: process.env.DB_SSL_KEY // 客户端密钥
    } : null
});

// 连接池事件监听
pool.on('connection', (connection) => {
    console.log('[数据库] 创建新连接:', connection.threadId);
});

pool.on('acquire', (connection) => {
    console.log('[数据库] 连接被获取:', connection.threadId);
});

pool.on('release', (connection) => {
    console.log('[数据库] 连接被释放:', connection.threadId);
});

pool.on('enqueue', () => {
    console.log('[数据库] 等待可用连接...');
});


const query = async (sql, params) => {
    const start = performance.now();
    const queryId = Math.random().toString(36).substring(2, 8); // 生成随机查询ID

    console.log(`[查询 ${queryId}] 开始执行SQL:`, {
        sql: sql,
        // params: params
    });

    const conn = await pool.getConnection();
    console.log(`[查询 ${queryId}] 获取数据库连接:`, conn.threadId);

    try {
        // 执行SQL查询
        const [rows] = await conn.execute(sql, params);
        const duration = performance.now() - start;

        // 生产环境记录慢查询
        if (process.env.NODE_ENV === 'production' && duration > 200) {
            console.warn(`[查询 ${queryId}] 慢查询警告: 耗时 ${duration.toFixed(2)}ms`, {
                sql: sql,
                duration: duration
            });
        }

        console.log(`[查询 ${queryId}] 查询成功, 返回 ${rows.length} 条结果, 耗时 ${duration.toFixed(2)}ms`);
        return rows;
    } catch (err) {
        console.error(`[查询 ${queryId}] 查询失败:`, {
            sql: sql,
            error: err.message,
            stack: err.stack
        });
        throw err;
    } finally {
        conn.release();
        console.log(`[查询 ${queryId}] 释放数据库连接`);
    }
};


const transaction = async (callback) => {
    const transactionId = Math.random().toString(36).substring(2, 8); // 生成随机事务ID
    console.log(`[事务 ${transactionId}] 开始事务处理`);

    const conn = await pool.getConnection();
    console.log(`[事务 ${transactionId}] 获取数据库连接:`, conn.threadId);

    try {
        // 开始事务
        await conn.beginTransaction();
        console.log(`[事务 ${transactionId}] 事务开始`);

        // 执行事务回调
        const result = await callback(conn);

        // 提交事务
        await conn.commit();
        console.log(`[事务 ${transactionId}] 事务提交成功`);

        return result;
    } catch (err) {
        // 回滚事务
        await conn.rollback();
        console.error(`[事务 ${transactionId}] 事务回滚:`, err.message);

        throw err;
    } finally {
        conn.release();
        console.log(`[事务 ${transactionId}] 释放数据库连接`);
    }
};

// 导出模块
module.exports = {
    pool,     // 连接池实例
    query,    // 查询方法
    transaction // 事务处理方法
};

console.log('[数据库] MySQL连接池配置完成');
console.log('[数据库] 使用配置:', {
    host: config.host,
    port: config.port,
    user: config.user,
    database: config.database,
    connectionLimit: config.connectionLimit
});