const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('redis');
const { ExpressPeerServer } = require("peer");
const redisAdapter = require('@socket.io/redis-adapter');

const app = express();
const httpServer = require("http").createServer(app);
const io = require("socket.io")(httpServer);
const peerServer = ExpressPeerServer(httpServer, {
  debug: true,
});

const publicDirectoryPath = path.join(__dirname, '../public');
app.use("/peerjs", peerServer);
app.use('/public', express.static(publicDirectoryPath));

const pubClient = createClient({
    host: process.env.REDIS_ENDPOINT || 'localhost',
    port: process.env.REDIS_PORT || 6379
});

if (process.env.REDIS_PASSWORD) {
    pubClient.auth(process.env.REDIS_PASSWORD);
}

const subClient = pubClient.duplicate();
io.adapter(redisAdapter(pubClient, subClient));

app.get('/:id', (req, res) => {
    const fileDirectory = path.join(__dirname, '../');
    res.sendFile('index.html', { root: fileDirectory }, (err) => {
        if (err) {
            console.error(err);
            throw err;
        }
        res.end();
    });
});

app.get('/', (req, res) => {
    res.redirect(307, '/' + uuidv4());
});

io.on("connection", socket => {
    console.log('Socket connected:', socket.id);

    socket.on('content_change', (data) => {
        const room = data.documentId;
        socket.to(room).emit('content_change', data.changes);
    });

    socket.on('register', function (data) {
        const room = data.documentId;
        socket.nickname = data.handle;
        socket.join(room);
        let members = [];
        for (const clientId of io.sockets.adapter.rooms.get(room)) {
            members.push({
                id: clientId,
                name: io.sockets.sockets.get(clientId).nickname
            });
        }
        console.log(members);
        io.in(room).emit('members', members);
        socket.to(room).emit('register', { id: socket.id, name: data.handle });
    });

    socket.on("join-room", (roomId, userId, userName) => {
        socket.join(roomId);
        socket.broadcast.to(roomId).emit("user-connected", userId);
        socket.on("message", (message) => {
            io.to(roomId).emit("createMessage", message, userName);
            console.log(userName);
        });
    });

    socket.on("message", (data) => {
        console.log(data);
        io.to(data.id).emit("createMessage", data.message, data.name);
        console.log(data.name);
    });

    socket.on('disconnect', function () {
        console.log("Disconnected");
        socket.broadcast.emit('user_left', { id: socket.id });
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log('Server is up on port ' + PORT);
});
