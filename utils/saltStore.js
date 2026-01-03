const { query } = require('../config/database');
const crypto = require('crypto');

module.exports = {
    /**
     * 设置账号盐值（有效期5分钟）
     * @param {string} account - 用户账号
     * @param {string} salt - 随机盐值
     */
    setSalt: async (account, salt) => {
        await query(
            `INSERT INTO login_salts (account, salt, expires_at) 
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))
             ON DUPLICATE KEY UPDATE 
                salt = VALUES(salt), 
                expires_at = VALUES(expires_at)`,
            [account, salt]
        );
    },

    /**
     * 获取有效的账号盐值
     * @param {string} account - 用户账号
     * @returns {Promise<string|null>} 盐值或null
     */
    getSalt: async (account) => {
        const [rows] = await query(
            `SELECT salt FROM login_salts 
             WHERE account = ? AND expires_at > NOW()`,
            [account]
        );
        return rows[0]?.salt || null;
    },

    /**
     * 清理过期的盐值记录
     */
    cleanExpiredSalts: async () => {
        await query(
            `DELETE FROM login_salts WHERE expires_at <= NOW()`
        );
    },

    /**
     * 生成随机盐值
     * @returns {string} 16字节的hex字符串
     */
    generateSalt: () => crypto.randomBytes(16).toString('hex')
};