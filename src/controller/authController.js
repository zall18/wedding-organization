const { PrismaClient } = require("@prisma/client");
const bcrypt = require('bcrypt');
const { json } = require("express");
const jwt = require('jsonwebtoken');
const { route } = require("../../routes/authRoutes");

const prisma = new PrismaClient();
const SECRET_KEY = process.env.SECRET_KEY || "kunci_api";

const register = async (req, res) => {
    const {name, email, password, role, eventId} = req.body;

    try {

        if(req.user.role == "ORGANIZER" && role == "ADMIN") {
            return res.status(400).json({
                msg : "Organizer can only create staff account"
            });
        }
        

        const existingUser = await prisma.user.findUnique({
            where: {
                email
            }
        });

        if(existingUser) {
            return res.status(400).json({
                msg: "Email already used"
            });
        }

        if(role == "ORGANIZER" && !eventId) {
            return res.status(400).json({
                msg: "Organizer need an event to handle"
            });
        }

        if(role == "ADMIN" && eventId) {
            return res.status(400).json({
                msg: "Admin doesn't need event"
            });
        }

        if(eventId) {
            const event = await prisma.event.findFirst({
                where : {
                    id : eventId
                }
            });
            if(!event) {
                return res.status(400).json({
                    msg: "Event not found"
                });
            }
        }
        console.log(parseInt(req.user.eventId));

        if(req.user.role == "ORGANIZER" && (parseInt(req.user.eventId) != eventId)) {
            return res.status(400).json({
                msg: "Organizer can register account only in his event"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const regData = await prisma.user.create({
            data: {
                name: name,
                email: email, 
                password: hashedPassword,
                role: role,
                eventId
            }
        });

        return res.status(201).json({
            "msg" : "Register berhasil",
            data : regData
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
            return res.status(404).json({
                msg: "User can't be found"
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if(!isMatch) {
            return res.status(400).json({
                msg: "Email or password not match"
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                eventId: user.eventId
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
