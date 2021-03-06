'use strict';

const DIR_ROOT = __dirname + '/..';

const path = require('path');

const log = require('debug')('gritty');

const express = require('express');
const currify = require('currify/legacy');
const pty = require('node-pty');

const Router = express.Router;

const terminalFn = currify(_terminalFn);
const onConnection = currify(_onConnection);

const CMD = process.platform === 'win32' ? 'cmd.exe' : 'bash';
const isDev = process.env.NODE_ENV === 'development';
const wrap = (fn, ...args) => () => fn(...args);

const getDist = () => {
    if (isDev)
        return '/dist-dev';
    
    return '/dist';
}

module.exports = (options = {}) => {
    const router = Router();
    const prefix = options.prefix || '/gritty';
    
    router.route(prefix + '/*')
        .get(terminalFn(options))
        .get(staticFn)
    
    return router;
};

function _terminalFn(options, req, res, next) {
    const o = options || {};
    const prefix = o.prefix || '/gritty';
    
    req.url = req.url.replace(prefix, '');
    
    if (/^\/gritty\.js(\.map)?$/.test(req.url))
        req.url = getDist() + req.url;
    
    next();
}

function staticFn(req, res) {
    const file = path.normalize(DIR_ROOT + req.url);
    res.sendFile(file);
}

function createTerminal(env, cols = 80, rows = 24) {
    const term = pty.spawn(CMD, [], {
        name: 'xterm-color',
        cols,
        rows,
        cwd: process.env.PWD,
        env: Object.assign({}, process.env, env)
    });
    
    log(`Created terminal with PID: ${term.pid}`);
    
    return term;
}

module.exports.listen = (socket, options) => {
    options = options || {};
    check(socket, options);
    
    const prefix = options.prefix;
    const authCheck = options.authCheck;
    
    socket
        .of(prefix || '/gritty')
        .on('connection', (socket) => {
            const connection = wrap(onConnection, options, socket);
            
            if (!authCheck)
                return connection();
            
            authCheck(socket, connection);
        });
};

function check(socket, options) {
    if (!socket)
        throw Error('socket could not be empty!');
    
    const authCheck = options.authCheck;
    
    if (authCheck && typeof authCheck !== 'function')
        throw Error('options.authCheck should be a function!');
}

function _onConnection(options, socket) {
    let term;
    
    socket.on('terminal', onTerminal);
    
    const onResize = (size = {}) => {
        const {
            cols = 80,
            rows = 25,
        } = size;
        
        term.resize(cols, rows);
        log(`Resized terminal ${term.pid} to ${cols} cols and ${rows} rows.`);
    };
    
    const onData = (msg) => {
        term.write(msg);
    };
    
    function onTerminal({env, rows, cols} = {}) {
        term = createTerminal(env, rows, cols);
        
        term.on('data', (data) => {
            socket.emit('data', data);
        });
        
        log('Connected to terminal ' + term.pid);
        
        socket.on('data', onData);
        socket.on('resize', onResize);
        socket.on('disconnect', onDisconnect);
    }
    
    const onDisconnect = () => {
        term.kill();
        log(`Closed terminal ${term.pid}`);
        
        socket.removeListener('resize', onResize);
        socket.removeListener('data', onData);
        socket.removeListener('terminal', onTerminal);
        socket.removeListener('disconnect', onDisconnect);
    };
}

