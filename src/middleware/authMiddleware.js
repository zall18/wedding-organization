const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY;

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    const authCookies = req.cookies?.token;
    console.log("AUTH HEADER:", req.headers.authorization);
    console.log("AUTH cookies:", authCookies);

    if(!authHeader && !authCookies) {
        return res.status(401).json({
            msg: "Unauthorized"
        });
    }

    const token = authCookies || authHeader.split(" ")[1];

    if(!token) {
        return res.status(401).json({
            msg: "Invalid token format"
        });
    }

    try{
        const decoded = jwt.verify(token, SECRET_KEY);

        req.user = decoded;
        next();
    } catch(e) {
        res.status(401).json({
            msg: "invalid token"
        });
    }
}

module.exports = authMiddleware;