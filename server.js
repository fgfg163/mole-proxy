var net = require('net');
var netio = require('./netio');

module.exports = function(port) {
    var server = net.createServer({allowHalfOpen: false}, function(connection) {
        var dedicatedServer;
        var writer = netio.writer(connection);
        var endClientTable = {};
        var endClientId = 0;
        var handler = {};
        handler[netio.INIT] = function(data) {
            dedicatedServer = net.createServer(function(endClient) {
                var uid = endClientId++;
                var uidBuffer = new Buffer(2);
                var ended = false;
                if (endClientId > 65530) {
                    endClientId = 0;
                }
                uidBuffer.writeUInt16LE(uid);
                endClientTable[uid] = endClient;
                writer.write(netio.CONNECT, uidBuffer);
                endClient.on('data', function(endClientData) {
                    if (!ended) {
                        var ptr = 0;
                        while (ptr < endClientData.length) {
                            var len = Math.min(4096, endClientData.length - ptr);
                            writer.write(netio.END_CLIENT_DATA, Buffer.concat([uidBuffer, netio.subBuffer(endClientData, ptr, len)]));
                            ptr += len;
                        }
                    }
                });
                endClient.on('end', function() {
                    if (!ended) {
                        ended = true;
                        writer.write(netio.END_CLIENT_END, uidBuffer);
                    }
                });
                endClient.on('error', function() {});
                endClient.on('close', function() {
                    delete endClientTable[uid];
                    if (!ended) {
                        ended = true;
                        writer.write(netio.END_CLIENT_END, uidBuffer);
                    }
                });
            });
            var sourcePort = data.readUInt16LE(0);
            console.log('Punch hole on ' + sourcePort);
            dedicatedServer.listen(sourcePort);
            dedicatedServer.on('error', function() {
                writer.write(netio.ERROR, 'Failed to listen, port maybe occupied');
                connection.end();
            });
        };
        handler[netio.END_CLIENT_DATA] = function(data) {
            var endClient = endClientTable[data.readUInt16LE(0)];
            endClient && endClient.write(netio.subBuffer(data, 2));
        };
        handler[netio.END_CLIENT_END] = function(data) {
            var endClient = endClientTable[data.readUInt16LE(0)];
            endClient && endClient.end();
        };
        handler[netio.ALIVE] = function(data) {
            writer.write(netio.ALIVE);
        };
        netio.reader(connection, function(mark, data) {
            if (!dedicatedServer && (mark != netio.INIT || data.length != 2)) {
                console.log(mark, data);
                connection.end();
            } else {
                handler[mark] && handler[mark](data);
            }
        }, function() {
            if (dedicatedServer) {
                dedicatedServer.close();
            }
        });
    });
    server.on('error', function(err) {
        console.error(err.stack);
    });
    server.listen(port, function() {
        console.log('Listening...');
    });
}