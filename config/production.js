// config/production.js
module.exports = {
    // 服务器配置
    SERVER: {
        PORT: 8080, // 服务器端口
        CLUSTER: false, // 是否启用集群模式
        TRUST_PROXY: true // 信任代理头
    },

    // 数据库配置
    DATABASE: {
        POOL: {
            CONNECTION_LIMIT: 20, // 连接池限制
            QUEUE_LIMIT: 1000, // 最大连接请求队列限制
            ACQUIRE_TIMEOUT: 30000 // 30秒
        }
    },

    // 监控配置
    MONITORING: {
        ENABLED: true, // 是否启用监控
        NEW_RELIC_LICENSE_KEY: process.env.NEW_RELIC_LICENSE_KEY, // New Relic 许可证密钥
        SENTRY_DSN: process.env.SENTRY_DSN // Sentry DSN
    },

    // 性能优化
    PERFORMANCE: {
        RESPONSE_COMPRESSION: true, // 是否启用响应压缩
        CACHE_ENABLED: true, // 是否启用缓存
        QUERY_CACHE_TIME: 3600 // 1小时
    }
};