-- phpMyAdmin SQL Dump
-- version 4.8.5
-- https://www.phpmyadmin.net/
--
-- 主机： localhost
-- 生成日期： 2025-02-26 13:42:47
-- 服务器版本： 8.0.12
-- PHP 版本： 7.0.9

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET AUTOCOMMIT = 0;
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- 数据库： `jiuliutop`
--

-- --------------------------------------------------------

--
-- 表的结构 `admin`
--

CREATE TABLE `admin` (
  `id` bigint(20) NOT NULL DEFAULT '0',
  `account` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  `password` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  `token` varchar(100) COLLATE utf8_unicode_ci DEFAULT NULL,
  `img_url` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  `email` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

--
-- 转存表中的数据 `admin`
--

INSERT INTO `admin` (`id`, `account`, `password`, `token`, `img_url`, `email`) VALUES
(1, 'admin', '1012414217', '0ead7528-6d76-45e5-9645-b1da02eb8530', 'https://www.jiuliu.top/img/JiuLiu.jpg', '3209174373@qq.com');

-- --------------------------------------------------------

--
-- 表的结构 `blog`
--

CREATE TABLE `blog` (
  `id` bigint(20) NOT NULL DEFAULT '0',
  `category_id` bigint(20) DEFAULT NULL,
  `title` varchar(200) COLLATE utf8_unicode_ci DEFAULT NULL,
  `content` text COLLATE utf8_unicode_ci,
  `create_time` bigint(20) DEFAULT NULL,
  `img_url` varchar(200) COLLATE utf8_unicode_ci DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

--
-- 转存表中的数据 `blog`
--

INSERT INTO `blog` (`id`, `category_id`, `title`, `content`, `create_time`, `img_url`) VALUES
(666165360074821, 664576823009349, '代码测试', '<p style=\"text-align: start; line-height: 1;\">盘上的 <span style=\"color: var(--tw-prose-bold);\"><strong>Ctrl+Z</strong></span> ，或在快速访问工具栏上选择“<span style=\"color: var(--tw-prose-bold);\"><strong>撤消</strong></span> ”。 如果要撤消多个步骤，可以重复按撤消 (或 Ctrl+Z) 。</p><p style=\"text-align: start; line-height: 1;\"><span style=\"color: var(--tw-prose-bold);\"><strong>注意: </strong></span>有关快速访问工具栏的详细信息，请参阅<a href=\"https://support.microsoft.com/zh-cn/office/%E8%87%AA%E5%AE%9A%E4%B9%89%E5%BF%AB%E9%80%9F%E8%AE%BF%E9%97%AE%E5%B7%A5%E5%85%B7%E6%A0%8F-43fff1c9-ebc4-4963-bdbd-c2b6b0739e52\" target=\"\">自定义快速访问工具栏</a>。</p><p style=\"text-align: start; line-height: 1;\">无法撤消某些操作，例如在“ <span style=\"color: var(--tw-prose-bold);\"><strong>文件</strong></span> ”选项卡上选择命令或保存文件。 如果无法撤消某操作，“<span style=\"color: var(--tw-prose-bold);\"><strong>撤消</strong></span>”命令将更改为“<span style=\"color: var(--tw-prose-bold);\"><strong>无法撤消</strong></span>”。</p><p style=\"text-align: start; line-height: 1;\">若要同时撤消多个操作，请选择“ <span style=\"color: var(--tw-prose-bold);\"><strong>撤消</strong></span> ”旁边的箭头，在列表中选择要撤</p><pre><code class=\"language-go\">const highlightCode = () =&gt; {\n    document.querySelectorAll(\'pre code\').forEach((block) =&gt; {\n        hljs.highlightBlock(block);\n    });\n};</code></pre><p><br></p>', 1740474827362, 'http://localhost:8080/upload/666428848255045.png');

-- --------------------------------------------------------

--
-- 表的结构 `category`
--

CREATE TABLE `category` (
  `id` bigint(20) NOT NULL DEFAULT '0',
  `name` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- 表的结构 `links`
--

CREATE TABLE `links` (
  `id` bigint(20) NOT NULL DEFAULT '0',
  `title` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  `content` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  `url` varchar(200) COLLATE utf8_unicode_ci DEFAULT NULL,
  `img_url` varchar(200) COLLATE utf8_unicode_ci DEFAULT NULL,
  `create_time` bigint(20) DEFAULT NULL
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- --------------------------------------------------------

--
-- 表的结构 `settings`
--

CREATE TABLE `settings` (
  `id` bigint(20) NOT NULL DEFAULT '0',
  `webname` varchar(50) COLLATE utf8_unicode_ci DEFAULT NULL,
  `webcontent` varchar(200) CHARACTER SET utf8 COLLATE utf8_unicode_ci DEFAULT NULL,
  `webcopyright` varchar(200) COLLATE utf8_unicode_ci DEFAULT NULL,
  `linkcontent` text COLLATE utf8_unicode_ci,
  `linktitle` mediumtext COLLATE utf8_unicode_ci
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

--
-- 转存表中的数据 `settings`
--

INSERT INTO `settings` (`id`, `webname`, `webcontent`, `webcopyright`, `linkcontent`, `linktitle`) VALUES
(1, 'JIULIUTOP', '究极牛马，二次元老登，影视行业从业者。会时不时在这里分享一些技术方面的文章或者发一些生活记录。本博客由博主独立开发，如果想获取源码，可以加我qq：3209174373。', '© Copyright 2021 JiuLiu All Rights Reserved.<br>鲁ICP备2022035476号-1 鲁公网安备37068702000241号', '本站链接信息：<br>名称：久流的个人小站<br>网址：https://jiuliu.top/<br>简介：借由他人,寻找自我<br>头像地址：https://www.jiuliu.top/img/JiuLiu.jpg', '申请之后，我将在一周左右通过，同时我也会定时清理无法访问的网站请保持畅通，换了域名请重新提交。申请前请先加上本站链接,禁止一切产品营销、广告联盟类型的网站。留言板暂时在开发中，加我qq添加友链：3209174373。');

--
-- 转储表的索引
--

--
-- 表的索引 `admin`
--
ALTER TABLE `admin`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `blog`
--
ALTER TABLE `blog`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `category`
--
ALTER TABLE `category`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `links`
--
ALTER TABLE `links`
  ADD PRIMARY KEY (`id`);

--
-- 表的索引 `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
