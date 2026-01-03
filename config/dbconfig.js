// config.js  MySQL 数据库配置文件

module.exports = {
    host: 'localhost', // 服务器地址
    port: 3306, // 端口
    user: 'admin', // 数据库用户名
    password: '5100', // 数据库密码
    database: 'JIuLiuTOP', // 数据库名称
    waitForConnections: true, // 当连接池无可用连接时，等待（true）还是抛错（false）
    connectionLimit: 10, // 连接池限制
    queueLimit: 0 // 最大连接请求队列限制，0 为不限制
};
