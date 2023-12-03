window.onload = function () {
    let socket;
    const documentId = new URL(window.location.href).pathname.split('/')[1] || 'test';
    let name = '';
    let user = '';
    let videoId = '';

    const handle = document.getElementById('handle');
    const register = document.getElementById('register');
    const registerPage = document.getElementById('registerPage');

    const editor = document.getElementById('editor');
    const textarea = document.getElementById('textarea');

    let syncValue = Array();
    let keypressed = false;

    var Codeeditor = CodeMirror.fromTextArea(textarea, {
        styleActiveLine: true,
        lineNumbers: true,
        matchBrackets: true,
        theme: 'cobalt',
        mode: 'auto',
    });

    function addEditor(writer) {
        var ul = document.getElementById('editors');
        var li = document.createElement('li');
        li.appendChild(document.createTextNode(writer.name));
        li.className = 'list-group-item';
        li.id = writer.id;
        ul.appendChild(li);
    }

    function removeElement(id) {
        var elem = document.getElementById(id);
        if (elem) {
            elem.parentNode.removeChild(elem);
        }
    }

    function applyLocalChanges() {
        if (keypressed) {
            let currentData = Codeeditor.getValue();
            let input = Array.from(syncValue);
            let output = Array.from(currentData);
            let changes = getChanges(input, output);
            applyChanges(input, changes);
            if (output.join('') == input.join('')) {
                socket.emit('content_change', {
                    documentId: documentId,
                    changes: changes
                });
                syncValue = input;
            }
            keypressed = false;
        }
    }

    function getChanges(input, output) {
        return diffToChanges(diff(input, output), output);
    }

    function applyChanges(input, changes) {
        changes.forEach(change => {
            if (change.type == 'insert') {
                input.splice(change.index, 0, ...change.values);
            } else if (change.type == 'delete') {
                input.splice(change.index, change.howMany);
            }
        });
    }

    function setSocketEvents() {
        socket.on('content_change', (incomingChanges) => {
            let input = Array.from(syncValue);
            applyChanges(input, incomingChanges);
            syncValue = input;
            applyLocalChanges();

            Codeeditor.setValue(syncValue.join(''));
        });

        socket.on('register', (data) => {
            addEditor(data);
            videoId = data.id;
        });

        socket.on('user_left', (data) => {
            removeElement(data.id);
        });

        socket.on('members', (members) => {
            members.forEach(member => {
                addEditor(member);
            });
            socket.off('members');
        });
    }

    function registerUserListener() {
        handle.style.display = 'none';
        register.style.display = 'none';
        registerPage.style.display = 'none';

        const editorBlock = document.getElementById('editor-block');
        editorBlock.style.display = 'flex';
        syncValue = '';

        name = handle.value;
        user = handle.value;
        socket.emit('register', {
            handle: handle.value,
            documentId: documentId
        });
        setSocketEvents();

        socket.on('createMessage', (message, userName) => {
            messages.innerHTML =
                messages.innerHTML +
                `<div class="message">
                    <b><i class="far fa-user-circle"></i> <span> ${
                        userName === user ? 'me' : userName
                    }</span> </b> 
                    <span>${message}</span>
                </div>`;
        });
    }

    register.addEventListener('click', registerUserListener);

    socket = io('/');
    const ROOM_ID = documentId;

    const videoGrid = document.getElementById('video-grid');
    const myVideo = document.createElement('video');
    myVideo.muted = true;

    var peer = new Peer(undefined, {
        path: '/peerjs',
        host: '/',
        port: '443',
    });

    let myVideoStream;

    navigator.mediaDevices
        .getUserMedia({
            audio: true,
            video: true,
        })
        .then((stream) => {
            myVideoStream = stream;
            addVideoStream(myVideo, stream);

            peer.on('call', (call) => {
                call.answer(myVideoStream);
                const video = document.createElement('video');
                call.on('stream', (userVideoStream) => {
                    addVideoStream(video, userVideoStream);
                });
            });

            socket.on('user-connected', (userId) => {
                connectToNewUser(userId, myVideoStream);
            });
        });

    const connectToNewUser = (userId, stream) => {
        const call = peer.call(userId, stream);
        const video = document.createElement('video');
        video.id = userId;
        call.on('stream', (userVideoStream) => {
            addVideoStream(video, userVideoStream);
        });
    };

    peer.on('open', (id) => {
        socket.emit('join-room', ROOM_ID, id, user);
    });

    const addVideoStream = (video, stream) => {
        video.srcObject = stream;
        video.addEventListener('loadedmetadata', () => {
            video.play();
            videoGrid.append(video);
        });
    };

    let text = document.querySelector('#chat_message');
    let send = document.getElementById('send');
    let messages = document.querySelector('.messages');

    send.addEventListener('click', (e) => {
        if (text.value.length !== 0) {
            socket.emit('message', {
                message: text.value,
                id: documentId,
                name: name
            });
            text.value = '';
        }
    });

    text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && text.value.length !== 0) {
            socket.emit('message', {
                message: text.value,
                id: documentId,
                name: name
            });
            text.value = '';
        }
    });

    const inviteButton = document.querySelector('#inviteButton');
    const muteButton = document.querySelector('#muteButton');
    const stopVideo = document.querySelector('#stopVideo');

    muteButton.addEventListener('click', () => {
        const enabled = myVideoStream.getAudioTracks()[0].enabled;
        myVideoStream.getAudioTracks()[0].enabled = !enabled;
        updateButtonState(muteButton, 'fas fa-microphone', 'fas fa-microphone-slash', enabled);
    });

    stopVideo.addEventListener('click', () => {
        const enabled = myVideoStream.getVideoTracks()[0].enabled;
        myVideoStream.getVideoTracks()[0].enabled = !enabled;
        updateButtonState(stopVideo, 'fas fa-video', 'fas fa-video-slash', enabled);
    });

    inviteButton.addEventListener('click', (e) => {
        prompt(
            'Copy this link and send it to people you want to meet with',
            window.location.href
        );
    });

    function updateButtonState(button, iconEnabled, iconDisabled, enabled) {
        const html = `<i class="${enabled ? iconEnabled : iconDisabled}"></i>`;
        button.classList.toggle('background__red');
        button.innerHTML = html;
    }
};
