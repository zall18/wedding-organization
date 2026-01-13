const { PrismaClient } = require("@prisma/client");
const bcrypt = require('bcrypt');
const { json } = require("express");
const jwt = require('jsonwebtoken');
const { route } = require("../../routes/authRoutes");

const prisma = new PrismaClient();
const SECRET_KEY = process.env.JWT_SECRET || "kunci_api";

const register = async (req, res) => {
    const {name, email, password, role} = req.body;

    try {
        const existingUser = await prisma.user.findUnique({
            where: {
                email
            }
        });

        if(existingUser) {
            res.status(400).json({
                msg: "Email already used"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.user.create({
            data: {
                name: name,
                email: email, 
                password: hashedPassword,
                role: role || "ADMIN"
            }
        });

        res.status(201).json({
            "msg" : "Register berhasil"
        });

    } catch (e) {
        res.status("500").json({
            "msg" : "server error"
        });
    }
}

const login = async (req, res) => {
    const {email, password} = req.body;

    try {
        const user = await prisma.user.findFirst({
            where : {
                email
            }
        });

        if(!user) {
            res.status(404).json({
                msg: "User can't be found"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if(!isMatch) {
            res.status(400).json({
                msg: "Email or password not match"
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            },
            SECRET_KEY,
            {
                expiresIn : "1d"
            }
        );

        res.status(200).json({
            msg: "Success to login",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch(e) {
        res.status(500).json({msg: e});
    }
}

module.exports = { register, login };
