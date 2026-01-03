const express = require('express');
const router = express.Router();
const fileUpload = require('express-fileupload');
const path = require('path');
const fs = require('fs').promises;
const Jimp = require('jimp'); // 替换sharp为jimp
const { authenticateJWT, checkRole } = require('../middleware/authMiddleware');

// 启用文件上传中间件
router.use(fileUpload({
    useTempFiles: false,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
}));

const { v4: uuidv4 } = require('uuid');

// 图片上传路由
router.post("/rich_editor_upload",
    authenticateJWT,
    checkRole(['admin']),
    async (req, res) => {
        const requestId = uuidv4().slice(0, 8);
        const supportedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

        try {
            // 1. 检查文件是否存在
            if (!req.files || Object.keys(req.files).length === 0) {
                return res.status(400).json({
                    errno: 1,
                    message: "未收到上传文件"
                });
            }

            // 2. 获取上传文件
            const uploadedFile = req.files.files;
            const fileExt = path.extname(uploadedFile.name).toLowerCase();

            // 3. 验证文件类型
            if (!supportedExtensions.includes(fileExt)) {
                return res.status(400).json({
                    errno: 3,
                    message: `不支持的文件类型: ${fileExt || '未知'}`
                });
            }

            // 4. 生成安全文件名
            const safeFileName = `${uuidv4()}${fileExt}`;
            const uploadDir = path.join(process.cwd(), 'public', 'upload');
            const targetPath = path.join(uploadDir, safeFileName);

            // 5. 确保目录存在
            await fs.mkdir(uploadDir, { recursive: true });

            // 6. 使用Jimp处理图片
            const image = await Jimp.read(uploadedFile.data);

            // 调整图片大小
            if (image.bitmap.width > 1920 || image.bitmap.height > 1080) {
                const ratio = Math.min(1920 / image.bitmap.width, 1080 / image.bitmap.height);
                image.resize(
                    Math.floor(image.bitmap.width * ratio),
                    Math.floor(image.bitmap.height * ratio),
                    Jimp.RESIZE_BEZIER
                );
            }

            // 设置图片质量并保存
            const mimeType = `image/${fileExt.replace('.', '')}`;
            await image.quality(80).writeAsync(targetPath);

            // 7. 返回成功响应
            const fullUrl = `${req.protocol}://${req.get('host')}/upload/${safeFileName}`;
            res.json({
                errno: 0,
                data: {
                    url: fullUrl,
                    filename: safeFileName
                }
            });

        } catch (err) {
            console.error(`[${requestId}] 处理错误:`, err);
            res.status(500).json({
                errno: 2,
                message: "服务器处理异常"
            });
        }
    }
);

// 辅助函数：检查文件是否存在
async function fileExists(path) {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

// 删除图片API
router.delete("/delete/:filename", authenticateJWT, checkRole(['admin']), async (req, res) => {
    const requestId = Math.random().toString(36).substring(2, 8);

    try {
        const filename = req.params.filename;
        const filePath = path.join(process.cwd(), 'public', 'upload', filename);

        // 检查文件是否存在
        try {
            await fs.access(filePath);
        } catch (err) {
            return res.json({
                errno: 0,
                message: "文件已不存在",
                fileNotExist: true
            });
        }

        // 删除文件
        await fs.unlink(filePath);

        res.json({
            errno: 0,
            message: "文件删除成功",
            fileNotExist: false
        });

    } catch (err) {
        console.error(`[${requestId}] 删除失败:`, err.stack);
        res.status(500).json({
            errno: 5,
            message: "文件删除失败"
        });
    }
});

// 列出所有图片API
router.get("/images", async (req, res) => {
    const requestId = Math.random().toString(36).substring(2, 8);
    console.log(`[请求 ${requestId}] 收到获取图片列表请求`);

    try {
        const uploadDir = path.join(process.cwd(), 'public', 'upload');
        console.log(`[请求 ${requestId}] 扫描目录:`, uploadDir);

        const files = await fs.readdir(uploadDir);
        console.log(`[请求 ${requestId}] 找到文件数:`, files.length);

        const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase().substring(1);
            return ALLOWED_EXTENSIONS.includes(ext);
        });

        console.log(`[请求 ${requestId}] 有效图片数:`, imageFiles.length);

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const baseUrl = `${protocol}://${host}`;

        console.log(`[请求 ${requestId}] 生成基础URL:`, baseUrl);

        const imageUrls = imageFiles.map(file => ({
            filename: file,
            url: `${baseUrl}/upload/${file}`
        }));

        res.json({
            errno: 0,
            data: imageUrls
        });

    } catch (err) {
        console.error(`[请求 ${requestId}] 获取失败:`, err.stack);
        res.status(500).json({
            errno: 6,
            message: "获取图片列表失败",
            debug: process.env.NODE_ENV === 'development' ? err.message : null
        });
    }
});

module.exports = router;