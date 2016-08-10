const dgram = require('dgram');
const EventEmitter = require('events').EventEmitter;

exports.frameSize = 400;

exports.createServer = function (cb) {
    return {
        listen: function(port, func) {
            bind(port).listen(cb);
            func && func();
        },
        on: function() {},
    }
};

exports.createConnection = function (opt) {
    return bind(30000 + Math.floor(Math.random() * 10000))
        .connect(opt.port, opt.host);
};

const pendingConnections = [];
const connections = {};
const signHeader = new Buffer('MoLe');

function bind(port) {
    var sock = dgram.createSocket('udp4');
    sock.bind(port, '0.0.0.0');
    var listen = false;
    sock.on('message', function (msg, remote) {
        // console.log(msg, remote.port);
        if (msg.length < 6 || msg.toString('utf8', 0, 4) !== 'MoLe') {
            // ignore malicious packet
            return;
        }
        var mark = msg[4], connId, conn;
        if (msg[4]) {
            connId = msg[5];
            if (listen) {
                connId -= 120;
            } else {
                connId += 120;
            }
            conn = connections[connId];
        }
        switch(mark) {
        case 0: // connect attempt
            if (listen) {
                for (connId = 1; connId < 120 && connections[connId]; connId++);
                if (connId < 200) {
                    var buffer = new Buffer(7);
                    signHeader.copy(buffer, 0, 0, 4);
                    buffer[4] = 1; // approve connect attempt
                    buffer[5] = connId; // send free connect id
                    var placeholder = connections[connId] = {
                        placeholder: true,
                        peerAddr: remote.address,
                        peerPort: remote.port
                    };
                    sock.send(buffer, remote.port, remote.address);
                    placeholder.timeout = setTimeout(function() {
                        if (connections[connId] === placeholder) {
                            delete connections[connId];
                        }
                    }, 10000);
                    placeholder.timeout.unref();
                }
            }
            break;
        case 1: // connect approval
            for (var i = 0; i < pendingConnections.length; i++) {
                var candidate = pendingConnections[i];
                if (candidate.address == remote.address && candidate.port == remote.port) {
                    conn = connections[connId] = candidate.conn;
                    conn.connected(connId, sock, remote);
                    pendingConnections.splice(i, 1);
                    break;
                }
            }
            break;
        case 2: // end signal
            conn && conn.peerEnd();
            break;
        case 3: // end signal ACK
            conn && !conn.placeholder && conn.endAck();
            break;
        case 4: // data chunk
            if (listen && conn && conn.placeholder && conn.peerAddr == remote.address && conn.peerPort == remote.port) {
                clearTimeout(conn.timeout);
                conn = connections[connId] = new Connection();
                conn.connected(connId, sock, remote);
                listen(conn);
            }
        case 5: // data chunk ACK
            if (conn && !conn.placeholder) {
                if (mark == 4) {
                    var data = new Buffer(msg.length - 7);
                    msg.copy(data, 0, 7, msg.length);
                    conn.peerData(msg[6], data);
                } else {
                    conn.ack(msg[6]);
                }
            } else {
                var buffer = new Buffer(7);
                signHeader.copy(buffer, 0, 0, 4);
                buffer[4] = 2;
                buffer[5] = connId;
                sock.send(buffer, remote.port, remote.addr);
            }
            break;
        }
        conn && !conn.placeholder && conn.alive();
    });
    sock.on('error', function(err) {
        console.error(err.stack);
    });
    return {
        connect(port, host) {
            var conn = new Connection();
            var attempt = {
                conn: conn,
                sock: sock,
                address: host,
                port: port,
                timestamp: Date.now(),
            };
            pendingConnections.push(attempt);
            return conn;
        },
        listen(cb) {
            listen = cb;
        }
    };
}

function emitConnect(attempt) {
    if (Date.now() - attempt.timestamp > 800) {
        attempt.timestamp = Date.now();
        var sendBuffer = new Buffer(7);
        signHeader.copy(sendBuffer, 0, 0, 4);
        sendBuffer[4] = 0;
        attempt.sock.send(sendBuffer, attempt.port, attempt.address);
    }
}

function heartBeat() {
    Object.keys(connections).forEach(id => {
        setImmediate(() => {
            var conn = connections[id];
            conn && !conn.placeholder && conn.beat();
        });
    });
    pendingConnections.forEach(emitConnect);
    setTimeout(heartBeat, 200).unref();
}

var heartBeatStarted = false;

class Connection extends EventEmitter {
    constructor() {
        super();
        if (!heartBeatStarted) {
            heartBeat();
        }
        this.pendingQueue = [];
        this.ackBench = [];
        this.benchWndEnd = 0;
        this.benchWndStart = 0;
        this.rcvBuffer = [];
        this.rcvWndPtr = 0;
        this.ended = false;
        this.timestamp = Date.now();
    }
    beat() {
        if (this.timestamp + 10000 < Date.now()) {
            this._close(true);
            return;
        }
        if (this.ended && !this.endAcked && this.benchWndStart == this.benchWndEnd && this.pendingQueue.length == 0) {
            var sendBuffer = new Buffer(7);
            signHeader.copy(sendBuffer, 0, 0, 4);
            sendBuffer[4] = 2;
            sendBuffer[5] = this.connId;
            this._send(sendBuffer);
        } else {
            var waterMark = Date.now() - 800;
            for (var i = this.benchWndStart; i != this.benchWndEnd; i = this._nextPtr(i)) {
                var item = this.ackBench[i];
                if (item.timestamp < waterMark) {
                    item.retry++;
                    item.timestamp = Date.now() + 500 * item.retry;
                    this._sendPack(i);
                }
            }
        }
    }
    alive() {
        this.timestamp = Date.now();
    }
    connected(id, sock, remote) {
        if (this.connId) {
            throw new Error('Connection can not be connected 2nd time');
        }
        this.connId = id;
        this.sock = sock;
        this.remote = remote;
        this._deliver();
    }
    write(data) {
        if (!Buffer.isBuffer(data)) {
            throw new Error('Can only write an instance of Buffer');
        }
        if (this.ended) {
            console.warn('Can not write after end');
            return;
        }
        this.pendingQueue.push(data);
        this._deliver();
    }
    peerData(packId, data) {
        var sendBuffer = new Buffer(7);
        signHeader.copy(sendBuffer, 0, 0, 4);
        sendBuffer[4] = 5;
        sendBuffer[5] = this.connId;
        sendBuffer[6] = packId;
        this._send(sendBuffer);

        var diff = packId - this.rcvWndPtr;
        if (diff < 0) {
            diff += 250;
        }
        if (diff > 100) {
            // console.log('dispose', packId);
            return;
        }
        this.rcvBuffer[packId] = data;
        while (this.rcvBuffer[this.rcvWndPtr]) {
            this.emit('data', this.rcvBuffer[this.rcvWndPtr]);
            this.rcvBuffer[this.rcvWndPtr] = null;
            this.rcvWndPtr = this._nextPtr(this.rcvWndPtr);
        }
    }
    ack(packId) {
        delete this.ackBench[packId];
        while (!this.ackBench[this.benchWndStart] && this.benchWndEnd != this.benchWndStart) {
            this.benchWndStart = this._nextPtr(this.benchWndStart);
        }
        this._deliver();
    }
    peerEnd() {
        if (!this.peerEnded) {
            this.peerEnded = true;
            this.emit('end');
            this.end();
            this._close();
        }
        var sendBuffer = new Buffer(7);
        signHeader.copy(sendBuffer, 0, 0, 4);
        sendBuffer[4] = 3;
        sendBuffer[5] = this.connId;
        this._send(sendBuffer);
    }
    end() {
        this.ended = true;
        this._deliver();
    }
    endAck() {
        this.endAcked = true;
        this._close();
    }
    _close(force) {
        if (this._closed) {
            return;
        }
        if (force || (this.endAcked && this.peerEnded)) {
            if (connections[this.connId] === this) {
                delete connections[this.connId];
            }
            this.ended = true;
            this.endAcked = true;
            this.peerEnded = true;
            this._closed = true;
            this.emit('close');
        }
    }
    _deliver() {
        if (!this.connId) {
            return;
        }
        while (this.pendingQueue.length && this._benchLen() < 100) {
            this.ackBench[this.benchWndEnd] = {
                data: this.pendingQueue.shift(),
                timestamp: Date.now(),
                retry: 0,
            };
            this._sendPack(this.benchWndEnd);
            this.benchWndEnd = this._nextPtr(this.benchWndEnd);
        }
    }
    _sendPack(packId) {
        var dataBuffer = this.ackBench[packId].data;
        var sendBuffer = new Buffer(dataBuffer.length + 7);
        signHeader.copy(sendBuffer, 0, 0, 4);
        sendBuffer[4] = 4;
        sendBuffer[5] = this.connId;
        sendBuffer[6] = packId;
        dataBuffer.copy(sendBuffer, 7, 0, dataBuffer.length);
        this._send(sendBuffer);
    }
    _send(data) {
        this.sock.send(data, this.remote.port, this.remote.address);
    }
    _nextPtr(num) {
        num++;
        if (num >= 250) {
            num = 0;
        }
        return num;
    }
    _benchLen() {
        var ret = this.benchWndEnd - this.benchWndStart;
        if (ret < 0) {
            ret += 250;
        }
        return ret;
    }
}

