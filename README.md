# 服务器文档

## 文件结构
server.js - 主服务器启动文件
app.js - Express应用配置文件


## 启动服务器

### 配置数据库
将Sql文件上传到mysql中,打开config文件夹下的dbconfig.js文件,修改正确的数据库配置
```
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

```
### 启动服务器
下载依赖的库文件
```
npm i
```
安装好node（v20.15.0）后,启动服务器
```
node server.js
```
