const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const security = require('../config/security');

// JWT验证中间件
const authenticateJWT = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const requestId = req.headers['x-request-id'] || 'unknown';

    console.log(`[请求ID: ${requestId}] 开始JWT认证流程`);
    console.log(`[请求ID: ${requestId}] 请求路径: ${req.method} ${req.originalUrl}`);

    if (!token) {
        console.error(`[请求ID: ${requestId}] 错误: 请求头中未包含认证Token`);
        return res.status(401).json({
            code: 401,
            msg: "未提供认证Token",
            requestId
        });
    }

    try {
        console.log(`[请求ID: ${requestId}] 正在验证Token签名和有效期...`);
        const decoded = jwt.verify(token, security.AUTH.JWT_SECRET);
        console.log(`[请求ID: ${requestId}] Token验证通过, 用户ID: ${decoded.id}`);

        // 检查token是否被撤销(可选)
        console.log(`[请求ID: ${requestId}] 正在检查Token是否有效...`);
        const tokenValid = await query(
            'SELECT 1 FROM admin WHERE token = ? AND account = ? AND expires_at > NOW()',
            [token, decoded.id]
        );

        if (!tokenValid || tokenValid.length === 0) {
            console.error(`[请求ID: ${requestId}] 错误: Token已被撤销或已过期`);
            return res.status(403).json({
                code: 403,
                msg: "Token已失效",
                requestId
            });
        }

        console.log(`[请求ID: ${requestId}] Token状态验证通过`);
        // 将用户信息附加到请求对象
        req.user = decoded;
        next();
    } catch (err) {
        console.error(`[请求ID: ${requestId}] Token验证失败:`, err.message);

        if (err.name === 'TokenExpiredError') {
            console.error(`[请求ID: ${requestId}] 错误: Token已过期`);
            return res.status(403).json({
                code: 403,
                msg: "Token已过期",
                requestId
            });
        }

        console.error(`[请求ID: ${requestId}] 错误: 无效的Token`, err.stack);
        return res.status(403).json({
            code: 403,
            msg: "无效的Token",
            requestId
        });
    }
};

// 角色检查中间件
const checkRole = (roles) => {
    return async (req, res, next) => {
        const requestId = req.headers['x-request-id'] || 'unknown';

        console.log(`[请求ID: ${requestId}] 开始角色检查流程`);
        console.log(`[请求ID: ${requestId}] 需要验证的角色: ${roles.join(', ')}`);

        if (!req.user) {
            console.error(`[请求ID: ${requestId}] 错误: 请求中未包含用户信息`);
            return res.status(401).json({
                code: 401,
                msg: "未认证用户",
                requestId
            });
        }

        try {
            console.log(`[请求ID: ${requestId}] 正在查询用户角色, 用户ID: ${req.user.id}`);
            const userRoles = await query(
                'SELECT role FROM admin WHERE account = ?',
                [req.user.id]
            );

            console.log(`[请求ID: ${requestId}] 用户当前角色: ${userRoles.map(r => r.role).join(', ')}`);
            const hasRole = userRoles.some(userRole => roles.includes(userRole.role));

            if (!hasRole) {
                console.error(`[请求ID: ${requestId}] 错误: 用户缺少所需角色权限`);
                return res.status(403).json({
                    code: 403,
                    msg: "权限不足",
                    requestId
                });
            }

            console.log(`[请求ID: ${requestId}] 角色验证通过`);
            next();
        } catch (err) {
            console.error(`[请求ID: ${requestId}] 角色检查错误:`, err.message, err.stack);
            res.status(500).json({
                code: 500,
                msg: "服务器内部错误",
                requestId
            });
        }
    };
};

module.exports = { authenticateJWT, checkRole };