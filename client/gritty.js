'use strict';

require('xterm/dist/xterm.css');
require('../css/gritty.css');

require('xterm/dist/addons/fit');

const currify = require('currify/legacy');

const getEl = require('./get-el');
const getHost = require('./get-host');
const getEnv = require('./get-env');
const timeout = require('./timeout');
const wrap = require('wraptile/legacy');

const onConnect = wrap(_onConnect);
const onDisconnect = wrap(_onDisconnect);
const onData = currify(_onData);
const onTermResize = currify(_onTermResize);
const onTermData = currify(_onTermData);
const onWindowResize = wrap(_onWindowResize);

const io = require('socket.io-client/dist/socket.io.min');

window.Promise = window.Promise || require('promise-polyfill');
window.fetch = window.fetch || require('whatwg-fetch');

const Terminal = require('xterm/dist/xterm');

module.exports = gritty;
module.exports._onConnect = _onConnect;
module.exports._onDisconnect = _onDisconnect;
module.exports._onData = _onData;
module.exports._onTermResize = _onTermResize;
module.exports._onTermData = _onTermData;
module.exports._onWindowResize = _onWindowResize;

function gritty(element, options = {}) {
    const el = getEl(element);
    
    const socketPath = options.socketPath || '';
    const prefix = options.prefix || '/gritty';
    const env = getEnv(options.env || {});
    
    const socket = connect(prefix, socketPath);
    
    return createTerminal(el, {
        env,
        socket,
    });
}

function createTerminal(terminalContainer, {env, socket}) {
    const terminal = new Terminal({
        scrollback: 1000,
        tabStopWidth: 4,
        theme: 'gritty',
    });
    
    terminal.open(terminalContainer);
    terminal.fit();
    
    terminal.on('resize', onTermResize(socket));
    terminal.on('data', onTermData(socket));
    
    window.addEventListener('resize', onWindowResize(terminal))
    
    const {cols, rows} = terminal.proposeGeometry()
    
    // auth check delay
    socket.on('connect', timeout(onConnect(socket, {env, cols, rows})));
    socket.on('disconnect', onDisconnect(terminal));
    socket.on('data', onData(terminal));
    
    return {
        socket,
        terminal
    };
}

function _onConnect(socket, {env, cols, rows}) {
    socket.emit('terminal', {env, cols, rows});
    socket.emit('resize', {cols, rows});
}

function _onDisconnect(terminal) {
    terminal.writeln('terminal disconnected...');
}

function _onData(terminal, data) {
    terminal.write(data);
}

function _onTermResize(socket, {cols, rows}) {
    socket.emit('resize', {cols, rows});
}

function _onTermData(socket, data) {
    socket.emit('data', data);
}

function _onWindowResize(terminal) {
    terminal.fit();
}

function connect(prefix, socketPath) {
    const href = getHost();
    const FIVE_SECONDS = 5000;
    
    const path = socketPath + '/socket.io';
    const socket = io.connect(href + prefix, {
        'max reconnection attempts' : Math.pow(2, 32),
        'reconnection limit'        : FIVE_SECONDS,
        path
    });
    
    return socket;
}

