/* 校园通 · 内网共享服务
 *
 * 作用：把 app 目录以只读方式发布到局域网，让手机连同一个 WiFi 就能打开同一个应用。
 *
 * 为什么不用 HttpListener：在 Windows 上绑定非 localhost 前缀需要管理员权限（URL ACL），
 * 而本程序以 asInvoker 运行。TcpListener 直接监听套接字，普通权限即可，因此手写这个极简服务。
 * 特性：只支持 GET/HEAD、只读、带目录穿越防护、每个连接处理完即关闭。
 *
 * 注意：本机 csc 只支持 C# 5，未使用字符串插值、?.、表达式成员等新语法。
 */
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace CampusKit
{
    internal sealed class LanServer
    {
        private static readonly Dictionary<string, string> Mime =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" },
            { ".js", "application/javascript; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".webmanifest", "application/manifest+json; charset=utf-8" },
            { ".png", "image/png" },
            { ".jpg", "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".gif", "image/gif" },
            { ".svg", "image/svg+xml" },
            { ".ico", "image/x-icon" },
            { ".woff", "font/woff" },
            { ".woff2", "font/woff2" },
            { ".txt", "text/plain; charset=utf-8" },
            { ".md", "text/plain; charset=utf-8" }
        };

        private readonly string root;
        private TcpListener listener;
        private Thread thread;
        private volatile bool running;

        public int Port { get; private set; }
        public string Url { get; private set; }
        public bool Running { get { return running; } }

        public LanServer(string rootDir)
        {
            root = Path.GetFullPath(rootDir).TrimEnd(Path.DirectorySeparatorChar);
        }

        public bool Start()
        {
            try
            {
                listener = new TcpListener(IPAddress.Any, 0);   // 端口交给系统分配，避免冲突
                listener.Start();
                Port = ((IPEndPoint)listener.LocalEndpoint).Port;

                string ip = LocalIPv4();
                if (ip == null)
                {
                    listener.Stop();
                    return false;
                }
                Url = "http://" + ip + ":" + Port + "/";
                running = true;
                thread = new Thread(new ThreadStart(Loop));
                thread.IsBackground = true;
                thread.Start();
                return true;
            }
            catch (Exception)
            {
                try { if (listener != null) listener.Stop(); } catch (Exception) { }
                running = false;
                return false;
            }
        }

        public void Stop()
        {
            running = false;
            try { if (listener != null) listener.Stop(); } catch (Exception) { }
        }

        private void Loop()
        {
            while (running)
            {
                TcpClient client;
                try { client = listener.AcceptTcpClient(); }
                catch (Exception) { if (!running) return; continue; }

                TcpClient c = client;
                ThreadPool.QueueUserWorkItem(delegate { Handle(c); });
            }
        }

        private void Handle(TcpClient client)
        {
            try
            {
                using (client)
                {
                    client.ReceiveTimeout = 6000;
                    client.SendTimeout = 15000;
                    NetworkStream ns = client.GetStream();

                    string header = ReadHeader(ns);
                    if (header == null) return;

                    string[] lines = header.Split(new string[] { "\r\n" }, StringSplitOptions.None);
                    string[] parts = lines[0].Split(' ');
                    if (parts.Length < 2) return;

                    string method = parts[0].ToUpperInvariant();
                    if (method != "GET" && method != "HEAD")
                    {
                        Write(ns, 405, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("405"), true);
                        return;
                    }

                    string target = parts[1];
                    int q = target.IndexOf('?');
                    if (q >= 0) target = target.Substring(0, q);
                    try { target = Uri.UnescapeDataString(target); }
                    catch (Exception) { }
                    if (target.Length == 0 || target == "/") target = "/index.html";

                    string rel = target.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                    string full = Path.GetFullPath(Path.Combine(root, rel));
                    if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                    {
                        Write(ns, 403, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("403 Forbidden"), true);
                        return;
                    }
                    if (Directory.Exists(full)) full = Path.Combine(full, "index.html");
                    if (!File.Exists(full))
                    {
                        Write(ns, 404, "text/plain; charset=utf-8", Encoding.UTF8.GetBytes("404 Not Found"), true);
                        return;
                    }

                    byte[] body = File.ReadAllBytes(full);
                    Write(ns, 200, MimeFor(full), body, method == "GET");
                }
            }
            catch (Exception) { }
        }

        private static string ReadHeader(NetworkStream ns)
        {
            MemoryStream ms = new MemoryStream();
            byte[] one = new byte[1];
            int total = 0;
            while (total < 16384)
            {
                int n;
                try { n = ns.Read(one, 0, 1); }
                catch (Exception) { return null; }
                if (n <= 0) break;
                ms.WriteByte(one[0]);
                total++;
                if (total >= 4)
                {
                    byte[] b = ms.GetBuffer();
                    if (b[total - 4] == 13 && b[total - 3] == 10 && b[total - 2] == 13 && b[total - 1] == 10)
                        return Encoding.UTF8.GetString(b, 0, total);
                }
            }
            return total > 0 ? Encoding.UTF8.GetString(ms.GetBuffer(), 0, total) : null;
        }

        private static string MimeFor(string path)
        {
            string ext = Path.GetExtension(path);
            string m;
            if (ext != null && Mime.TryGetValue(ext, out m)) return m;
            return "application/octet-stream";
        }

        private static void Write(NetworkStream ns, int code, string mime, byte[] body, bool sendBody)
        {
            string status = code == 200 ? "OK"
                          : code == 404 ? "Not Found"
                          : code == 403 ? "Forbidden"
                          : code == 405 ? "Method Not Allowed"
                          : "OK";
            int length = body == null ? 0 : body.Length;

            StringBuilder sb = new StringBuilder();
            sb.Append("HTTP/1.1 ").Append(code).Append(' ').Append(status).Append("\r\n");
            sb.Append("Content-Type: ").Append(mime).Append("\r\n");
            sb.Append("Content-Length: ").Append(length).Append("\r\n");
            sb.Append("Cache-Control: no-store\r\n");
            sb.Append("Connection: close\r\n\r\n");

            byte[] head = Encoding.ASCII.GetBytes(sb.ToString());
            ns.Write(head, 0, head.Length);
            if (sendBody && body != null && length > 0) ns.Write(body, 0, length);
            try { ns.Flush(); } catch (Exception) { }
        }

        /// <summary>取本机用于局域网访问的 IPv4 地址（优先无线网卡 / 有线网卡）</summary>
        public static string LocalIPv4()
        {
            try
            {
                NetworkInterface[] nics = NetworkInterface.GetAllNetworkInterfaces();
                string fallback = null;
                for (int i = 0; i < nics.Length; i++)
                {
                    NetworkInterface ni = nics[i];
                    if (ni.OperationalStatus != OperationalStatus.Up) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    if (ni.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;

                    UnicastIPAddressInformationCollection addrs = ni.GetIPProperties().UnicastAddresses;
                    for (int j = 0; j < addrs.Count; j++)
                    {
                        IPAddress a = addrs[j].Address;
                        if (a.AddressFamily != AddressFamily.InterNetwork) continue;
                        string s = a.ToString();
                        if (s.StartsWith("169.254.")) continue;   // APIPA 自动地址，手机连不上
                        if (s.StartsWith("127.")) continue;

                        if (ni.NetworkInterfaceType == NetworkInterfaceType.Wireless80211 ||
                            ni.NetworkInterfaceType == NetworkInterfaceType.Ethernet)
                            return s;
                        if (fallback == null) fallback = s;
                    }
                }
                return fallback;
            }
            catch (Exception) { return null; }
        }
    }
}
