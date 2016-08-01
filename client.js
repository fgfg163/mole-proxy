var net = require('net');
var netio = require('./netio');

module.exports = function(server, serverPort, destinationPort, sourcePort) {
    var connection = net.createConnection({
        host: server,
        port: serverPort,
    });
    var writer = netio.writer(connection);
    var connections = {};
    setInterval(function() {
        writer.write(netio.ALIVE);
    }, 5000).unref();
    var sourcePortBuffer = new Buffer(2);
    sourcePortBuffer.writeUInt16LE(sourcePort - 0, 0);
    writer.write(netio.INIT, sourcePortBuffer);

    var handler = {};
    handler[netio.CONNECT] = function(data) {
        var uidBuffer = data;
        var uid = data.readUInt16LE(0), ended = false;
        var conn = net.connect({
            host: '127.0.0.1',
            port: destinationPort,
        });
        conn.on('data', function(data) {
            var ptr = 0;
            while (ptr < data.length) {
                var len = Math.min(4096, data.length - ptr);
                writer.write(netio.END_CLIENT_DATA, Buffer.concat([uidBuffer, netio.subBuffer(data, ptr, len)]));
                ptr += len;
            }
        });
        conn.on('end', function() {
            if (!ended) {
                ended = true;
                writer.write(netio.END_CLIENT_END, uidBuffer);
            }
        });
        conn.on('close', function() {
            delete connections[uid];
            if (!ended) {
                ended = true;
                writer.write(netio.END_CLIENT_END, uidBuffer);
            }
        });
        conn.on('error', function(err) {
            console.error(err.stack);
        });
        connections[uid] = conn;
    };
    handler[netio.END_CLIENT_DATA] = function(data) {
        var conn = connections[data.readUInt16LE(0)];
        conn && conn.write(netio.subBuffer(data, 2));
    };
    handler[netio.END_CLIENT_END] = function(data) {
        var conn = connections[data.readUInt16LE(0)];
        conn && conn.end();
    };
    handler[netio.ERROR] = function(data) {
        console.error(data.toString());
    };
    netio.reader(connection, function(mark, data) {
        handler[mark] && handler[mark](data);
    }, function() {
        console.log('Exiting');
        process.exit(0);
    });
}