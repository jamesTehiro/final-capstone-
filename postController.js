const db = require("../models");
const { Op } = require("sequelize");

const postInclude = [
    {
        model: db.User,
        attributes: ["id", "name", "role", "admin_scope", "admin_avatar_url"],
        include: [
            { model: db.AlumniProfile, attributes: ["avatar_url"] },
            { model: db.EmployerProfile, attributes: ["logo_url", "organization_name"] }
        ]
    }
];

const DEFAULT_POST_PAGE_SIZE = Number(process.env.POSTS_PAGE_SIZE || 20);
const MAX_POST_PAGE_SIZE = Number(process.env.POSTS_MAX_PAGE_SIZE || 50);
const DEFAULT_COMMENT_PAGE_SIZE = Number(process.env.POST_COMMENTS_PAGE_SIZE || 10);
const MAX_COMMENT_PAGE_SIZE = Number(process.env.POST_COMMENTS_MAX_PAGE_SIZE || 30);

const parsePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const canEditPost = (user, post) => user?.id === post.user_id;

const canDeletePost = (user, post) => {
    if (user?.id === post.user_id) return true;
    return user?.role === "admin" && String(user?.admin_scope || "").toLowerCase() === "alumni";
};

exports.getPosts = async (req, res) => {
    try {
        const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_POST_PAGE_SIZE), MAX_POST_PAGE_SIZE);
        const cursor = parsePositiveInt(req.query.cursor, null);
        const where = cursor ? { id: { [Op.lt]: cursor } } : {};

        const posts = await db.Post.findAll({
            where,
            include: postInclude,
            order: [["id", "DESC"]],
            limit: limit + 1
        });

        const hasMore = posts.length > limit;
        const pageItems = hasMore ? posts.slice(0, limit) : posts;
        const postIds = pageItems.map((post) => post.id);

        let commentCounts = {};
        if (postIds.length) {
            const counts = await db.Comment.findAll({
                attributes: [
                    "post_id",
                    [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"]
                ],
                where: {
                    post_id: {
                        [Op.in]: postIds
                    }
                },
                group: ["post_id"],
                raw: true
            });

            commentCounts = counts.reduce((acc, item) => {
                acc[item.post_id] = Number(item.count || 0);
                return acc;
            }, {});
        }

        const items = pageItems.map((post) => {
            const plain = post.toJSON ? post.toJSON() : { ...post };
            plain.Comments = [];
            plain.comment_count = commentCounts[post.id] || 0;
            return plain;
        });

        res.json({
            items,
            next_cursor: hasMore ? pageItems[pageItems.length - 1]?.id || null : null,
            has_more: hasMore
        });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.createPost = async (req, res) => {
    try {
        const { text, image_url } = req.body;

        if (!text?.trim() && !image_url) {
            return res.status(400).json({ msg: "Post content is required" });
        }

        const post = await db.Post.create({
            user_id: req.user.id,
            text: text?.trim() || "",
            image_url: image_url || ""
        });

        const createdPost = await db.Post.findByPk(post.id, {
            include: postInclude
        });

        res.json(createdPost);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.getPostComments = async (req, res) => {
    try {
        const limit = Math.min(parsePositiveInt(req.query.limit, DEFAULT_COMMENT_PAGE_SIZE), MAX_COMMENT_PAGE_SIZE);
        const cursor = parsePositiveInt(req.query.cursor, null);
        const where = { post_id: req.params.postId };
        if (cursor) {
            where.id = { [Op.lt]: cursor };
        }

        const comments = await db.Comment.findAll({
            where,
            include: [
                {
                    model: db.User,
                    attributes: ["id", "name", "role", "admin_scope", "admin_avatar_url"],
                    include: [
                        { model: db.AlumniProfile, attributes: ["avatar_url"] },
                        { model: db.EmployerProfile, attributes: ["logo_url", "organization_name"] }
                    ]
                }
            ],
            order: [["id", "DESC"]],
            limit: limit + 1
        });

        const hasMore = comments.length > limit;
        const pageItems = hasMore ? comments.slice(0, limit) : comments;

        res.json({
            items: [...pageItems].reverse(),
            next_cursor: hasMore ? pageItems[pageItems.length - 1]?.id || null : null,
            has_more: hasMore
        });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.addPostComment = async (req, res) => {
    try {
        const { comment } = req.body;
        if (!comment || !comment.trim()) {
            return res.status(400).json({ msg: "Comment is required" });
        }

        const newComment = await db.Comment.create({
            post_id: req.params.postId,
            user_id: req.user.id,
            comment: comment.trim()
        });

        const fullComment = await db.Comment.findByPk(newComment.id, {
            include: [
                {
                    model: db.User,
                    attributes: ["id", "name", "role", "admin_scope", "admin_avatar_url"],
                    include: [
                        { model: db.AlumniProfile, attributes: ["avatar_url"] },
                        { model: db.EmployerProfile, attributes: ["logo_url", "organization_name"] }
                    ]
                }
            ]
        });

        res.json(fullComment);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.updatePost = async (req, res) => {
    try {
        const post = await db.Post.findByPk(req.params.postId);
        if (!post) return res.status(404).json({ msg: "Post not found" });

        if (!canEditPost(req.user, post)) {
            return res.status(403).json({ msg: "You can only edit your own post." });
        }

        const { text, image_url } = req.body;
        if (!String(text || "").trim() && !String(image_url || "").trim()) {
            return res.status(400).json({ msg: "Post content is required" });
        }

        post.text = String(text || "").trim();
        post.image_url = String(image_url || "").trim();
        await post.save();

        const updatedPost = await db.Post.findByPk(post.id, { include: postInclude });
        res.json(updatedPost);
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};

exports.deletePost = async (req, res) => {
    try {
        const post = await db.Post.findByPk(req.params.postId);
        if (!post) return res.status(404).json({ msg: "Post not found" });

        if (!canDeletePost(req.user, post)) {
            return res.status(403).json({ msg: "You are not allowed to delete this post." });
        }

        await db.Comment.destroy({ where: { post_id: post.id } });
        await post.destroy();

        res.json({ msg: "Post deleted." });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
};
