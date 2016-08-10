var I = 1;

exports.ALIVE               = I++;
exports.END                 = I++;
exports.INIT                = I++;
exports.INIT_FAIL           = I++;
exports.CONNECT             = I++;
exports.END_CLIENT_DATA     = I++;
exports.END_CLIENT_END      = I++;
exports.CONNECT             = I++;
exports.ERROR               = I++;

var BR = Buffer.from([10]);

exports.subBuffer = function(src, start, len) {
    start = start - 0 || 0;
    len = len || src.length - start;
    var ret = new Buffer(len);
    src.copy(ret, 0, start, start + len);
    return ret;
};

exports.writer = function(writable) {
    return {
        write: function(mark, data) {
            if (data) {
                data = Buffer.from(data);
                for (var i = 1; i < data.length; i++) {
                    data[i] ^= data[i - 1];
                }
            }
            var header = new Buffer(5);
            header[4] = mark;
            if (data && data.length > 0) {
                header.writeUInt32LE(data.length, 0);
                data = Buffer.concat([header, BR, data, BR]);
            } else {
                header.writeUInt32LE(0, 0);
                data = Buffer.concat([header, BR]);
            }
            try {
                writable.write(data);
            } catch(e) {
            }
        }
    }
};

exports.reader = function(readable, onData, onEnd) {
    var buffer = [], bufferLen = 0, wait = 0, mark, tPtr = 0;
    function debuffer(len) {
        if (bufferLen >= len + 1) {
            var ptr = 0;
            var bundle = new Buffer(len);
            while (ptr < len) {
                var top = buffer[0], clen = Math.min(top.length - tPtr, len - ptr);
                top.copy(bundle, ptr, tPtr, tPtr + clen);
                ptr += clen;
                bufferLen -= clen;
                tPtr += clen;
                if (tPtr == top.length) {
                    buffer.shift();
                    tPtr = 0;
                }
            }
            bufferLen--;
            tPtr++;
            if (tPtr == buffer[0].length) {
                buffer.shift();
                tPtr = 0;
            }
            return bundle;
        }
    }
    readable.on('data', function(chunk) {
        buffer.push(chunk);
        bufferLen += chunk.length;
        while (true) {
            if (wait > 0) {
                var chunk = debuffer(wait);
                if (chunk) {
                    wait = 0;
                    for (var i = chunk.length - 1; i > 0; i--) {
                        chunk[i] ^= chunk[i - 1];
                    }
                    onData(mark, chunk);
                } else {
                    break;
                }
            } else {
                var chunk = debuffer(5);
                if (chunk) {
                    wait = chunk.readUInt32LE(0);
                    if (wait > 5000) {
                        console.error('malicious request');
                        readable.end();
                        onEnd && onEnd();
                        onEnd = null;
                        return;
                    }
                    mark = chunk[4];
                    if (wait == 0) {
                        onData(mark);
                    }
                } else {
                    break;
                }
            }
        }
    });
    readable.on('end', function() {
        onEnd && onEnd();
        onEnd = null;
    });
    readable.on('error', function(err) {
        console.error(err.stack);
    });
    readable.on('close', function() {
        onEnd && onEnd();
        onEnd = null;
    });
};

