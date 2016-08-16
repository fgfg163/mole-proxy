Mole Proxy
==========

作用：将本地监听端口映射到一台远端服务器。

Prupose: Map a local listening port to a remote server.

使用场景例子：本地使用webpack启动了一个dev server，想用手机调试，直接通过IP访问必须在同一个局域网，而且每次还必须确认IP。

Example Use case: Start up a local dev server using webpack. Debuging directly through IP on a phone would be inconvient as devices has to be in the same LAN.

基本使用方法
------------

 1. 服务端安装：`npm install -g mole-proxy`
 2. 服务端运行：`mole-proxy server` 或 `forever start $(which mole-proxy) server`
 3. 本地安装：`npm install -g mole-proxy`
 4. 本地启动通道：`mole-proxy my-domain-name.com 8080 8123`
 5. 在本地8080端口启动测试服务器
 6. 通过my-domain-name.com:8123访问测试服务器

Basic usage steps
-----------------

 1. Server side install: `npm install -g mole-proxy`
 2. Server side start up: `mole-proxy server` or `forever start $(which mole-proxy) server`
 3. Local install: `npm install -g mole-proxy`
 4. Local tunnel start up: `mole-proxy my-domain-name.com 8080 8123`
 5. Start up local dev server on port 8080
 6. Access dev server with my-domain-name.com:8123