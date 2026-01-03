const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const cors = require('cors');
const express = require('express');
const crypto = require('crypto');
// 增强的安全HTTP头配置
const secureHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "trusted.cdn.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "cdn.example.com"],
            connectSrc: ["'self'", "http://localhost:8080"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"]
        }
    },
    hsts: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true
});

// 动态CORS配置
const getCorsOptions = () => {
    const origins = process.env.NODE_ENV === 'production'
        ? [
            'https://jiuliu.top',
            'https://www.jiuliu.top',
            'https://api.jiuliu.top'
        ]
        : [
            'http://localhost:3001',
            'https://jiuliu.top',
            'https://www.jiuliu.top',
            'https://api.jiuliu.top'
        ];

    return {
        origin: (origin, callback) => {
            if (!origin || origins.includes(origin)) {
                callback(null, true);
            } else {
                console.warn(`非法请求来源: ${origin}`);
                callback(new Error('非法请求来源'), false);
            }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Request-ID',
            'X-Encryption-Key',
            'X-Encryption-Info'
        ],
        credentials: true,
        maxAge: 86400
    };
};

// 分层API限流配置
const apiLimiters = {
    encryptionKey: rateLimit({
        windowMs: 5 * 60 * 1000, // 5分钟
        max: 600,// 每个IP最多

        skip: req => req.ip === '::1' // 本地开发不限流
    }),
    generalApi: rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 600,

        skip: req => req.method === 'OPTIONS'
    })
};

// 增强的HPP配置
const preventParamPollution = hpp({
    whitelist: [
        'page',
        'limit',
        'sort',
        'fields'
    ]
});

// 请求日志中间件
const requestLogger = (req, res, next) => {
    const requestId = req.headers['x-request-id'] || crypto.randomUUID();
    req.requestId = requestId;

    console.log(`[${requestId}] ${req.method} ${req.path}`, {
        ip: req.ip,
        headers: {
            'x-encryption-info': req.headers['x-encryption-info'],
            'x-encryption-key': req.headers['x-encryption-key']
        }
    });

    res.setHeader('X-Request-ID', requestId);
    next();
};

module.exports = {
    secureHeaders,
    getCorsOptions,
    apiLimiters,
    preventParamPollution,
    requestLogger,
    // 应用安全中间件
    applySecurity: (app) => {
        // 1. 基础安全中间件
        app.use(helmet());

        // 2. CORS配置（必须放在靠前位置）
        const corsOptions = getCorsOptions();
        app.use(cors(corsOptions));
        app.options('*', cors(corsOptions));

        // 4. 请求日志
        app.use(requestLogger);

        // 5. 限流中间件
        app.use('/admin/encryption-key', apiLimiters.encryptionKey);
        app.use('/', apiLimiters.generalApi);

        // 6. 防止参数污染
        app.use(preventParamPollution);

        // 7. 安全响应头
        app.use((req, res, next) => {
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');
            next();
        });
    }
};