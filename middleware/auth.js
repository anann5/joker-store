const activeTokens = new Map();

const verifyAdmin = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'غير مصرح' });

    const token = authHeader.split(' ')[1];
    const session = activeTokens.get(token);

    if (!session || session.expiresAt < Date.now()) {
        return res.status(401).json({ error: 'انتهت الجلسة' });
    }
    next();
};

module.exports = { verifyAdmin, activeTokens };
