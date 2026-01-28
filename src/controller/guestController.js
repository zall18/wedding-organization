const { PrismaClient } = require('@prisma/client');
const { connect } = require('../../routes');
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

        const isNumber = /^\d+$/.test(q);

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
                    ...(isNumber
                        ? [{
                            phone : {
                                contains : q
                            }
                        }]
                        : []
                    )
                ]
            },
            take: 10, 
            orderBy: {
                name: "asc"
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

const checkinHandler = async(req, res) => {
    const {qrCode, guestId, arrivedPax, method} = req.body;
    const eventId = parseInt(req.params.eventId);

    if(!method) {
        res.status(400).json({
            msg: "Method is required"
        });
    }

    if(method == "QR" && !qrCode) {
        res.status(400).json({
            msg: "QR code is required"
        });
    }

    if(method == "SEARCH" && !guestId) {
        res.status(400).json({
            msg: "Guest ID is required"
        });
    }


    try {

        const event = await prisma.event.findFirst({
            where : {
                id : eventId
            }
        });

        if(!event) {
            return res.status(404).json({
                msg: "Event not found",
            });
        }

        let guest;

        if(method == "QR") {
            guest = await prisma.guest.findFirst({
                where : {
                    eventId,
                    qrCode
                }
            });
        } else {
            guest = await prisma.guest.findFirst({
                where : {
                    eventId,
                    id: guestId
                }
            });
        }

        if(!guest) {
            return res.status(404).json({
                msg: "Invalid QR or guest not found"
            });
        } 

        if(guest.status == "PRESENT") {
            return res.status(400).json({
                msg: "This guest already check-in"
            });
        } 

        if(!arrivedPax ||arrivedPax < 1) {
            return res.status(400).json({
                msg: "Arrived Tax athleast have 1"
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            const updateResult = await tx.guest.update({
                where: {
                    id: guest.id
                },
                data : {
                    status : "PRESENT",
                    arrivedPax,
                    checkInTime: new Date(),
                    
                }
            });
            const checkIn = await tx.checkInLog.create({
                data : {
                    arrivedPax,
                    method,
                    
                    guest : {
                        connect : {
                            id : guest.id
                        }
                    },
                    event : {
                        connect : {
                            id : event.id
                        }
                    }
                    
                }
            });

            return { updateResult, checkIn};
        })

        return res.status(200).json({
            msg: "Success to check-in",
            guest: result.updateResult
        });

    } catch(e) {
        console.log(e);
        return res.status(500).json({
            msg: "Server error"
        });
    }
}

const undoCheckin = async(req, res) => {
    const id = parseInt(req.params.id);

    try {

        const guest = await prisma.guest.findFirst({
            where : {
                id
            }
        });

        if(!guest) {
            return res.status(404).json({
                msg: "Guest not found"
            });
        }

        const log = await prisma.checkInLog.findFirst({
            where : {
                guestId : guest.id
            }
        });

        console.log(guest);

        if(!log) {
             return res.status(400).json({
                msg: "this guest already not present"
            });
        }

        const result = await prisma.$transaction(async (tx) => {
            const updateGuest = await tx.guest.update({
                where : {
                    id : guest.id
                },
                data : {
                    status : "PENDING",
                    arrivedPax : 0,
                    checkInTime: null
                }
            });

            const removeLog = await tx.checkInLog.delete({
                where : {
                    id : log.id
                }
            });

            return {updateGuest, removeLog};
        });

        res.status(200).json({
            msg: "Success to undo checkin",
            guest : result.updateGuest
        });

    } catch(e) {
        console.log(e);
        res.status(500).json({
            msg: "Server error"
        });
    }
}

const checkinHistory = async(req, res) => {
    const eventId = parseInt(req.params.eventId);
    const method = req.query.method;

    try {

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

        const logCheckin = await prisma.checkInLog.findMany({
            where : {
                eventId : event.id
            }
        });

        return res.status(200).json({
            msg: "Success to get all history",
            history : logCheckin
        });

    } catch(e) {
        console.log(e);
        return res.status(500).json({
            msg: "Server error"
        });
    }


}


module.exports = {createQuest, searchQuest, confirmGuest, checkinHandler, undoCheckin, checkinHistory};