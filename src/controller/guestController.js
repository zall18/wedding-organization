const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const createQuest = async(req, res) => {
    const {name, phone, invitedPax, eventId} = req.body;
    const category = req.body.category || "Reguler";

    try {
        const event = await prisma.event.findFirst({
            where: {
                id : eventId
            }
        });

        if(!event) {
            res.status(404).json({
                msg: "Event not found"
            });
        }

        const guest = await prisma.guest.create({
            data: {
                name, 
                phone,
                invitedPax,
                eventId,
                category,

            }
        });

        res.status(201).json({
            msg: "Success to add guest",
            guest
        });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error"
        });
    }
}

const searchQuest = async(req, res) => {
    const { q, eventId, category, status } = req.query;

    try {
        const quests = await prisma.guest.findMany({
            where: {
                eventId: parseInt(eventId),
                OR : [
                    {
                        name: {
                        contains: q,
                        mode: "insensitive"
                    }
                    },
                    {
                        phone: {
                            contains: q
                        }
                    }
                ]

            }
        });

        res.status(200).json({
            msg: "Success to search",
            quests
        });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error"
        });
    }
}

const confirmGuest = async(req, res) => {
    const id = req.params.id;
    try{

        const guest = await prisma.guest.findFirst({
            where: {
                id: parseInt(id)
            }
        });

        if(!guest) {
            res.status(404).json({
                msg: "Guest not found"
            });
        }

        await prisma.guest.update({
            where : {
                id : parseInt(id)
            },
            data : {
                status: "CONFIRMED"
            }
        });

        res.status(200).json({
            msg: "Success to update status to confirmed",
        });
    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error"
        });
    }
}

module.exports = {createQuest, searchQuest, confirmGuest};