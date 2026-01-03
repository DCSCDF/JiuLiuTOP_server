const os = require('os');
// 启动横幅
console.log('========================================\n' +
    '🚀 JiuLiuTOP 服务器启动中...\n' +
    `🖥️  主机名: ${os.hostname()}\n` +
    `💻 平台: ${os.platform()} ${os.arch()}\n` +
    `🔄 Node.js 版本: ${process.version}\n` +
    `📁 工作目录: ${process.cwd()}\n` +
    '========================================');

const cluster = require('cluster');
const app = require('./app');
const config = require('./config/production');
const { logger } = require('./middleware/logger');


// 集群模式
if (cluster.isMaster && config.SERVER.CLUSTER) {
    const cpuCount = os.cpus().length;
    logger.info(`主进程 PID:${process.pid} 启动`);
    logger.info(`集群模式启用，创建 ${cpuCount} 个工作进程`);

    // 创建工作进程池
    const workers = new Map();
    for (let i = 0; i < cpuCount; i++) {
        const worker = cluster.fork();
        workers.set(worker.process.pid, worker);
        setupWorkerHooks(worker);
    }

    // 全局关机控制
    let isShuttingDown = false;
    const gracefulShutdown = (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        logger.warn(`主进程收到 ${signal}，开始关闭集群...`);
        workers.forEach(worker => {
            worker.send('shutdown');
            setTimeout(() => worker.kill('SIGTERM'), 10000);
        });

        setTimeout(() => {
            logger.error('强制终止剩余工作进程');
            process.exit(1);
        }, 15000);
    };

    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));

} else {
    // 工作进程逻辑
    const server = initWorkerServer();
    setupWorkerGracefulShutdown(server);
}

// 工具函数
function setupWorkerHooks(worker) {
    worker.on('listening', (address) => {
        logger.info(`工作进程 ${worker.process.pid} 监听于 ${address.port}`);
    });

    worker.on('exit', (code, signal) => {
        const reason = worker.exitedAfterDisconnect ? '主动终止' : `意外退出 [${code || signal}]`;
        logger.warn(`工作进程 ${worker.process.pid} ${reason}`);

        if (!worker.exitedAfterDisconnect && !isShuttingDown) {
            const newWorker = cluster.fork();
            workers.set(newWorker.process.pid, newWorker);
            setupWorkerHooks(newWorker);
        }
    });
}

function initWorkerServer() {
    const startTime = Date.now();
    const server = app.listen(config.SERVER.PORT, () => {
        logger.info(`工作进程 ${process.pid} 启动成功 (${((Date.now() - startTime) / 1000).toFixed(2)}s)`);
    });

    // 连接管理
    const connections = new Set();
    server.on('connection', (conn) => {
        connections.add(conn);
        conn.on('close', () => connections.delete(conn));
    });

    // 避免内存泄漏警告
    server.setMaxListeners(20);
    return { server, connections };
}

function setupWorkerGracefulShutdown({ server, connections }) {
    let isShuttingDown = false;

    const gracefulShutdown = (signal) => {
        if (isShuttingDown) return;
        isShuttingDown = true;

        logger.warn(`工作进程 ${process.pid} 收到 ${signal}，正在关闭...`);

        // 1. 停止接受新连接
        server.closeIdleConnections();
        server.close(async () => {
            // 2. 关闭现有连接
            connections.forEach(conn => conn.destroy());

            // 3. 清理资源
            await cleanupResources();

            logger.info(`工作进程 ${process.pid} 关闭完成`);
            process.exit(0);
        });

        // 强制超时
        setTimeout(() => {
            logger.error(`工作进程 ${process.pid} 强制终止`);
            process.exit(1);
        }, 10000);
    };

    // 信号处理
    process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.once('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('message', (msg) => msg === 'shutdown' && gracefulShutdown('cluster'));

    // 异常处理
    process.on('uncaughtException', (err) => {
        logger.error(`未捕获异常 @ ${process.pid}:`, err);
        gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
        logger.error(`未处理拒绝 @ ${process.pid}:`, reason);
    });
}

async function cleanupResources() {
    const tasks = [];

    if (redisClient) tasks.push(redisClient.quit().catch(logger.error));
    if (dbPool) tasks.push(dbPool.end().catch(logger.error));

    await Promise.allSettled(tasks);
}