var argv = process.argv.slice(2);
var adapter;

if (argv[0] == 'udp') {
    argv = argv.slice(1);
    adapter = require('./udpio');
} else {
    adapter = require('./tcpio');
}

if (argv.length == 2 && argv[0] == 'server') {
    if (Math.floor(argv[1]) == argv[1]) {
        require('./server')(adapter, argv[1]);
    } else {
        console.log('Listen port must be a integer');
    }
} else if (argv.length >= 3) {
    if (!argv[3]) {
        argv[3] = argv[2];
    }
    if (Math.floor(argv[1]) == argv[1] && Math.floor(argv[2]) == argv[2] && Math.floor(argv[3]) == argv[3]) {
        require('./client')(adapter, argv[0], argv[1], argv[2], argv[3]);
    } else {
        console.log('All ports should be integers');
    }
} else {
    console.log('Usage:');
    console.log('    mole-proxy [udp] server <server tunnel port>');
    console.log(' or');
    console.log('    mole-proxy [udp] <server> <server tunnel port> <local destination port> [server source port]');
}

