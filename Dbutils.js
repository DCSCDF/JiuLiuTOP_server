
const SnowFlake = require('./utils/SnowFlake');

// 初始化雪花算法 ID 生成器
const genid = new SnowFlake({ WorkerId: 1 });

// 导出对象
module.exports = { genid };



