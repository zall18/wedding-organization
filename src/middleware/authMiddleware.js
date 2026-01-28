const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.SECRET_KEY;

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    console.log("AUTH HEADER:", req.headers.authorization);

    if(!authHeader) {
        return res.status(401).json({
            msg: "Unauthorized"
        });
    }

    const token = authHeader.split(" ")[1];

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