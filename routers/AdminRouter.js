const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
console.log('[AdminRouter] 管理员用户路由模块初始化完成');

// 使用/config/database.js中的数据库操作函数
// query - 执行SQL查询
// transaction - 执行事务操作
const { query, transaction } = require('../config/database');


// 使用/config/security.js中的安全相关函数
// 包含密码加密、JWT生成、数据解密等功能
const security = require('../config/security');


// 使用perf_hooks模块计算请求处理时间
const { performance } = require('perf_hooks');


// 使用express-rate-limit实现请求限流
const rateLimit = require('express-rate-limit');


// 使用/middleware/authMiddleware.js中的JWT认证中间件
// authenticateJWT - 验证JWT token有效性
const { authenticateJWT: authenticateToken } = require('../middleware/authMiddleware');


// 使用/middleware/security.js中的CORS配置函数
// getCorsOptions - 获取CORS配置
const { getCorsOptions } = require('../middleware/security');
const { password } = require('../config/dbconfig');


const { setSalt, generateSalt, cleanExpiredSalts } = require('../utils/saltStore');
const { log } = require('console');


// 登录请求限流配置(5分钟内最多20次尝试)
const loginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5分钟窗口期
    max: 50, // 最多20次请求
    message: '尝试次数过多，请稍后再试',
});



router.get('/auth/salt', async (req, res) => {
    const requestId = security.generateRandomString(8);
    const { account } = req.query;

    console.log(`[${requestId}] [Salt请求] 开始处理`, { account });

    try {
        // 1. 参数验证
        if (!account || typeof account !== 'string') {
            console.warn(`[${requestId}] 无效的账号参数`);
            return res.status(400).json({
                code: 400,
                msg: "账号参数无效",
                requestId
            });
        }

        // 2. 数据库查询
        console.log(`[${requestId}] 查询数据库获取盐值`);
        const [user] = await query(
            `SELECT salt, server_salt FROM admin WHERE account = ? LIMIT 1`,
            [account]
        );

        // 3. 处理查询结果
        if (!user) {
            console.warn(`[${requestId}] 账号不存在: ${account}`);
            return res.status(404).json({
                code: 404,
                msg: "账号不存在",
                requestId
            });
        }

        // 4. 返回盐值
        console.log(`[${requestId}] 成功获取盐值`);
        res.json({
            code: 200,
            data: {
                salt: user.salt,
                //serverSalt: "" // 如果需要
            },
            requestId
        });

    } catch (err) {
        console.error(`[${requestId}] 获取盐值失败:`, err.stack);
        res.status(500).json({
            code: 500,
            msg: "服务器内部错误",
            requestId,
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// POST /login 登录接口（安全增强版）
router.post('/login', loginLimiter, async (req, res) => {
    const startTime = performance.now();
    const requestId = security.generateRandomString(8);
    console.log(`[${requestId}] 开始处理安全登录请求`);

    try {
        // 基础验证
        const { account, transportHash } = req.body;
        const encryptionKey = req.headers['x-encryption-key'];

        if (!account || !transportHash || !encryptionKey) {
            console.warn(`[${requestId}] 缺少必要参数`);
            return res.status(400).json({
                code: 400,
                msg: "请求参数不完整",
                requestId
            });
        }

        // 解密传输数据
        let decryptedAccount;
        try {
            decryptedAccount = await security.decryptData(account, encryptionKey);
        } catch (decryptErr) {
            console.warn(`[${requestId}] 账号解密失败`, decryptErr);
            return res.status(400).json({
                code: 400,
                msg: "数据传输异常",
                requestId
            });
        }

        // 查询用户信息
        console.log(`[${requestId}] 查询用户: ${decryptedAccount}`);
        const [user] = await query(
            `SELECT id, account, password, COALESCE(salt, '') as salt, server_salt, login_attempts, lock_until 
             FROM admin WHERE account = ? LIMIT 1`,
            [decryptedAccount]
        );

        // 验证用户数据
        if (!user || !user.salt) {
            console.error(`[${requestId}] 无效的用户数据:`, {
                hasUser: !!user,
                hasSalt: user?.salt,
                userId: user?.id
            });
            return res.status(401).json({
                code: 401,
                msg: "认证失败",
                requestId
            });
        }

        //检查账号锁定状态
        if (user.lock_until && new Date(user.lock_until) > new Date()) {
            const remainingMinutes = Math.ceil((new Date(user.lock_until) - new Date()) / 1000 / 60);
            console.warn(`[${requestId}] 账号锁定中，剩余: ${remainingMinutes}分钟`);
            return res.status(403).json({
                code: 403,
                msg: `账号已锁定，请${remainingMinutes}分钟后再试`,
                requestId
            });
        }

        // 解密传输的密码哈希
        let decryptedTransportHash;
        try {
            decryptedTransportHash = await security.decryptData(transportHash, encryptionKey);
        } catch (decryptErr) {
            console.warn(`[${requestId}] 密码解密失败`, decryptErr);
            await query(
                'UPDATE admin SET login_attempts = login_attempts + 1 WHERE id = ?',
                [user.id]
            );
            return res.status(401).json({
                code: 401,
                msg: "认证失败",
                requestId
            });
        }

        // 验证密码
        console.log(`[${requestId}] 密码验证参数:`, {
            input: `${decryptedAccount} + ${user.salt.slice(0, 6)}...`,
            receivedHash: decryptedTransportHash.slice(0, 12) + '...'
        });

        // 在密码验证部分添加详细调试信息
        console.log(`[${requestId}] 哈希计算详情:`, {
            password: user.password,
        });

        console.log(`[${requestId}] 预期哈希: ${user.password}`);
        console.log(`[${requestId}] 接收哈希: ${decryptedTransportHash}`);

        // 验证数据库密码
        const isPasswordValid = await bcrypt.compare(
            decryptedTransportHash + user.server_salt, // 注意：这里的server_salt是存储在数据库中的盐
            user.password
        );
        if (!isPasswordValid) {
            console.warn(`[${requestId}] 密码验证失败`);
            return res.status(401).json({
                code: 401,
                msg: "认证失败",
                requestId
            });
        }

        // const accessToken = security.generateJWT({
        //     id: user.id,
        //     account: user.account,
        //     authType: 'enhanced'
        // });

        const refreshToken = security.generateRefreshToken({
            id: user.id,
            account: user.account
        });

        // 更新登录状态
        await transaction(async (conn) => {
            await query(
                `UPDATE admin SET 
                login_attempts = 0, 
                lock_until = NULL, 
                last_login = NOW(),
                last_ip = ? 
                WHERE id = ?`,
                [req.ip, user.id]
            );
            await query(
                `UPDATE admin SET 
                token = ?, 
                expires_at = ?, 
                login_method = ? 
                WHERE id = ?`,
                [
                    refreshToken,          // 对应 token = ?
                    new Date(Date.now() + 3600 * 1000),  // 对应 expires_at = ?
                    'secure',             // 对应 login_method = ?
                    user.id               // 对应 WHERE id = ?
                ]
            );
        });

        // 9. 返回响应
        const responseTime = performance.now() - startTime;
        console.log(`[${requestId}] 安全登录成功，耗时: ${responseTime.toFixed(2)}ms`);

        res.json({
            code: 200,
            msg: "登录成功",
            data: {
                token: //accessToken,
                    refreshToken,
                // user: {
                //     id: user.id,
                //     account: user.account
                // }
            },
            requestId,
            responseTime: `${responseTime.toFixed(2)}ms`
        });

    } catch (err) {
        console.error(`[${requestId}] 安全登录异常:`, err);
        res.status(500).json({
            code: 500,
            msg: "服务器内部错误",
            requestId,
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// GET /encryption-key 获取加密密钥接口
router.get('/encryption-key', loginLimiter, async (req, res) => {
    // 使用security.generateRandomString生成请求ID
    const requestId = security.generateRandomString(8);
    console.log(`[${new Date().toISOString()}] 开始处理加密密钥请求, ID: ${requestId}`);

    try {

        const origin = req.get('origin');
        console.log(`[${requestId}] 请求来源: ${origin}`);

        // 使用security.generateRandomString生成加密密钥
        const encryptionKey = security.generateRandomString(32);
        console.log(`[${requestId}] 生成的加密密钥: ${encryptionKey}`);

        res.json({
            code: 200,
            msg: "success",
            data: {
                key: encryptionKey,
                expiresIn: 60,
                generatedAt: new Date().toISOString()
            },
            requestId
        });
        console.log(`[${requestId}] 加密密钥请求处理完成`);
    } catch (err) {
        console.error(`[${requestId}] 加密密钥请求处理失败:`, err);
        res.status(500).json({
            code: 500,
            msg: "服务器内部错误",
            requestId
        });
    }
});

router.post('/change-password', authenticateToken, async (req, res) => {
    const startTime = performance.now();
    const requestId = security.generateRandomString(8);
    console.log(`[${requestId}] 开始处理修改密码请求`);

    try {
        // 1. 基础验证
        const { newPasswordHash } = req.body;
        const encryptionKey = req.headers['x-encryption-key'];

        if (!newPasswordHash || !encryptionKey) {
            console.warn(`[${requestId}] 缺少必要参数`);
            return res.status(400).json({
                code: 400,
                msg: "请求参数不完整",
                requestId
            });
        }

        // 2. 从JWT中获取用户信息
        const { id, account } = req.user;
        console.log(`[${requestId}] 用户修改密码: ${account} (ID: ${id})`);

        // 3. 生成新的服务器盐值
        const newServerSalt = crypto.randomBytes(16).toString('hex');

        // 4. 计算新密码的存储哈希（前端哈希 + 新服务器盐）
        const finalNewPasswordHash = await bcrypt.hash(
            newPasswordHash + newServerSalt,
            10
        );

        // 5. 更新数据库中的密码和盐值
        await transaction(async (conn) => {
            await query(
                `UPDATE admin 
                 SET password = ?, 
                     server_salt = ?,
                     updated_at = NOW(),
                     token = NULL, 
                     expires_at = NULL
                 WHERE id = ?`,
                [finalNewPasswordHash, newServerSalt, id]
            );
        });

        // 6. 返回成功响应
        const responseTime = performance.now() - startTime;
        console.log(`[${requestId}] 密码修改成功，耗时: ${responseTime.toFixed(2)}ms`);

        res.json({
            code: 200,
            msg: "密码修改成功",
            data: {
                account: account,
                changedAt: new Date().toISOString()
            },
            requestId,
            responseTime: `${responseTime.toFixed(2)}ms`
        });

    } catch (err) {
        console.error(`[${requestId}] 修改密码异常:`, err);
        res.status(500).json({
            code: 500,
            msg: "修改密码过程中发生错误",
            requestId,
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// POST /refresh 刷新令牌接口
router.post('/refresh', async (req, res) => {
    // 使用security.generateRandomString生成请求ID
    const requestId = security.generateRandomString(8);
    console.log(`[${new Date().toISOString()}] 开始处理令牌刷新请求, ID: ${requestId}`);

    try {
        console.log(`[${requestId}] 开始验证刷新令牌`);
        // 使用security.verifyJWT验证刷新令牌
        const decoded = security.verifyJWT(req.body.refreshToken);
        console.log(`[${requestId}] 解码后的令牌数据:`, decoded);

        // 使用query函数检查令牌有效性
        const tokenRecord = await query(
            'SELECT * FROM token WHERE refresh_token = ? AND user_id = ? AND expires_at > NOW()',
            [req.body.refreshToken, decoded.id]
        );

        if (tokenRecord.length === 0) {
            console.warn(`[${requestId}] 无效的刷新令牌或已过期`);
            throw new Error('无效的刷新令牌');
        }
        console.log(`[${requestId}] 令牌验证通过`);

        // 使用security.generateJWT生成新的访问令牌
        const newAccessToken = security.generateJWT({
            id: decoded.id,
            account: decoded.account
        });
        console.log(`[${requestId}] 新访问令牌生成完成`);

        res.json({
            code: 200,
            msg: "Token刷新成功",
            data: {
                token: newAccessToken
            },
            requestId
        });
        console.log(`[${requestId}] 令牌刷新请求处理完成`);
    } catch (err) {
        console.error(`[${requestId}] 令牌刷新失败:`, err);
        res.status(403).json({
            code: 403,
            msg: "无效的Refresh Token",
            requestId
        });
    }
});



router.get('/check', authenticateToken, async (req, res) => {
    const startTime = performance.now();
    const requestId = security.generateRandomString(8);
    console.log(`[${requestId}] 开始处理登录状态验证请求`);

    try {
        // 1. 从JWT中获取用户信息
        const { id, account } = req.user;
        console.log(`[${requestId}] 验证用户: ${account} (ID: ${id})`);

        // 2. 查询数据库验证用户状态
        const [user] = await query(
            `SELECT id, account, last_login, last_ip 
             FROM admin 
             WHERE id = ? AND account = ?
             LIMIT 1`,
            [id, account]
        );

        // 3. 验证用户数据
        if (!user) {
            console.warn(`[${requestId}] 用户不存在或已被禁用`, {
                userId: id,
                account: account,
                hasUser: !!user
            });
            return res.status(401).json({
                code: 401,
                msg: "用户状态异常",
                requestId
            });
        }

        // 4. 检查登录时间是否合理（可选）
        const lastLogin = new Date(user.last_login);
        const now = new Date();
        const hoursSinceLastLogin = Math.abs(now - lastLogin) / 36e5;

        console.log(`[${requestId}] 登录状态详情:`, {
            lastLogin: user.last_login,
            lastIp: user.last_ip,
            hoursSinceLastLogin: hoursSinceLastLogin.toFixed(1)
        });

        // 5. 检查令牌有效期
        const tokenExp = req.user.exp * 1000; // JWT过期时间(毫秒)
        const remainingMinutes = Math.max(0, (tokenExp - Date.now()) / 1000 / 60);

        console.log(`[${requestId}] 令牌有效期检查:`, {
            expiresAt: new Date(tokenExp).toISOString(),
            remainingMinutes: remainingMinutes.toFixed(1)
        });

        // 6. 返回验证结果
        const responseTime = performance.now() - startTime;
        console.log(`[${requestId}] 登录状态验证成功，耗时: ${responseTime.toFixed(2)}ms`);

        res.json({
            code: 200,
            msg: "登录状态有效",
            data: {
                user: {
                    id: user.id,
                    account: user.account,
                    status: user.status
                },
                session: {
                    lastLogin: user.last_login,
                    lastIp: user.last_ip,
                    tokenExpiresIn: `${remainingMinutes.toFixed(0)}分钟`
                }
            },
            requestId,
            responseTime: `${responseTime.toFixed(2)}ms`
        });

    } catch (err) {
        console.error(`[${requestId}] 登录状态验证异常:`, err);
        res.status(500).json({
            code: 500,
            msg: "服务器内部错误",
            requestId,
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});





// POST /register 注册接口（仅允许空表时注册）
router.post('/register', async (req, res) => {
    const requestId = security.generateRandomString(8);
    console.log(`[${requestId}] 开始处理注册请求`);

    try {
        // 1. 检查是否已初始化
        const [tableStatus] = await query('SELECT COUNT(*) as count FROM admin');
        if (tableStatus.count > 0) {
            return res.status(403).json({
                code: 403,
                msg: "系统已初始化，不允许注册",
                requestId
            });
        }

        // 2. 验证输入参数
        const { account, password } = req.body;
        if (!account || !password) {
            return res.status(400).json({
                code: 400,
                msg: "账号和密码不能为空",
                requestId
            });
        }

        // 3. 生成双重盐值
        const transportSalt = crypto.randomBytes(16).toString('hex'); // 前端传输用盐
        const serverSalt = crypto.randomBytes(16).toString('hex');   // 后端存储用盐

        // 4. 计算传输哈希（前端加盐）
        const transportHash = crypto
            .createHash('sha256')
            .update(password + transportSalt) // 前端哈希：password + transportSalt
            .digest('hex')
            .toLowerCase();

        // 5. 计算存储密码（后端二次加盐 + bcrypt）
        const storageHash = await bcrypt.hash(
            transportHash + serverSalt, // 关键：传输哈希 + 后端盐
            10 // bcrypt cost factor
        );

        // 6. 创建账户（存储所有盐值）
        await query(`
            INSERT INTO admin 
            (account, password, salt, server_salt, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [account, storageHash, transportSalt, serverSalt]);

        console.log(`[${requestId}] 注册成功：首个管理员账户`);
        res.status(201).json({
            code: 201,
            msg: "系统初始化成功",
            data: { account },
            requestId
        });

    } catch (err) {
        console.error(`[${requestId}] 注册异常:`, err);
        res.status(500).json({
            code: 500,
            msg: err.message || "注册失败",
            requestId
        });
    }
});
// POST /logout 登出接口
router.post('/logout', authenticateToken, async (req, res) => {
    const startTime = performance.now();
    const requestId = security.generateRandomString(8);
    console.log(`[${requestId}] 开始处理登出请求`);

    try {
        // 1. 从JWT中获取用户信息
        const { id, account } = req.user;
        console.log(`[${requestId}] 用户登出: ${account} (ID: ${id})`);

        // 2. 清除数据库中的令牌信息
        await transaction(async (conn) => {
            // 清除refresh token
            await query(
                'UPDATE admin SET token = NULL, expires_at = NULL WHERE id = ?',
                [id]
            );

            // // 记录登出日志
            // await query(
            //     'INSERT INTO admin_logs (admin_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            //     [id, 'logout', req.ip, req.get('User-Agent') || '']
            // );
        });

        // 3. 返回成功响应
        const responseTime = performance.now() - startTime;
        console.log(`[${requestId}] 登出成功，耗时: ${responseTime.toFixed(2)}ms`);

        res.json({
            code: 200,
            msg: "登出成功",
            data: {
                account: account,
                logoutTime: new Date().toISOString()
            },
            requestId,
            responseTime: `${responseTime.toFixed(2)}ms`
        });

    } catch (err) {
        console.error(`[${requestId}] 登出异常:`, err);
        res.status(500).json({
            code: 500,
            msg: "登出过程中发生错误",
            requestId,
            error: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});
module.exports = router;