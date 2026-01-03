// /​**​
//  * 安全配置模块
//  * 包含加密、认证、JWT等相关安全功能
//  * 使用环境变量优先，无环境变量则使用安全默认值
//  */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const { log } = require('console');

// 主配置对象
const securityConfig = {
    // 加密配置
    CRYPTO: {
        // PBKDF2 密钥派生配置
        PBKDF2: {
            ITERATIONS: 310000,
            KEY_LENGTH: 32,
            DIGEST: 'sha512'
        },

        // AES 加密配置
        AES: {
            ALGORITHM: 'aes-256-gcm',
            IV_LENGTH: 12,
            SALT: '4bd-3tg2-jxiwda'
        },
    },

    // 认证配置
    AUTH: {
        JWT_SECRET: crypto.randomBytes(32).toString('hex'),
        ACCESS_TOKEN_EXPIRY: '1h',
        REFRESH_TOKEN_EXPIRY: '7d',
        MAX_LOGIN_ATTEMPTS: 5,
        LOCK_TIME: 10 * 60 * 1000
    },

    // 密码哈希函数
    hashPassword: async (password) => {
        const saltRounds = 12;
        return await bcrypt.hash(password, saltRounds);
    },

    // 密码验证函数
    comparePassword: async (password, hash) => {
        return await bcrypt.compare(password, hash);
    },

    // 生成JWT访问令牌
    generateJWT: (payload) => {
        return jwt.sign(
            payload,
            securityConfig.AUTH.JWT_SECRET,
            {
                expiresIn: securityConfig.AUTH.ACCESS_TOKEN_EXPIRY,
                algorithm: 'HS256'
            }
        );
    },

    // 生成JWT刷新令牌
    generateRefreshToken: (payload) => {
        return jwt.sign(
            payload,
            securityConfig.AUTH.JWT_SECRET,
            {
                expiresIn: securityConfig.AUTH.REFRESH_TOKEN_EXPIRY,
                algorithm: 'HS256'
            }
        );
    },

    // 验证JWT令牌
    verifyJWT: (token) => {
        return jwt.verify(token, securityConfig.AUTH.JWT_SECRET);
    },

    generateRandomString: (length = 16) => { // 修改默认长度
        return crypto.randomBytes(Math.ceil(length / 2))
            .toString('hex')
            .slice(0, length);
    },

    decryptData: (encryptedData, key) => {
        // 严格参数校验
        const requiredFields = ['ciphertext', 'iv', 'tag'];
        for (const field of requiredFields) {
            if (!encryptedData[field] || typeof encryptedData[field] !== 'string') {
                throw new Error(`Missing or invalid ${field}`);
            }
        }

        try {
            // 转换所有参数
            const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
            const iv = Buffer.from(encryptedData.iv, 'base64');
            const tag = Buffer.from(encryptedData.tag, 'base64');
            const keyBuffer = Buffer.from(key, 'hex');

            // 验证长度
            if (iv.length !== 12) throw new Error('IV must be 12 bytes');
            if (tag.length !== 16) throw new Error('Tag must be 16 bytes');
            if (keyBuffer.length !== 16) throw new Error('Key must be 16 bytes');

            // 创建解密器
            const decipher = crypto.createDecipheriv(
                'aes-128-gcm',
                keyBuffer,
                iv,
                { authTagLength: 16 } // 明确标签长度
            );

            // 设置认证标签
            decipher.setAuthTag(tag);

            // 执行解密
            let decrypted = decipher.update(ciphertext, null, 'utf8');
            decrypted += decipher.final('utf8');

            console.log(`解密得到的数据${decrypted}`);
            return decrypted;
        } catch (err) {
            console.error('[Decrypt Failed]', {
                input: {
                    iv: encryptedData.iv,
                    ciphertextLength: encryptedData.ciphertext?.length,
                    tagLength: encryptedData.tag?.length,
                    key: key?.slice(0, 6) + '...'
                },
                error: err.message
            });
            throw new Error(`Decryption failed: ${err.message}`);
        }
    },
    /** 
     * 准备传输密码哈希
     * @param {string} password - 原始密码
     * @param {string} salt - 盐值
     * @returns {Promise<string>} 传输用的密码哈希(十六进制格式)
     */
    preparePasswordForTransport: async (password, salt) => {
        try {
            // 确保输入有效
            if (!password || !salt) {
                throw new Error('密码和盐值不能为空');
            }

            // 使用SHA-256哈希
            const hash = crypto.createHash('sha256')
                .update(password + salt) // 密码+盐值组合
                .digest('hex'); // 转为十六进制字符串

            return hash.toLowerCase(); // 统一返回小写格式
        } catch (err) {
            console.error('[密码哈希错误]', err);
            throw new Error('密码处理失败');
        }
    },

};

// 配置验证
if (!securityConfig.AUTH.JWT_SECRET || securityConfig.AUTH.JWT_SECRET.length < 32) {
    console.warn('[安全警告] JWT密钥长度不足32字节，建议设置更长的JWT_SECRET环境变量');
}

module.exports = securityConfig;