package com.campushub.app;

import android.content.res.AssetManager;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.HashMap;
import java.util.Map;

/**
 * 极简只读静态服务：把 assets/{@code root} 通过 http://127.0.0.1:随机端口 发布。
 *
 * 为什么不直接用 file:///android_asset：
 *   file:// 属于「不安全来源」，localStorage 行为受限、Service Worker 被禁用、
 *   设备定位会被拒绝。走 127.0.0.1 后即为「安全上下文」，与正式网站一致。
 *
 * 只支持 GET、只读、带路径约束，不监听外部网卡。
 */
public class AssetServer {

    private static final Map<String, String> MIME = new HashMap<String, String>();

    static {
        MIME.put("html", "text/html; charset=utf-8");
        MIME.put("css", "text/css; charset=utf-8");
        MIME.put("js", "application/javascript; charset=utf-8");
        MIME.put("json", "application/json; charset=utf-8");
        MIME.put("webmanifest", "application/manifest+json; charset=utf-8");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("gif", "image/gif");
        MIME.put("svg", "image/svg+xml");
        MIME.put("ico", "image/x-icon");
        MIME.put("txt", "text/plain; charset=utf-8");
        MIME.put("md", "text/plain; charset=utf-8");
    }

    private final AssetManager assets;
    private final String root;
    private ServerSocket server;
    private Thread thread;
    private volatile boolean running;
    private int port;

    public AssetServer(AssetManager assets, String root) {
        this.assets = assets;
        this.root = root;
    }

    public int getPort() {
        return port;
    }

    public void start() throws IOException {
        // 只绑定回环地址，端口交给系统分配
        server = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
        port = server.getLocalPort();
        running = true;
        thread = new Thread(new Runnable() {
            public void run() {
                loop();
            }
        });
        thread.setDaemon(true);
        thread.start();
    }

    public void stop() {
        running = false;
        try {
            if (server != null) server.close();
        } catch (IOException e) {
            // 忽略
        }
    }

    private void loop() {
        while (running) {
            final Socket sock;
            try {
                sock = server.accept();
            } catch (IOException e) {
                if (!running) return;
                continue;
            }
            // 每个连接独立线程：浏览器会预开空闲连接，若在 accept 线程里串行处理，
            // 一条不发请求的连接会把后续请求全部堵住（表现为首次加载卡住）
            Thread t = new Thread(new Runnable() {
                public void run() {
                    handle(sock);
                }
            });
            t.setDaemon(true);
            t.start();
        }
    }

    private void handle(Socket sock) {
        try {
            sock.setSoTimeout(3000);
            String header = readHeader(sock.getInputStream());
            if (header == null) {
                sock.close();
                return;
            }

            String path = "/index.html";
            String[] parts = header.split(" ");
            if (parts.length >= 2) path = parts[1];
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            if (path.length() == 0 || path.equals("/")) path = "/index.html";

            byte[] body = readAsset(path);
            OutputStream out = sock.getOutputStream();
            if (body == null) {
                byte[] msg = "404 Not Found".getBytes("UTF-8");
                out.write(("HTTP/1.1 404 Not Found\r\n"
                        + "Content-Type: text/plain; charset=utf-8\r\n"
                        + "Content-Length: " + msg.length + "\r\n"
                        + "Connection: close\r\n\r\n").getBytes("US-ASCII"));
                out.write(msg);
            } else {
                out.write(("HTTP/1.1 200 OK\r\n"
                        + "Content-Type: " + mimeOf(path) + "\r\n"
                        + "Content-Length: " + body.length + "\r\n"
                        + "Cache-Control: no-store\r\n"
                        + "Connection: close\r\n\r\n").getBytes("US-ASCII"));
                out.write(body);
            }
            out.flush();
            sock.close();
        } catch (Exception e) {
            try {
                sock.close();
            } catch (IOException x) {
                // 忽略
            }
        }
    }

    /** 从 assets 读取文件；不存在或越界返回 null */
    private byte[] readAsset(String path) {
        String clean = path.replace('\\', '/');
        while (clean.startsWith("/")) clean = clean.substring(1);
        if (clean.contains("..")) return null;
        String assetPath = root + "/" + clean;
        InputStream in = null;
        try {
            in = assets.open(assetPath);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return bos.toByteArray();
        } catch (IOException e) {
            return null;
        } finally {
            if (in != null) {
                try {
                    in.close();
                } catch (IOException e) {
                    // 忽略
                }
            }
        }
    }

    private static String mimeOf(String path) {
        int dot = path.lastIndexOf('.');
        if (dot >= 0) {
            String m = MIME.get(path.substring(dot + 1).toLowerCase());
            if (m != null) return m;
        }
        return "application/octet-stream";
    }

    /** 读到 HTTP 头结束（\r\n\r\n）为止 */
    private static String readHeader(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        int b;
        int state = 0;
        while ((b = in.read()) >= 0) {
            bos.write(b);
            if (b == '\r' && (state == 0 || state == 2)) {
                state++;
            } else if (b == '\n' && (state == 1 || state == 3)) {
                state++;
                if (state == 4) break;
            } else {
                state = 0;
            }
            if (bos.size() > 8192) break;
        }
        if (bos.size() == 0) return null;
        return new String(bos.toByteArray(), "UTF-8");
    }
}
